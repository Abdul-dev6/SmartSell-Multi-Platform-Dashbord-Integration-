"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { apiErrorText } from "@/components/dashboard/shared/apiError";

// Connected Amazon seller accounts on the Integrations page: status, seller
// ID, authorized marketplaces, connection date, last successful sync, current
// sync, and Sync / Reconnect / Disconnect. Reconnect goes through Amazon's
// authorization again (same seller → same account record).

const when = (value) => (value ? new Date(value).toLocaleString() : "never");

async function send(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(apiErrorText(response, data, `Request failed (${response.status})`));
  return data;
}

export default function AmazonPanel({ status, onChanged, onSuccess, onError }) {
  const [busyId, setBusyId] = useState(null);
  const started = useRef(new Set());
  const accounts = useMemo(() => status?.accounts || [], [status]);

  // A queued sync (e.g. the initial import after connecting) would otherwise
  // wait for the daily cron: run it now, once per page view, as an awaited
  // request from the browser.
  useEffect(() => {
    const queued = accounts.find((a) => a.syncStatus === "queued" && !a.reconnectRequired && a.status === "active" && !started.current.has(a.id));
    if (!queued) return;
    started.current.add(queued.id);
    let active = true;
    send("/api/amazon/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: queued.id }) })
      .then(() => active && onChanged?.())
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accounts, onChanged]);

  if (!accounts.length) return null;

  const run = async (account, fn) => {
    setBusyId(account.id);
    try {
      await fn();
      await onChanged?.();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = (account) => {
    if (!window.confirm(`Disconnect Amazon seller ${account.sellingPartnerId}?\n\nSmartSell deletes this account and all of its synced Amazon data (listings, orders, inventory, finances). Your listings on Amazon are not changed. To remove SmartSell's access at Amazon too, open Seller Central → Apps and Services → Manage Your Apps.`)) return;
    run(account, async () => {
      const data = await send(`/api/amazon/accounts/${account.id}`, { method: "DELETE" });
      onSuccess(data.message);
    });
  };

  const sync = (account) =>
    run(account, async () => {
      const data = await send("/api/amazon/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: account.id }) });
      onSuccess(data.job?.status === "completed" ? "Amazon sync complete." : data.run?.resumable ? "Amazon sync started; it continues in the background." : `Amazon sync finished: ${data.job?.status || "unknown"}.`);
    });

  return (
    <section aria-labelledby="amazon-accounts-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Image src="/amazonsvg.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
        <h2 id="amazon-accounts-title" className="text-base font-semibold text-slate-900">
          Connected Amazon accounts
        </h2>
        {status?.environment === "sandbox" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Sandbox</span>}
      </div>
      <ul className="mt-3 space-y-3">
        {accounts.map((account) => {
          const busy = busyId === account.id;
          return (
            <li key={account.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              {account.reconnectRequired && (
                <p role="alert" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  Amazon no longer accepts SmartSell&apos;s authorization for this seller. Syncing has stopped; your synced data is kept. Reconnect to continue.
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium text-slate-800 break-all">
                    Seller {account.sellingPartnerId} <span className="text-xs text-slate-500">({account.environmentLabel}, North America)</span>
                  </p>
                  <p className={account.status === "active" ? "text-emerald-700" : "text-amber-700"}>
                    {account.reconnectRequired ? "Reconnect required" : account.status === "disconnecting" ? "Disconnecting… choose Disconnect again if this does not finish" : "Connected"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Marketplaces: {(account.marketplaces?.length ? account.marketplaces.map((m) => m.name || m.id) : account.marketplaceIds).join(", ") || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Connected {when(account.connectedAt)} · Last successful sync {when(account.lastSuccessfulSyncAt)}
                    {account.syncStatus ? ` · Sync ${account.syncStatus}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-medium">
                  {account.status === "active" && (
                    <>
                      <Link href={`/Panel/Ecommerce/Amazon?accountId=${account.id}`} className="text-indigo-600 hover:text-indigo-800">
                        Open Amazon dashboard
                      </Link>
                      <button type="button" disabled={busy} onClick={() => sync(account)} className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                        {busy ? "Working…" : "Sync now"}
                      </button>
                    </>
                  )}
                  {status?.connectEnabled && account.environment === "production" && (
                    <a href="/api/amazon/connect" className="text-indigo-600 hover:text-indigo-800">
                      Reconnect
                    </a>
                  )}
                  <button type="button" disabled={busy} onClick={() => disconnect(account)} className="text-red-600 hover:text-red-800 disabled:opacity-50">
                    Disconnect
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
