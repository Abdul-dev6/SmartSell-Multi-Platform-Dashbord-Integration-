"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Notifications are created on the server for every create/update/delete
// (success or failure). This provider loads them for the bell, and after any
// state-changing request from the panel fetches the new ones and shows them
// as toasts.

const NotificationsContext = createContext({ notifications: [], unread: 0, markAllRead: () => {}, refresh: () => {} });
export const useNotifications = () => useContext(NotificationsContext);

const TOAST_MS = 5000;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IGNORED = ["/api/notifications", "/api/auth/logout"];

function isPanelMutation(input, init) {
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!MUTATING.has(method)) return false;
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
  const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
  return path.startsWith("/api/") && !IGNORED.some((p) => path.startsWith(p));
}

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const newest = useRef(null);

  const load = useCallback(async ({ toast = false } = {}) => {
    try {
      const after = toast && newest.current ? `?after=${encodeURIComponent(newest.current)}` : "";
      const response = await fetch(`/api/notifications${after}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) return;
      const incoming = data.notifications || [];
      if (incoming[0]) newest.current = incoming[0].createdAt;
      setUnread(data.unread || 0);
      if (toast) {
        setNotifications((prev) => [...incoming, ...prev.filter((n) => !incoming.some((i) => i.id === n.id))].slice(0, 30));
        setToasts((prev) => [...prev, ...incoming.slice(0, 3).reverse()]);
        for (const n of incoming.slice(0, 3)) {
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), TOAST_MS);
        }
      } else {
        setNotifications(incoming);
      }
    } catch {
      // Network problem: the bell simply stays as it was.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // After each state-changing API call from the panel, show what happened.
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (isPanelMutation(input, init)) load({ toast: true });
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, [load]);

  const markAllRead = useCallback(async () => {
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications, unread, markAllRead, refresh: load }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.type === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : t.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{t.title}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-current opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </div>
            {t.message && <p className="mt-1 text-xs opacity-90">{t.message}</p>}
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}
