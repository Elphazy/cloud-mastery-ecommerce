"use client";

import { ProductType } from "../types/ProductType";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addToCartApi,
  deleteCustomer,
  deleteOrder,
  getCustomers,
  getOrders,
  modifyCartApi,
  removeCartItemApi,
  getCartFromApi,
} from "../api";

type CartItem = ProductType & { cartQuantity: number };

type Session = {
  sessionId: string;
  name: string;
  phone: string;
  location: string;
  createdAt?: number;
} | null;

type ShopContextType = {
  cartItems: CartItem[];
  session: Session;
  selectedCustomerId: string;
  setSelectedCustomerId: React.Dispatch<React.SetStateAction<string>>;
  addToCart: (product: ProductType) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  resetShopState: () => Promise<void>;
  cartCount: number;
  cartTotal: number;
};

const ShopContext = createContext<ShopContextType | null>(null);

const CART_STORAGE_KEY = "shop-cart-items";
const SESSION_STORAGE_KEY = "hazel-session";
const CUSTOMER_STORAGE_KEY = "shop-selected-customer-id";
const LOCAL_CART_STORAGE_KEY = "shop-cart-items-local";
const LOCAL_SESSION_STORAGE_KEY = "hazel-session-local";
const LOCAL_CUSTOMER_STORAGE_KEY = "shop-selected-customer-id-local";
const LEGACY_LOCAL_CUSTOMER_STORAGE_KEY = CUSTOMER_STORAGE_KEY;

/** Read session from sessionStorage (cleared on tab/refresh). */
function readSession(): Session {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      sessionStorage.getItem(SESSION_STORAGE_KEY) ||
      localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    
    // Check if session is older than 20 minutes
    if (parsed.createdAt && Date.now() - parsed.createdAt > 20 * 60 * 1000) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(CART_STORAGE_KEY);
      sessionStorage.removeItem(CUSTOMER_STORAGE_KEY);
      localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
      localStorage.removeItem(LOCAL_CART_STORAGE_KEY);
      localStorage.removeItem(LOCAL_CUSTOMER_STORAGE_KEY);
      localStorage.removeItem(LEGACY_LOCAL_CUSTOMER_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [session, setSession] = useState<Session>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // ── Fast hydration loop: keep UI in sync with sessionStorage changes ──
  const hydrateFromStorage = useCallback(() => {
      const sess = readSession();
      setSession(sess);

      const currentCart = sessionStorage.getItem(CART_STORAGE_KEY);
      const fallbackCart = localStorage.getItem(LOCAL_CART_STORAGE_KEY);
      const cartRaw = currentCart || fallbackCart;
      if (cartRaw) {
        try {
          const parsed = JSON.parse(cartRaw);
          if (Array.isArray(parsed)) {
            setCartItems(parsed);
          }
        } catch {
          // Ignore malformed storage payloads
        }
      } else {
        setCartItems((prev) => (prev.length ? [] : prev));
      }

      const aid =
        sess?.sessionId || sessionStorage.getItem("agent-session-id") || null;
      setActiveSessionId(aid);

      const storedCustomerId =
        sessionStorage.getItem(CUSTOMER_STORAGE_KEY) ||
        localStorage.getItem(LOCAL_CUSTOMER_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_LOCAL_CUSTOMER_STORAGE_KEY) ||
        "";
      if (storedCustomerId) {
        setSelectedCustomerId(storedCustomerId);
      }
  }, []);

// 1. Run hydration ONCE on mount, not on a 100ms loop
useEffect(() => {
  hydrateFromStorage();
  
  // Optional: Listen for cross-tab changes natively without a loop
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === CART_STORAGE_KEY) hydrateFromStorage();
    if (e.key === SESSION_STORAGE_KEY) hydrateFromStorage();
  };
  const handleSessionChange = () => hydrateFromStorage();
  window.addEventListener("storage", handleStorageChange);
  window.addEventListener("hazel-session-changed", handleSessionChange);
  
  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener("hazel-session-changed", handleSessionChange);
  };
}, [hydrateFromStorage]);


