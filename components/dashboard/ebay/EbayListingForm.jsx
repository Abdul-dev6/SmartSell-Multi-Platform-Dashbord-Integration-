"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiErrorText } from "@/components/dashboard/shared/apiError";

// Create or edit a product on the seller's eBay account. eBay needs a leaf
// category, its required item specifics, a condition, at least one image
// URL, a price and a quantity to publish; "Save as draft" skips publishing.

export const CONDITION_LABELS = {
  NEW: "New",
  LIKE_NEW: "Like new",
  NEW_OTHER: "New (other)",
  NEW_WITH_DEFECTS: "New with defects",
  CERTIFIED_REFURBISHED: "Certified refurbished",
  EXCELLENT_REFURBISHED: "Excellent – refurbished",
  VERY_GOOD_REFURBISHED: "Very good – refurbished",
  GOOD_REFURBISHED: "Good – refurbished",
  SELLER_REFURBISHED: "Seller refurbished",
  USED_EXCELLENT: "Used",
  USED_VERY_GOOD: "Used – very good",
  USED_GOOD: "Used – good",
  USED_ACCEPTABLE: "Used – acceptable",
  FOR_PARTS_OR_NOT_WORKING: "For parts or not working",
};

const CURRENCIES = { EBAY_US: "USD", EBAY_GB: "GBP", EBAY_DE: "EUR", EBAY_AU: "AUD", EBAY_CA: "CAD" };

