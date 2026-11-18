"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import { Issues } from "@/components/dashboard/amazon/shared";
import ListingsTab from "@/components/dashboard/amazon/AmazonListings";
import { FinancesTab, InventoryTab, OrdersTab, OverviewTab, PricingTab, SyncTab } from "@/components/dashboard/amazon/AmazonTabs";

// Amazon section of the dashboard: one connected seller account at a time.
const TABS = [
  ["overview", "Overview"],
  ["listings", "Listings"],
  ["pricing", "Pricing"],
  ["inventory", "Inventory"],
  ["orders", "Orders"],
  ["finances", "Finances"],
  ["sync", "Sync activity"],
];

export default function AmazonDashboard() {
  const params = useSearchParams();
  const { body, error, loading, reload } = useApiData("/api/amazon/status");
  const [tab, setTab] = useState("overview");
  const [chosen, setChosen] = useState(params.get("accountId"));
  const [notice, setNotice] = useState(null);
  const accounts = body?.accounts || [];
  const account = accounts.find((a) => a.id === chosen) || accounts[0];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Amazon</h1>
          <p className="text-sm text-slate-500">Listings, prices, inventory, orders and finances for your Amazon seller account.</p>
        </div>
        {accounts.length > 1 && (
          <select value={account?.id} onChange={(e) => setChosen(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Amazon account">
            {accounts.map((a) => <option key={a.id} value={a.id}>Seller {a.sellingPartnerId} ({a.environmentLabel})</option>)}
          </select>
        )}
      </header>

      <LoadState loading={loading && !body} error={error} onRetry={reload} />

      {body && !account && (
        <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="font-semibold text-slate-900">No Amazon account connected</h2>
          <p className="mt-1 text-sm text-slate-500">{body.connectEnabled ? "Connect your Amazon seller account on the Integrations page." : "Amazon seller connections are coming soon."}</p>
          <Link href="/Panel/Ecommerce/Integration" className="mt-3 inline-block text-sm font-semibold text-indigo-600">Go to Integrations</Link>
        </section>
      )}

      {account?.reconnectRequired && (
        <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Amazon no longer accepts SmartSell&apos;s authorization for this seller. Syncing has stopped and your data is kept.{" "}
          {body.connectEnabled && <a href="/api/amazon/connect" className="font-semibold underline">Reconnect Amazon</a>}
        </div>
      )}
      {account?.environment === "sandbox" && (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Amazon Sandbox account: data here is Amazon&apos;s sample data, not a real seller&apos;s.</p>
      )}

      {notice && (
        <div role={notice.type === "error" ? "alert" : "status"} className={`mt-5 rounded-xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <div className="flex items-start justify-between gap-3">
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold">Dismiss</button>
          </div>
          <Issues issues={notice.issues} />
        </div>
      )}

      {account && !account.reconnectRequired && (
        <>
          <nav aria-label="Amazon sections" className="mt-6 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-5" key={`${account.id}-${tab}`}>
            {tab === "overview" && <OverviewTab account={account} />}
            {tab === "listings" && <ListingsTab account={account} onNotice={setNotice} />}
            {tab === "pricing" && <PricingTab account={account} onNotice={setNotice} />}
            {tab === "inventory" && <InventoryTab account={account} onNotice={setNotice} />}
            {tab === "orders" && <OrdersTab account={account} />}
            {tab === "finances" && <FinancesTab account={account} />}
            {tab === "sync" && <SyncTab account={account} onNotice={setNotice} />}
          </div>
        </>
      )}
    </div>
  );
}