// 2. Safely merge API data without fighting sessionStorage
useEffect(() => {
  if (!activeSessionId) return;

  const syncFromApi = async () => {
    try {
      const res = await getCartFromApi(activeSessionId);
      if (!res.success || !res.cart.items) return;

      setCartItems((prev) => {
        // If the backend has items, but our local state doesn't, accept the backend!
        const merged = [...prev];
        let stateChanged = false;

        for (const apiItem of res.cart.items) {
          const existing = merged.find((i) => i.id === apiItem.productId);
          if (existing) {
            if (existing.cartQuantity !== apiItem.quantity) {
              existing.cartQuantity = apiItem.quantity;
              stateChanged = true;
            }
          } else {
            merged.push({
              id: apiItem.productId,
              name: apiItem.productName,
              unitCost: String(apiItem.unitCost),
              cartQuantity: apiItem.quantity,
              category: "",
              imageUrl: "",
              quantity: 9999,
              totalCost: String(apiItem.lineTotalKes),
            } as unknown as CartItem);
            stateChanged = true;
          }
        }
        
        // Only trigger a React update if something actually changed
        return stateChanged ? merged : prev;
      });
    } catch {
      // Silently ignore network errors
    }
  };

  syncFromApi();
  const interval = setInterval(syncFromApi, 2000);
  return () => clearInterval(interval);
}, [activeSessionId]);

  // ── Active Session Expiry Check ──
  useEffect(() => {
    const checkExpiry = () => {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.createdAt && Date.now() - parsed.createdAt > 20 * 60 * 1000) {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          sessionStorage.removeItem(CART_STORAGE_KEY);
          setSession(null);
          setCartItems([]);
          
          // Force reload to completely reset UI state and redirect to form
          window.location.reload();
        }
      } catch {}
    };

    // Check every minute
    const interval = setInterval(checkExpiry, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Persist cart to sessionStorage whenever it changes ──
  useEffect(() => {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    localStorage.setItem(LOCAL_CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    if (selectedCustomerId) {
      sessionStorage.setItem(CUSTOMER_STORAGE_KEY, selectedCustomerId);
      localStorage.setItem(LOCAL_CUSTOMER_STORAGE_KEY, selectedCustomerId);
    } else {
      sessionStorage.removeItem(CUSTOMER_STORAGE_KEY);
      localStorage.removeItem(LOCAL_CUSTOMER_STORAGE_KEY);
      localStorage.removeItem(LEGACY_LOCAL_CUSTOMER_STORAGE_KEY);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    if (session) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  }, [session]);

  // ── Cart mutation helpers ──

  const addToCart = useCallback(
    (product: ProductType) => {
      setCartItems((prev) => {
        const existing = prev.find((item) => item.id === product.id);
        const newQuantity = existing
          ? Math.min(existing.cartQuantity + 1, product.quantity)
          : 1;

        // Fire-and-forget to Python cart service
        if (session?.sessionId) {
          addToCartApi({
            sessionId: session.sessionId,
            productId: product.id,
            productName: product.name,
            unitCost: Number(product.unitCost),
            quantity: newQuantity,
          }).catch(() => {}); // Don't block UI on network error
        }

        if (existing) {
          return prev.map((item) =>
            item.id === product.id
              ? { ...item, cartQuantity: newQuantity }
              : item
          );
        }
        return [...prev, { ...product, cartQuantity: 1 }];
      });
    },
    [session]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      if (session?.sessionId) {
        removeCartItemApi(session.sessionId, productId).catch(() => {});
      }
      setCartItems((prev) => prev.filter((item) => item.id !== productId));
    },
    [session]
  );

  const updateCartQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (session?.sessionId) {
        if (quantity <= 0) {
          removeCartItemApi(session.sessionId, productId).catch(() => {});
        } else {
          modifyCartApi({
            sessionId: session.sessionId,
            productId,
            quantity,
          }).catch(() => {});
        }
      }

      setCartItems((prev) =>
        prev
          .map((item) => {
            if (item.id !== productId) return item;
            return {
              ...item,
              cartQuantity: Math.max(1, Math.min(quantity, item.quantity)),
            };
          })
          .filter((item) => item.cartQuantity > 0)
      );
    },
    [session]
  );

  const clearCart = useCallback(() => {
    setCartItems([]);
    sessionStorage.removeItem(CART_STORAGE_KEY);
    localStorage.removeItem(LOCAL_CART_STORAGE_KEY);
  }, []);

  const resetShopState = useCallback(() => {
    const normalizePhone = (value: string) => {
      const digits = (value || "").replace(/\D/g, "");
      if (!digits) return "";
      if (digits.startsWith("254") && digits.length === 12) {
        return `0${digits.slice(3)}`;
      }
      if (digits.length === 9) {
        return `0${digits}`;
      }
      return digits;
    };

    const cleanupRemoteCustomer = async () => {
      const sessionPhone = normalizePhone(session?.phone || "");
      if (!sessionPhone) return;

      try {
        const response = await getCustomers();
        const customerList = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        const idsToDelete = new Set<string>();

        customerList.forEach((customer: any) => {
          const phoneMatches = normalizePhone(customer?.phone || "") === sessionPhone;
          const isSessionGenerated = String(customer?.email || "").endsWith("@soko.user");
          if (phoneMatches && isSessionGenerated && customer?.id) {
            idsToDelete.add(customer.id);
          }
        });

        if (selectedCustomerId) {
          idsToDelete.add(selectedCustomerId);
        }

        if (idsToDelete.size > 0) {
          const ordersResponse = await getOrders();
          const orderList = Array.isArray(ordersResponse?.data)
            ? ordersResponse.data
            : Array.isArray(ordersResponse)
              ? ordersResponse
              : [];

          const orderIdsToDelete = orderList
            .filter((order: any) => idsToDelete.has(order?.customerId))
            .map((order: any) => order?.id)
            .filter(Boolean);

          await Promise.allSettled(
            orderIdsToDelete.map((orderId: string) => deleteOrder(orderId)),
          );
        }

        await Promise.allSettled(
          Array.from(idsToDelete).map((id) => deleteCustomer(id)),
        );
      } catch {
        // Best effort cleanup; reset should still continue.
      }
    };

    const runReset = async () => {
      await cleanupRemoteCustomer();

    setCartItems([]);
    setSession(null);
    setActiveSessionId(null);
    setSelectedCustomerId("");

    sessionStorage.clear();
    localStorage.clear();

    window.location.assign("/shop");
    };

    return runReset();
  }, [selectedCustomerId, session]);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.cartQuantity, 0),
    [cartItems]
  );

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + Number(item.unitCost || 0) * item.cartQuantity,
        0
      ),
    [cartItems]
  );

  const value: ShopContextType = {
    cartItems,
    session,
    selectedCustomerId,
    setSelectedCustomerId,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    resetShopState,
    cartCount,
    cartTotal,
  };

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error("useShop must be used within ShopProvider");
  }
  return context;
}