const FIELD_LABELS = {
  accountId: "eBay account",
  sku: "SKU",
  title: "Title",
  description: "Description",
  price: "Price",
  quantity: "Quantity",
  condition: "Condition",
  conditionDescription: "Condition notes",
  categoryId: "Category",
  aspects: "Item specifics",
  imageUrls: "Images",
  idempotencyKey: "Request",
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500";
const labelClass = "mb-1 block text-sm font-medium text-slate-700";

function newRequestKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k${Date.now()}${Math.random().toString(36).slice(2)}`;
}

function formFromProduct(product) {
  if (!product) {
    return {
      accountId: "",
      sku: "",
      title: "",
      description: "",
      price: "",
      quantity: "1",
      condition: "NEW",
      conditionDescription: "",
      categoryId: "",
      categoryName: "",
      aspects: {},
      imageUrls: "",
      publish: true,
    };
  }
  return {
    accountId: product.accountId,
    sku: product.sku,
    title: product.title,
    description: product.description,
    price: product.price === null ? "" : String(product.price),
    quantity: String(product.quantity ?? 0),
    condition: product.condition || "NEW",
    conditionDescription: product.conditionDescription || "",
    categoryId: product.categoryId || "",
    categoryName: product.categoryName || "",
    aspects: Object.fromEntries(Object.entries(product.aspects || {}).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).join(", ")])),
    imageUrls: (product.imageUrls || []).join("\n"),
    publish: product.listingStatus === "published" || (product.listingStatus === "draft" && product.publish && product.syncStatus !== "synced"),
  };
}

function Section({ title, children, description }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function FieldError({ message }) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export default function EbayListingForm({ product = null }) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const [form, setForm] = useState(() => formFromProduct(product));
  const [status, setStatus] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [categoryDetails, setCategoryDetails] = useState(null);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const requestKey = useRef(newRequestKey());

  const set = (key) => (event) => {
    const value = event?.target ? (event.target.type === "checkbox" ? event.target.checked : event.target.value) : event;
    setForm((f) => ({ ...f, [key]: value }));
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ebay/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        const active = (data.accounts || []).filter((a) => a.status === "active");
        if (!isEdit && active.length) setForm((f) => (f.accountId ? f : { ...f, accountId: active[0].id }));
      })
      .catch(() => !cancelled && setStatus({ accounts: [] }));
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  const loadCategory = useCallback(async (categoryId, accountId) => {
    if (!categoryId) return;
    setLoadingCategory(true);
    try {
      const query = new URLSearchParams({ categoryId, ...(accountId ? { accountId } : {}) });
      const response = await fetch(`/api/ebay/options/categories?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorText(response, data, "Could not load category details."));
      setCategoryDetails(data);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoadingCategory(false);
    }
  }, []);

  // Editing: load the item specifics of the saved category.
  useEffect(() => {
    if (!product?.categoryId) return;
    const timer = setTimeout(() => loadCategory(product.categoryId, product.accountId), 0);
    return () => clearTimeout(timer);
  }, [product, loadCategory]);

  const searchCategories = async (event) => {
    event?.preventDefault();
    if (categoryQuery.trim().length < 2) return;
    try {
      const query = new URLSearchParams({ q: categoryQuery.trim(), ...(form.accountId ? { accountId: form.accountId } : {}) });
      const response = await fetch(`/api/ebay/options/categories?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorText(response, data, "Category search failed."));
      setSuggestions(data.categories || []);
      if (!data.categories?.length) setMessage({ type: "error", text: "No eBay categories match. Try other words." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const chooseCategory = (category) => {
    setForm((f) => ({ ...f, categoryId: category.id, categoryName: category.path }));
    setSuggestions([]);
    loadCategory(category.id, form.accountId);
  };

  const activeAccounts = useMemo(() => (status?.accounts || []).filter((a) => a.status === "active"), [status]);
  const account = activeAccounts.find((a) => a.id === form.accountId) || (isEdit ? (status?.accounts || []).find((a) => a.id === form.accountId) : null);

  const aspectRows = useMemo(() => {
    const fromCategory = categoryDetails?.aspects || [];
    const names = new Set(fromCategory.map((a) => a.name));
    const extra = Object.keys(form.aspects).filter((n) => !names.has(n)).map((name) => ({ name, required: false, freeText: true, multiple: true, values: [] }));
    return [...fromCategory, ...extra];
  }, [categoryDetails, form.aspects]);

  const conditionOptions = categoryDetails?.conditions?.length
    ? categoryDetails.conditions.map((c) => ({ value: c.value, label: CONDITION_LABELS[c.value] || c.label }))
    : Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }));

  const setAspect = (name, value) => setForm((f) => ({ ...f, aspects: { ...f.aspects, [name]: value } }));

  const payload = () => ({
    ...(isEdit ? {} : { idempotencyKey: requestKey.current, accountId: form.accountId || undefined, sku: form.sku.trim() || undefined }),
    title: form.title,
    description: form.description,
    price: form.price,
    quantity: form.quantity === "" ? 0 : Number(form.quantity),
    condition: form.condition,
    conditionDescription: form.conditionDescription,
    categoryId: form.categoryId,
    categoryName: form.categoryName,
    aspects: Object.fromEntries(
      Object.entries(form.aspects)
        .map(([name, value]) => [name, String(value || "").split(",").map((v) => v.trim()).filter(Boolean)])
        .filter(([, values]) => values.length),
    ),
    imageUrls: form.imageUrls.split(/\s+/).map((u) => u.trim()).filter(Boolean),
    publish: form.publish,
  });

  const missingRequired = aspectRows.filter((a) => a.required && !String(form.aspects[a.name] || "").trim()).map((a) => a.name);

  const submit = async (event) => {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    if (form.publish && missingRequired.length) {
      setMessage({ type: "error", text: `eBay requires these item specifics: ${missingRequired.join(", ")}.` });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(isEdit ? `/api/ebay/products/${product.id}` : "/api/ebay/products", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 400 && data.errors) {
        setErrors(data.errors);
        setMessage({ type: "error", text: data.message });
        return;
      }
      if (!response.ok) {
        const details = (data.ebayErrors || []).map((e) => e.message).filter((m) => m && m !== data.message);
        setMessage({
          type: "error",
          text: [apiErrorText(response, data, "eBay did not accept the product."), ...details].join(" "),
          productId: data.productId,
        });
        // A record was saved (failed write); a new submit must not reuse the key.
        if (data.productId) requestKey.current = newRequestKey();
        return;
      }
      if (isEdit) {
        setMessage({ type: "success", text: data.product.listingStatus === "published" ? "Saved and live on eBay." : "Saved on eBay." });
      } else {
        router.push("/Panel/Ecommerce/Product");
      }
    } catch {
      setMessage({ type: "error", text: "Could not reach the server." });
    } finally {
      setSaving(false);
    }
  };

  if (!status) return <p className="text-sm text-slate-500">Loading your eBay accounts…</p>;

  if (!isEdit && !activeAccounts.length) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No eBay account connected.{" "}
        <Link href="/Panel/Ecommerce/Integration" className="font-semibold underline">Connect eBay</Link> to list products there.
      </p>
    );
  }

  const fieldErrors = Object.entries(errors);
  const currency = CURRENCIES[account?.marketplaceId] || "USD";

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {status.environment === "sandbox" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          eBay Sandbox: listings are created on eBay&apos;s test site and are not visible to real buyers.
        </p>
      )}

      {account && !account.setup?.ready && form.publish && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This eBay account needs business policies and a ship-from location before products can be published.{" "}
          <Link href="/Panel/Ecommerce/Integration" className="font-semibold underline">Finish eBay setup</Link>, or save as a draft for now.
        </p>
      )}

      <Section title="General information">
        {!isEdit && activeAccounts.length > 1 && (
          <div>
            <label htmlFor="ebay-account" className={labelClass}>eBay account</label>
            <select id="ebay-account" className={inputClass} value={form.accountId} onChange={set("accountId")}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.username} ({a.marketplaceId})</option>
              ))}
            </select>
            <FieldError message={errors.accountId} />
          </div>
        )}
        <div>
          <label htmlFor="ebay-title" className={labelClass}>Title <span className="text-slate-400">({form.title.length}/80)</span></label>
          <input id="ebay-title" className={inputClass} maxLength={80} value={form.title} onChange={set("title")} required />
          <FieldError message={errors.title} />
        </div>
        <div>
          <label htmlFor="ebay-description" className={labelClass}>Description</label>
          <textarea id="ebay-description" rows={6} className={inputClass} value={form.description} onChange={set("description")} />
          <FieldError message={errors.description} />
        </div>
        <div>
          <label htmlFor="ebay-sku" className={labelClass}>SKU</label>
          <input
            id="ebay-sku"
            className={`${inputClass} disabled:bg-slate-100`}
            value={form.sku}
            onChange={set("sku")}
            disabled={isEdit}
            placeholder={isEdit ? "" : "Leave empty to generate one"}
          />
          {isEdit && <p className="mt-1 text-xs text-slate-500">eBay identifies the item by its SKU, so it cannot be changed.</p>}
          <FieldError message={errors.sku} />
        </div>
      </Section>

      <Section title="Category" description="eBay needs a leaf category; it decides which item specifics are required.">
        {form.categoryId && (
          <p className="text-sm text-slate-700">
            Selected: <span className="font-medium">{form.categoryName || form.categoryId}</span>{" "}
            <span className="text-slate-400">#{form.categoryId}</span>
          </p>
        )}
        <div className="flex gap-2">
          <input
            aria-label="Search eBay categories"
            className={inputClass}
            placeholder="Search categories, e.g. “iphone 15”"
            value={categoryQuery}
            onChange={(e) => setCategoryQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchCategories(e)}
          />
          <button type="button" onClick={searchCategories} className="shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">
            Search
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {suggestions.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => chooseCategory(c)} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50">
                  {c.path} <span className="text-slate-400">#{c.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <FieldError message={errors.categoryId} />
      </Section>

      <Section title="Item specifics" description={loadingCategory ? "Loading item specifics…" : form.categoryId ? "Separate multiple values with commas." : "Choose a category to see its item specifics."}>
        {aspectRows.map((aspect) => {
          const id = `aspect-${aspect.name.replace(/\W+/g, "-")}`;
          return (
            <div key={aspect.name}>
              <label htmlFor={id} className={labelClass}>
                {aspect.name} {aspect.required && <span className="text-red-600">*</span>}
              </label>
              <input id={id} list={aspect.values?.length ? `${id}-values` : undefined} className={inputClass} value={form.aspects[aspect.name] || ""} onChange={(e) => setAspect(aspect.name, e.target.value)} />
              {aspect.values?.length > 0 && (
                <datalist id={`${id}-values`}>
                  {aspect.values.map((v) => <option key={v} value={v} />)}
                </datalist>
              )}
            </div>
          );
        })}
        <FieldError message={errors.aspects} />
      </Section>

      <Section title="Condition">
        <div>
          <label htmlFor="ebay-condition" className={labelClass}>Condition</label>
          <select id="ebay-condition" className={inputClass} value={form.condition} onChange={set("condition")}>
            {conditionOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <FieldError message={errors.condition} />
        </div>
        {!["NEW", "LIKE_NEW", "NEW_OTHER"].includes(form.condition) && (
          <div>
            <label htmlFor="ebay-condition-notes" className={labelClass}>Condition notes</label>
            <textarea id="ebay-condition-notes" rows={2} className={inputClass} value={form.conditionDescription} onChange={set("conditionDescription")} />
            <FieldError message={errors.conditionDescription} />
          </div>
        )}
      </Section>

      <Section title="Images" description="One public https:// image URL per line (up to 24). eBay downloads the images from these addresses.">
        <textarea aria-label="Image URLs" rows={3} className={inputClass} value={form.imageUrls} onChange={set("imageUrls")} placeholder="https://example.com/photo.jpg" />
        <FieldError message={errors.imageUrls} />
      </Section>

      <Section title="Price and quantity">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ebay-price" className={labelClass}>Price ({currency})</label>
            <input id="ebay-price" inputMode="decimal" className={inputClass} value={form.price} onChange={set("price")} />
            <FieldError message={errors.price} />
          </div>
          <div>
            <label htmlFor="ebay-quantity" className={labelClass}>Available quantity</label>
            <input id="ebay-quantity" type="number" min="0" step="1" className={inputClass} value={form.quantity} onChange={set("quantity")} />
            <FieldError message={errors.quantity} />
          </div>
        </div>
      </Section>

      {fieldErrors.length > 0 && (
        <ul className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {fieldErrors.map(([key, text]) => (
            <li key={key}>{FIELD_LABELS[key] || key}: {text}</li>
          ))}
        </ul>
      )}

      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.type === "error" ? "border border-red-200 bg-red-50 text-red-800" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {message.text}
          {message.productId && " The product was saved in SmartSell; retry it from the Products page."}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.publish} onChange={set("publish")} className="h-4 w-4" />
          {isEdit && product.listingStatus === "published" ? "Keep the listing live on eBay (untick to end it)" : "Publish the listing on eBay"}
        </label>
        <div className="flex gap-3">
          <Link href="/Panel/Ecommerce/Product" className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60">
            {saving ? "Sending to eBay…" : isEdit ? "Save changes" : form.publish ? "Publish to eBay" : "Save draft on eBay"}
          </button>
        </div>
      </div>
    </form>
  );
}
