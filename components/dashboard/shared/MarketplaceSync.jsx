"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import SyncStatus from "@/components/dashboard/shared/SyncStatus";
import { apiErrorText } from "./apiError";

// eBay counterpart of SyncStatus: when eBay products were last imported, and
// an "Import from eBay" button. Accounts that were never imported are
// imported once automatically when autoSyncIfNever is set.
function EbaySyncStatus({ accounts = [], onSynced, autoSyncIfNever = false }) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const autoStarted = useRef(false);

  const runSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ebay/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => ({}));
      setMessage({ type: response.ok ? "success" : "error", text: apiErrorText(response, data, "eBay import failed.") });
      if (response.ok) await onSynced?.();
    } catch {
      setMessage({ type: "error", text: "Could not reach the server." });
    } finally {
      setSyncing(false);
    }
  };

  const active = accounts.filter((a) => a.status === "active");
  const neverSynced = active.length > 0 && active.some((a) => !a.lastSyncAt && !a.syncing);

  useEffect(() => {
    if (autoSyncIfNever && neverSynced && !autoStarted.current) {
      autoStarted.current = true;
      const timer = setTimeout(runSync, 0);
      return () => clearTimeout(timer);
    }
    // runSync is recreated each render; neverSynced is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncIfNever, neverSynced]);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5 text-slate-600" aria-live="polite">
        {accounts.map((a) => (
          <span key={a.accountId}>
            <span className="font-medium text-slate-800">eBay · {a.username}</span>
            {" · "}
            {a.status === "reauth_required" ? (
              <span className="text-amber-700">
                Reconnect required.{" "}
                <Link href="/Panel/Ecommerce/Integration" className="font-semibold underline">Reconnect eBay</Link>
              </span>
            ) : syncing || a.syncing ? (
              "Importing…"
            ) : a.lastSyncAt ? (
              `Last imported ${new Date(a.lastSyncAt).toLocaleString()}`
            ) : (
              "Not imported yet"
            )}
            {a.status === "active" && !a.setupReady && (
              <span className="text-amber-700">
                {" · "}
                <Link href="/Panel/Ecommerce/Integration" className="underline">Finish listing setup</Link>
              </span>
            )}
            {!syncing && a.lastSyncStatus && a.lastSyncStatus !== "success" && (
              <span className="text-red-600"> · {a.lastSyncError || "Last import had errors"}</span>
            )}
          </span>
        ))}
        {message && (
          <span className={message.type === "success" ? "text-emerald-700" : "text-red-600"} role={message.type === "error" ? "alert" : undefined}>
            {message.text}
          </span>
        )}
      </div>
      {active.length > 0 && (
        <button
          type="button"
          onClick={runSync}
          disabled={syncing}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} aria-hidden="true" />
          {syncing ? "Importing…" : "Import from eBay"}
        </button>
      )}
    </div>
  );
}

// Sync banners for every connected marketplace (body = /api/inventory response).
export default function MarketplaceSync({ body, onSynced, autoSyncIfNever = false }) {
  if (!body) return null;
  if (!body.hasStore && !body.hasEbay) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No marketplace connected.{" "}
        <Link href="/Panel/Ecommerce/Integration" className="font-semibold underline">
          Connect Shopify or eBay
        </Link>{" "}
        to see your data here.
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-3">
      {body.hasStore && <SyncStatus hasStore sync={body.sync} onSynced={onSynced} autoSyncIfNever={autoSyncIfNever} />}
      {body.hasEbay && <EbaySyncStatus accounts={body.ebaySync} onSynced={onSynced} autoSyncIfNever={autoSyncIfNever} />}
    </div>
  );
}
