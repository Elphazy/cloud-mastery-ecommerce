import "./globals.css";
import "./chat-messenger-default.css";
import "./chat-messenger-overrides.css";
import ChatWidget from "./components/ChatWidget";
import Script from "next/script";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Soko Marketplace",
  description: "Standalone storefront application",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <ChatWidget />
        {/* Load the widget script after the page is interactive so it finds the custom elements in the DOM */}
        <Script
          src="/chat-messenger/chat-messenger.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
