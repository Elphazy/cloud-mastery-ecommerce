"use client";

import { useState } from "react";
import { createSession } from "../api";

interface OnboardingFormProps {
  onComplete: (session: { sessionId: string; name: string; phone: string; location: string }) => void;
}

export default function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Basic validation
    if (!name.trim() || !phone.trim() || !location.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (!/^(\+?254|0)[17]\d{8}$/.test(phone.replace(/\s/g, ""))) {
      setError("Please enter a valid Kenyan phone number (e.g. 0712 345 678).");
      return;
    }

    setLoading(true);
    try {
      const sessionId = crypto.randomUUID();
      await createSession({ sessionId, name: name.trim(), phone: phone.trim(), location: location.trim() });

      // Persist locally first. The canonical backend session ID is synced once
      // the chat SDK exposes the real agent session ID.
      const session = { sessionId, name: name.trim(), phone: phone.trim(), location: location.trim(), createdAt: Date.now() };
      sessionStorage.setItem("hazel-session", JSON.stringify(session));

      window.dispatchEvent(new Event("hazel-session-changed"));

      onComplete(session);
    } catch {
      setError("Couldn't connect to chat service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#eeeae6",
        borderRadius: "16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "28px 24px",
        boxSizing: "border-box",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "12px",
          }}
        >
          <img width="62" height="22" src="/logo.png" alt="SokoAI Logo" />
        </div>
        <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 600, color: "#1f2937" }}>
          Before we start
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.5 }}>
          SokoAI needs a few details to help you shop and process your order.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={labelStyle}>Full name</label>
          <input
            type="text"
            placeholder="e.g. Laura Wangari"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            disabled={loading}
          />
        </div>

        <div>
          <label style={labelStyle}>Phone number</label>
          <input
            type="tel"
            placeholder="e.g. 0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inputStyle}
            disabled={loading}
          />
        </div>

        <div>
          <label style={labelStyle}>Delivery area</label>
          <input
            type="text"
            placeholder="e.g. Westlands, Nairobi"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
            disabled={loading}
          />
        </div>

        {error && (
          <p style={{ margin: 0, fontSize: "12px", color: "#b91c1c", lineHeight: 1.4 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "4px",
            padding: "12px",
            background: loading ? "#9a7a66" : "#4a3b32",
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.2s",
          }}
        >
          {loading ? "Starting chat…" : "Start chatting →"}
        </button>
      </form>

      <p style={{ margin: "14px 0 0", fontSize: "11px", color: "#9c8b7e", textAlign: "center" }}>
        Your details are only used for this session and never stored permanently.
      </p>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 500,
  color: "#4a3b32",
  marginBottom: "5px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1.5px solid #d6cfc9",
  borderRadius: "8px",
  fontSize: "13px",
  color: "#1f2937",
  background: "#ffffff",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};
