"use client";

import { useEffect, useState } from "react";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import { amazonRequest, Badge, Card, inputClass, Issues, money, Pager, SUBMISSION_LABEL, SUBMISSION_TONE } from "@/components/dashboard/amazon/shared";

// Amazon listings: search, filters, pagination, create, edit, close and delete.
// Closing (quantity 0) makes a seller-fulfilled listing inactive but keeps it;
// deleting removes it from Amazon. Amazon's processing result is shown, not
// just whether the request was accepted.

const CONDITIONS = ["new_new", "new_open_box", "used_like_new", "used_very_good", "used_good", "used_acceptable", "refurbished_refurbished"];
const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function ListingForm({ account, listing, onClose, onSaved }) {
  const editing = Boolean(listing);
  const firstMarket = account.marketplaceIds[0] || "";
  const [form, setForm] = useState({
    sku: "",
    marketplaceId: listing?.marketplaceId || firstMarket,
    productType: listing?.productType || "",
    fulfillment: listing?.fulfillment || "MFN",
    title: listing?.title || "",
    brand: "",
    manufacturer: "",
    description: "",
    bullets: "",
    images: "",
    condition: listing?.conditionType || "new_new",
    identifierType: "upc",
    identifierValue: "",
    price: listing?.price ?? "",
    quantity: listing?.quantity ?? "",
    attributes: "",
  });
  const [typeQuery, setTypeQuery] = useState("");
  const [types, setTypes] = useState([]);
  const [requirements, setRequirements] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const currency = account.marketplaces?.find((m) => m.id === form.marketplaceId)?.currency;

  useEffect(() => {
    if (editing || !form.productType) return;
    let active = true;
    amazonRequest(`/api/amazon/product-types/${form.productType}?accountId=${account.id}&marketplaceId=${form.marketplaceId}`)
      .then((d) => active && setRequirements(d.requirements))
      .catch((err) => active && setError({ message: err.message }));
    return () => {
      active = false;
    };
  }, [editing, form.productType, form.marketplaceId, account.id]);

  const searchTypes = async () => {
    try {
      setTypes((await amazonRequest(`/api/amazon/product-types?accountId=${account.id}&marketplaceId=${form.marketplaceId}&q=${encodeURIComponent(typeQuery)}`)).productTypes);
    } catch (err) {
      setError({ message: err.message });
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    let attributes;
    if (form.attributes.trim()) {
      try {
        attributes = JSON.parse(form.attributes);
      } catch {
        setError({ message: "Extra attributes must be valid JSON." });
        return;
      }
    }
    const body = {};
    const put = (k, v) => {
      if (v !== "" && v !== undefined && !(Array.isArray(v) && !v.length)) body[k] = v;
    };
    if (!editing) {
      Object.assign(body, { accountId: account.id, sku: form.sku.trim(), marketplaceId: form.marketplaceId, productType: form.productType, fulfillment: form.fulfillment, condition: form.condition });
      if (form.identifierValue.trim()) body.identifier = { type: form.identifierType, value: form.identifierValue.trim() };
    }
    if (!editing || form.title !== (listing?.title || "")) put("title", form.title.trim());
    put("brand", form.brand.trim());
    put("manufacturer", form.manufacturer.trim());
    put("description", form.description.trim());
    put("bulletPoints", lines(form.bullets));
    put("images", lines(form.images));
    if (form.price !== "" && (!editing || Number(form.price) !== listing?.price)) Object.assign(body, { price: Number(form.price), currency });
    if (form.fulfillment === "MFN" && form.quantity !== "" && (!editing || Number(form.quantity) !== listing?.quantity)) body.quantity = Number(form.quantity);
    if (attributes) body.attributes = attributes;
    if (editing && !Object.keys(body).length) {
      setError({ message: "Change at least one field." });
      return;
    }
    setBusy(true);
    try {
      const data = editing
        ? await amazonRequest(`/api/amazon/listings/${listing.id}`, { method: "PATCH", body })
        : await amazonRequest("/api/amazon/listings", { method: "POST", body });
      onSaved(data.listing);
    } catch (err) {
      setError({ message: err.message, errors: err.errors, issues: err.issues });
    } finally {
      setBusy(false);
    }
  };

  const field = (label, input, hint) => (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="mt-1 block">{input}</span>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={editing ? "Edit Amazon listing" : "Create Amazon listing"} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
      <form onSubmit={submit} className="mt-8 w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{editing ? `Edit ${listing.sku}` : "Create Amazon listing"}</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-500">Close</button>
        </div>

        {!editing && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("Seller SKU", <input required value={form.sku} onChange={set("sku")} maxLength={40} className={inputClass} />)}
            {field(
              "Marketplace",
              <select value={form.marketplaceId} onChange={set("marketplaceId")} className={inputClass}>
                {account.marketplaceIds.map((id) => <option key={id} value={id}>{account.marketplaces?.find((m) => m.id === id)?.name || id}</option>)}
              </select>,
            )}
            <div className="sm:col-span-2">
              {field(
                "Product type",
                <span className="flex gap-2">
                  <input value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} placeholder="Search, e.g. luggage" className={inputClass} />
                  <button type="button" onClick={searchTypes} className="rounded-lg border border-slate-300 px-3 text-sm">Search</button>
                </span>,
                form.productType ? `Selected: ${form.productType}` : "Amazon's requirements depend on the product type.",
              )}
              {types.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {types.map((t) => (
                    <button key={t.name} type="button" onClick={() => { setForm((f) => ({ ...f, productType: t.name })); setTypes([]); }} className={`rounded-full border px-3 py-1 text-xs ${form.productType === t.name ? "border-indigo-500 bg-indigo-50" : "border-slate-300"}`}>{t.displayName}</button>
                  ))}
                </div>
              )}
              {requirements?.requiredAttributes?.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">Required by Amazon for {requirements.productType}: {requirements.requiredAttributes.join(", ")}. Fill the fields below and add any others under Extra attributes.</p>
              )}
            </div>
            {field(
              "Fulfillment",
              <select value={form.fulfillment} onChange={set("fulfillment")} className={inputClass}>
                <option value="MFN">You ship it (seller-fulfilled)</option>
                <option value="FBA">Fulfilled by Amazon (FBA)</option>
              </select>,
            )}
            {field("Condition", <select value={form.condition} onChange={set("condition")} className={inputClass}>{CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>)}
            {field(
              "Product identifier",
              <span className="flex gap-2">
                <select value={form.identifierType} onChange={set("identifierType")} className={`${inputClass} w-28`}>{["upc", "ean", "gtin", "isbn", "asin"].map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select>
                <input value={form.identifierValue} onChange={set("identifierValue")} className={inputClass} />
              </span>,
              "UPC/EAN/GTIN for a new product, or an existing ASIN to sell it.",
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("Title", <input value={form.title} onChange={set("title")} maxLength={500} className={inputClass} />)}</div>
          {field("Brand", <input value={form.brand} onChange={set("brand")} maxLength={100} className={inputClass} />)}
          {field("Manufacturer", <input value={form.manufacturer} onChange={set("manufacturer")} maxLength={100} className={inputClass} />)}
          <div className="sm:col-span-2">{field("Description", <textarea value={form.description} onChange={set("description")} rows={3} maxLength={2000} className={inputClass} />)}</div>
          {field("Bullet points", <textarea value={form.bullets} onChange={set("bullets")} rows={3} className={inputClass} />, "One per line, up to 10.")}
          {field("Image URLs", <textarea value={form.images} onChange={set("images")} rows={3} className={inputClass} />, "One https URL per line; the first is the main image.")}
          {field(`Price${currency ? ` (${currency})` : ""}`, <input type="number" min="0.01" step="0.01" value={form.price} onChange={set("price")} className={inputClass} />)}
          {form.fulfillment === "MFN" && field("Quantity", <input type="number" min="0" step="1" value={form.quantity} onChange={set("quantity")} className={inputClass} />)}
          <div className="sm:col-span-2">
            {field("Extra attributes (JSON)", <textarea value={form.attributes} onChange={set("attributes")} rows={4} className={`${inputClass} font-mono text-xs`} placeholder='{"color": [{"value": "Blue", "language_tag": "en_US", "marketplace_id": "ATVPDKIKX0DER"}]}' />, "Product-type-specific attributes in Amazon's format. These are sent as given.")}
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{error.message}</p>
            {error.errors && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {Object.entries(error.errors).map(([k, v]) => <li key={k}>{k}: {Array.isArray(v) ? v.join(", ") : v}</li>)}
              </ul>
            )}
            <Issues issues={error.issues} />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={busy || (!editing && !form.productType)} className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? "Sending to Amazon…" : editing ? "Save changes" : "Create listing"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ListingsTab({ account, onNotice }) {
  const [filters, setFilters] = useState({ q: "", status: "", marketplaceId: "", fulfillment: "", page: 1 });
  const [form, setForm] = useState(null); // null | { listing?: ... }
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const qs = new URLSearchParams({ accountId: account.id, page: String(filters.page), ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && k !== "page")) });
  const { body, error, loading, reload } = useApiData(`/api/amazon/listings?${qs}`);
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, page: 1 }));

  const act = async (listing, fn, success) => {
    setBusyId(listing.id);
    try {
      const data = await fn();
      onNotice({ type: "success", text: success(data) });
      reload();
    } catch (err) {
      onNotice({ type: "error", text: err.message, issues: err.issues });
    } finally {
      setBusyId(null);
    }
  };
  const close = (l) => {
    if (!window.confirm(`Close ${l.sku}?\n\nClosing sets the quantity to 0 so the listing becomes inactive on Amazon. It is NOT deleted and can be reopened by setting a quantity again.`)) return;
    act(l, () => amazonRequest(`/api/amazon/listings/${l.id}/close`, { method: "POST" }), () => `${l.sku} closed (inactive). Amazon is processing the change.`);
  };
  const remove = (l) => {
    if (!window.confirm(`Delete ${l.sku} from Amazon?\n\nDeleting removes this listing from Amazon (${l.marketplaceId}). This is different from closing and cannot be undone from SmartSell.`)) return;
    act(l, () => amazonRequest(`/api/amazon/listings/${l.id}`, { method: "DELETE", body: { confirm: true } }), () => `${l.sku} deleted from Amazon.`);
  };
  const refresh = (l) => act(l, () => amazonRequest(`/api/amazon/listings/${l.id}?refresh=1`), (d) => `${l.sku}: ${SUBMISSION_LABEL[d.listing.submission?.status] || "refreshed from Amazon"}.`);

  return (
    <Card
      title="Listings"
      actions={account.writeEnabled ? <button type="button" onClick={() => setForm({})} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Create listing</button> : <span className="text-xs text-slate-500">Listing changes are not enabled for this account.</span>}
    >
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input value={filters.q} onChange={setFilter("q")} placeholder="Search SKU, ASIN or title" className={inputClass} aria-label="Search listings" />
        <select value={filters.status} onChange={setFilter("status")} className={inputClass} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active (buyable)</option>
          <option value="inactive">Inactive</option>
          <option value="issues">With errors</option>
        </select>
        <select value={filters.marketplaceId} onChange={setFilter("marketplaceId")} className={inputClass} aria-label="Marketplace">
          <option value="">All marketplaces</option>
          {account.marketplaceIds.map((id) => <option key={id} value={id}>{account.marketplaces?.find((m) => m.id === id)?.name || id}</option>)}
        </select>
        <select value={filters.fulfillment} onChange={setFilter("fulfillment")} className={inputClass} aria-label="Fulfillment">
          <option value="">All fulfillment</option>
          <option value="MFN">Seller-fulfilled</option>
          <option value="FBA">FBA</option>
        </select>
      </div>

      <LoadState loading={loading && !body} error={error} empty={body && !body.items.length} emptyText="No Amazon listings yet. Run a sync to import them, or create one." onRetry={reload} />
      {body?.items?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pr-4">Listing</th><th className="py-2 pr-4">Marketplace</th><th className="py-2 pr-4">Price</th><th className="py-2 pr-4">Fulfillment</th><th className="py-2 pr-4">Status</th><th className="py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {body.items.map((l) => {
                const busy = busyId === l.id;
                const errors = l.issues.filter((i) => i.severity === "ERROR").length;
                return (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 pr-4">
                      <p className="font-medium text-slate-900">{l.title || l.sku}</p>
                      <p className="text-xs text-slate-500">SKU {l.sku}{l.asin ? ` · ASIN ${l.asin}` : ""}</p>
                      {l.issues.length > 0 && (
                        <button type="button" onClick={() => setExpanded(expanded === l.id ? null : l.id)} className={`mt-1 text-xs font-medium ${errors ? "text-red-700" : "text-amber-700"}`}>
                          {l.issues.length} issue{l.issues.length === 1 ? "" : "s"} from Amazon {expanded === l.id ? "▲" : "▼"}
                        </button>
                      )}
                      {expanded === l.id && <Issues issues={l.issues} />}
                    </td>
                    <td className="py-2 pr-4">{account.marketplaces?.find((m) => m.id === l.marketplaceId)?.name || l.marketplaceId}</td>
                    <td className="py-2 pr-4">{money(l.price, l.currency)}</td>
                    <td className="py-2 pr-4">{l.fulfillment === "FBA" ? "FBA" : l.fulfillment === "MFN" ? `You ship · ${l.quantity ?? "—"} in stock` : "—"}</td>
                    <td className="py-2 pr-4 space-y-1">
                      <div className="flex flex-wrap gap-1">{l.statuses.length ? l.statuses.map((s) => <Badge key={s} tone={s === "BUYABLE" ? "green" : "slate"}>{s.toLowerCase()}</Badge>) : <Badge>inactive</Badge>}</div>
                      {l.pending ? <Badge tone="amber">Sending to Amazon</Badge> : l.submission && <Badge tone={SUBMISSION_TONE[l.submission.status]}>{l.submission.operation}: {SUBMISSION_LABEL[l.submission.status] || l.submission.status}</Badge>}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-3 text-xs font-semibold">
                        <button type="button" disabled={busy} onClick={() => refresh(l)} className="text-slate-600 disabled:opacity-40">Refresh</button>
                        {account.writeEnabled && (
                          <>
                            <button type="button" disabled={busy || l.pending} onClick={() => setForm({ listing: l })} className="text-indigo-600 disabled:opacity-40">Edit</button>
                            {l.fulfillment === "MFN" && <button type="button" disabled={busy || l.pending} onClick={() => close(l)} className="text-amber-700 disabled:opacity-40">Close</button>}
                            <button type="button" disabled={busy || l.pending} onClick={() => remove(l)} className="text-red-600 disabled:opacity-40">Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={body.page} pageSize={body.pageSize} total={body.total} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
        </div>
      )}

      {form && (
        <ListingForm
          account={account}
          listing={form.listing}
          onClose={() => setForm(null)}
          onSaved={(listing) => {
            setForm(null);
            onNotice({ type: listing?.submission?.status === "failed" ? "error" : "success", text: `${listing?.sku}: ${SUBMISSION_LABEL[listing?.submission?.status] || "sent to Amazon"}.`, issues: listing?.issues });
            reload();
          }}
        />
      )}
    </Card>
  );
}
