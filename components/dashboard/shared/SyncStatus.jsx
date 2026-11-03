"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

function timeAgo(value) {
  if (!value) return null;
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleString();
}

// Shows when Shopify data was last copied into SmartSell and lets the user
// sync now. With autoSyncIfNever, a store that has never been synced is
// synced once automatically.
export default function SyncStatus({ hasStore, sync = [], onSynced, autoSyncIfNever = false }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const autoStarted = useRef(false);

  const runSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/shopify/sync", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      const errors = (data.results || []).flatMap((r) => r.errors || []);
      setMessage({
        type: response.ok && !errors.length ? "success" : "error",
        text: [data.message || "Sync failed.", ...errors].join(" "),
      });
      if (response.ok) {
        await onSynced?.();
      }
    } catch {
      setMessage({ type: "error", text: "Could not reach the server." });
    } finally {
      setSyncing(false);
    }
  };

  const neverSynced = sync.length > 0 && sync.some((s) => !s.lastSyncAt && !s.syncing);

  useEffect(() => {
    if (autoSyncIfNever && neverSynced && !autoStarted.current) {
      autoStarted.current = true;
      // Deferred so the state update happens outside the effect body.
      const timer = setTimeout(runSync, 0);
      return () => clearTimeout(timer);
    }
    // runSync is recreated each render; neverSynced is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncIfNever, neverSynced]);

  if (!hasStore) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No Shopify store connected.{" "}
        <Link href="/Panel/Ecommerce/Integration" className="font-semibold underline">
          Connect a store
        </Link>{" "}
        to see your data here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5 text-slate-600" aria-live="polite">
        {sync.map((s) => (
          <span key={s.storeId}>
            <span className="font-medium text-slate-800">{s.shop}</span>
            {" · "}
            {syncing || s.syncing
              ? "Syncing…"
              : s.lastSyncAt
                ? `Last synced ${timeAgo(s.lastSyncAt)}`
                : "Not synced yet"}
            {!syncing && s.lastSyncStatus && s.lastSyncStatus !== "success" && (
              <span className="text-red-600"> · {s.lastSyncError || "Last sync had errors"}</span>
            )}
          </span>
        ))}
        {message && (
          <span className={message.type === "success" ? "text-emerald-700" : "text-red-600"} role={message.type === "error" ? "alert" : undefined}>
            {message.text}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={runSync}
        disabled={syncing}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={14} className={syncing ? "animate-spin" : ""} aria-hidden="true" />
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
