"use client";

import { useState } from "react";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import { amazonRequest, Badge, Card, inputClass, money, Pager, when } from "@/components/dashboard/amazon/shared";

// Overview, Pricing, Inventory, Orders, Finances and Sync tabs of the Amazon
// dashboard. All data comes from SmartSell's synced copy of the seller's own
// Amazon data (never hardcoded).

const marketName = (account, id) => account.marketplaces?.find((m) => m.id === id)?.name || id;

export function OverviewTab({ account }) {
  const listings = useApiData(`/api/amazon/listings?accountId=${account.id}&pageSize=1`);
  const orders = useApiData(`/api/amazon/orders?accountId=${account.id}&pageSize=1`);
  const sync = useApiData(`/api/amazon/sync?accountId=${account.id}`);
  const stat = (label, value) => (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
  return (
    <div className="space-y-5">
      <Card title="Account">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Seller ID</dt><dd className="break-all font-medium">{account.sellingPartnerId}</dd></div>
          <div><dt className="text-xs text-slate-500">Environment</dt><dd>{account.environmentLabel} · North America</dd></div>
          <div><dt className="text-xs text-slate-500">Connected</dt><dd>{when(account.connectedAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Last successful sync</dt><dd>{when(account.lastSuccessfulSyncAt)}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-slate-600">Marketplaces: {(account.marketplaces?.length ? account.marketplaces : account.marketplaceIds.map((id) => ({ id }))).map((m) => `${m.name || m.id}${m.currency ? ` (${m.currency})` : ""}`).join(", ") || "—"}</p>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stat("Listings", listings.body ? listings.body.total : "…")}
        {stat("Orders synced", orders.body ? orders.body.total : "…")}
        {stat("Current sync", sync.body ? sync.body.current?.status || "idle" : "…")}
      </div>
    </div>
  );
}

export function PricingTab({ account, onNotice }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const { body, error, loading, reload } = useApiData(`/api/amazon/pricing?accountId=${account.id}&page=${page}&q=${encodeURIComponent(q)}`);
  const save = async (item) => {
    setBusy(true);
    try {
      const data = await amazonRequest(`/api/amazon/listings/${item.id}`, { method: "PATCH", body: { price: Number(price), currency: item.currency || account.marketplaces?.find((m) => m.id === item.marketplaceId)?.currency } });
      onNotice({ type: "success", text: `Price sent to Amazon for ${item.sku} (${data.listing?.submission?.status === "live" ? "live" : "processing"}).` });
      setEditing(null);
      reload();
    } catch (err) {
      onNotice({ type: "error", text: err.message, issues: err.issues });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Your offer prices" actions={<input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search SKU, ASIN or title" className={`${inputClass} max-w-xs`} aria-label="Search prices" />}>
      <LoadState loading={loading && !body} error={error} empty={body && !body.items.length} emptyText="No listings with prices yet. Run a sync to import them." onRetry={reload} />
      {body?.items?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Item</th><th className="py-2 pr-4">Marketplace</th><th className="py-2 pr-4">Price</th><th className="py-2 pr-4">Status</th><th className="py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {body.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-4"><p className="font-medium text-slate-900">{item.title || item.sku}</p><p className="text-xs text-slate-500">{item.sku}{item.asin ? ` · ${item.asin}` : ""}</p></td>
                  <td className="py-2 pr-4">{marketName(account, item.marketplaceId)}</td>
                  <td className="py-2 pr-4">
                    {editing === item.id ? (
                      <span className="flex items-center gap-2">
                        <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputClass} w-28`} aria-label={`New price for ${item.sku}`} />
                        <button type="button" disabled={busy} onClick={() => save(item)} className="text-xs font-semibold text-indigo-600">{busy ? "Sending…" : "Save"}</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-xs text-slate-500">Cancel</button>
                      </span>
                    ) : (
                      money(item.price, item.currency)
                    )}
                  </td>
                  <td className="py-2 pr-4">{item.pending ? <Badge tone="amber">Sending</Badge> : item.priceStatus ? <Badge tone={item.priceStatus === "live" ? "green" : item.priceStatus === "failed" ? "red" : "amber"}>{item.priceStatus}</Badge> : <Badge>Synced</Badge>}</td>
                  <td className="py-2 text-right">
                    {account.writeEnabled && editing !== item.id && (
                      <button type="button" onClick={() => { setEditing(item.id); setPrice(item.price ?? ""); }} className="text-xs font-semibold text-indigo-600">Change price</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={body.page} pageSize={body.pageSize} total={body.total} onPage={setPage} />
        </div>
      )}
    </Card>
  );
}

export function InventoryTab({ account, onNotice }) {
  const { body, error, loading, reload } = useApiData(`/api/amazon/inventory?accountId=${account.id}`);
  const [editing, setEditing] = useState(null);
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (row) => {
    setBusy(true);
    try {
      await amazonRequest(`/api/amazon/listings/${row.id}`, { method: "PATCH", body: { quantity: Number(qty) } });
      onNotice({ type: "success", text: `Quantity for ${row.sku} sent to Amazon.` });
      setEditing(null);
      reload();
    } catch (err) {
      onNotice({ type: "error", text: err.message, issues: err.issues });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <LoadState loading={loading && !body} error={error} onRetry={reload} />
      {body && (
        <>
          <Card title="Seller-fulfilled (MFN)">
            {!body.merchantFulfilled.length ? (
              <p className="text-sm text-slate-500">No seller-fulfilled listings.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Item</th><th className="py-2 pr-4">Marketplace</th><th className="py-2 pr-4">Quantity</th><th className="py-2" /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {body.merchantFulfilled.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-4"><p className="font-medium">{row.title || row.sku}</p><p className="text-xs text-slate-500">{row.sku}</p></td>
                        <td className="py-2 pr-4">{marketName(account, row.marketplaceId)}</td>
                        <td className="py-2 pr-4">
                          {editing === row.id ? (
                            <span className="flex items-center gap-2">
                              <input type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputClass} w-24`} aria-label={`Quantity for ${row.sku}`} />
                              <button type="button" disabled={busy || !/^\d+$/.test(String(qty))} onClick={() => save(row)} className="text-xs font-semibold text-indigo-600 disabled:opacity-40">{busy ? "Sending…" : "Save"}</button>
                              <button type="button" onClick={() => setEditing(null)} className="text-xs text-slate-500">Cancel</button>
                            </span>
                          ) : (
                            <>{row.quantity ?? "—"} {row.quantityStatus && <Badge tone={row.quantityStatus === "failed" ? "red" : row.quantityStatus === "live" ? "green" : "amber"}>{row.quantityStatus}</Badge>}</>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {account.writeEnabled && editing !== row.id && <button type="button" onClick={() => { setEditing(row.id); setQty(row.quantity ?? 0); }} className="text-xs font-semibold text-indigo-600">Set quantity</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Fulfilled by Amazon (FBA)">
            <p className="mb-3 text-xs text-slate-500">Read only: Amazon manages FBA quantities in its fulfillment centers. To change them, send or remove inventory in Seller Central.</p>
            {!body.fba.length ? (
              <p className="text-sm text-slate-500">No FBA inventory.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Item</th><th className="py-2 pr-4">Fulfillable</th><th className="py-2 pr-4">Inbound</th><th className="py-2 pr-4">Reserved</th><th className="py-2 pr-4">Unfulfillable</th><th className="py-2">Total</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {body.fba.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-4"><p className="font-medium">{row.title || row.sku}</p><p className="text-xs text-slate-500">{row.sku}{row.fnSku ? ` · ${row.fnSku}` : ""}</p></td>
                        <td className="py-2 pr-4">{row.fulfillable ?? "—"}</td>
                        <td className="py-2 pr-4">{row.inbound ?? "—"}</td>
                        <td className="py-2 pr-4">{row.reserved ?? "—"}</td>
                        <td className="py-2 pr-4">{row.unfulfillable ?? "—"}</td>
                        <td className="py-2">{row.totalQuantity ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const ORDER_STATUSES = ["", "PENDING", "UNSHIPPED", "PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED", "UNFULFILLABLE"];

export function OrdersTab({ account }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [marketplaceId, setMarketplaceId] = useState("");
  const { body, error, loading, reload } = useApiData(`/api/amazon/orders?accountId=${account.id}&page=${page}&status=${status}&marketplaceId=${marketplaceId}`);
  return (
    <Card
      title="Orders"
      actions={
        <div className="flex flex-wrap gap-2">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputClass} aria-label="Order status">
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s ? s.replaceAll("_", " ").toLowerCase() : "All statuses"}</option>)}
          </select>
          <select value={marketplaceId} onChange={(e) => { setMarketplaceId(e.target.value); setPage(1); }} className={inputClass} aria-label="Marketplace">
            <option value="">All marketplaces</option>
            {account.marketplaceIds.map((id) => <option key={id} value={id}>{marketName(account, id)}</option>)}
          </select>
        </div>
      }
    >
      <p className="mb-3 text-xs text-slate-500">SmartSell does not request or store buyer names, addresses or contact details.</p>
      <LoadState loading={loading && !body} error={error} empty={body && !body.items.length} emptyText="No Amazon orders synced yet." onRetry={reload} />
      {body?.items?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Order</th><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Fulfilled by</th><th className="py-2 pr-4">Items</th><th className="py-2">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {body.items.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="py-2 pr-4 font-mono text-xs">{o.orderId}<p className="font-sans text-slate-500">{marketName(account, o.marketplaceId)}</p></td>
                  <td className="py-2 pr-4">{when(o.createdTime)}</td>
                  <td className="py-2 pr-4"><Badge tone={o.status === "SHIPPED" ? "green" : o.status === "CANCELLED" ? "red" : "amber"}>{(o.status || "—").replaceAll("_", " ").toLowerCase()}</Badge></td>
                  <td className="py-2 pr-4">{o.fulfilledBy === "AMAZON" ? "Amazon (FBA)" : o.fulfilledBy === "MERCHANT" ? "You (MFN)" : "—"}</td>
                  <td className="py-2 pr-4">
                    <ul className="space-y-0.5">
                      {o.items.map((i) => <li key={i.orderItemId}>{i.quantityOrdered}× {i.sellerSku || i.asin}{i.unitPrice ? ` @ ${money(i.unitPrice.amount, i.unitPrice.currency)}` : ""}{i.cancelled ? " (cancelled)" : ""}</li>)}
                    </ul>
                  </td>
                  <td className="py-2">{o.total ? money(o.total.amount, o.total.currency) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={body.page} pageSize={body.pageSize} total={body.total} onPage={setPage} />
        </div>
      )}
    </Card>
  );
}

export function FinancesTab({ account }) {
  const [kind, setKind] = useState("transaction");
  const [page, setPage] = useState(1);
  const { body, error, loading, reload } = useApiData(`/api/amazon/finances?accountId=${account.id}&kind=${kind}&page=${page}`);
  return (
    <div className="space-y-5">
      {body?.totals?.length > 0 && (
        <Card title="Totals by type">
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {body.totals.map((t) => <li key={`${t.currency}-${t.type}`} className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-slate-500">{t.type}</span><span className="float-right font-semibold">{money(t.amount, t.currency)}</span></li>)}
          </ul>
          <p className="mt-3 text-xs text-slate-500">{body.netProfitNote}</p>
        </Card>
      )}
      <Card
        title={kind === "transaction" ? "Transactions" : "Settlements"}
        actions={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {[["transaction", "Transactions"], ["event_group", "Settlements"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setKind(k); setPage(1); }} className={`rounded-md px-3 py-1 ${kind === k ? "bg-white shadow-sm" : "text-slate-600"}`}>{label}</button>
            ))}
          </div>
        }
      >
        <LoadState loading={loading && !body} error={error} empty={body && !body.items.length} emptyText="No Amazon financial data synced yet." onRetry={reload} />
        {body?.items?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">{kind === "transaction" ? "Type" : "Status"}</th><th className="py-2 pr-4">{kind === "transaction" ? "Order" : "Transfer"}</th><th className="py-2">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {body.items.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-4">{when(e.postedDate || e.groupStart)}</td>
                    <td className="py-2 pr-4">{kind === "transaction" ? e.type || "—" : e.status || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{kind === "transaction" ? e.orderId || "—" : e.fundTransferStatus || "—"}</td>
                    <td className="py-2">{e.total ? money(e.total.amount, e.total.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={body.page} pageSize={body.pageSize} total={body.total} onPage={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}

const RESOURCE_LABEL = { marketplaces: "Marketplaces", listings: "Listings & prices", fbaInventory: "FBA inventory", orders: "Orders", transactions: "Transactions", eventGroups: "Settlements" };

export function SyncTab({ account, onNotice }) {
  const { body, error, loading, reload } = useApiData(`/api/amazon/sync?accountId=${account.id}`);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const data = await amazonRequest("/api/amazon/sync", { method: "POST", body: { accountId: account.id } });
      onNotice({ type: "success", text: data.run?.resumable ? "Sync started; it continues in the background." : `Sync ${data.job?.status}.` });
      reload();
    } catch (err) {
      onNotice({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };
  const job = (j) => (
    <li key={j.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium capitalize">{j.kind} sync</span>
        <Badge tone={j.status === "completed" ? "green" : j.status === "failed" || j.status === "cancelled" ? "red" : "amber"}>{j.status}</Badge>
      </div>
      <p className="text-xs text-slate-500">Started {when(j.startedAt || j.createdAt)} · Finished {when(j.finishedAt)}{j.error ? ` · ${j.error}` : ""}</p>
      <ul className="mt-2 flex flex-wrap gap-2 text-xs">
        {j.resources.map((r) => <li key={r.name}><Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "slate"}>{RESOURCE_LABEL[r.name] || r.name}: {r.status}{r.count ? ` (${r.count})` : ""}{r.error ? ` · ${r.error}` : ""}</Badge></li>)}
      </ul>
    </li>
  );
  return (
    <Card title="Sync activity" actions={<button type="button" disabled={busy} onClick={run} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? "Syncing…" : "Sync now"}</button>}>
      <p className="mb-3 text-xs text-slate-500">Amazon limits how fast orders and finances can be read, so a large sync can take several runs; it resumes automatically.</p>
      <LoadState loading={loading && !body} error={error} empty={body && !body.history.length} emptyText="No syncs yet." onRetry={reload} />
      {body?.history?.length > 0 && <ul className="space-y-2">{body.history.map(job)}</ul>}
    </Card>
  );
}
