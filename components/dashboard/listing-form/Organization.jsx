"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FolderTree } from "lucide-react";
import { makeBinder } from "@/components/dashboard/listing-form/bind";
import { useDebounced, useShopifyOptions } from "@/components/dashboard/listing-form/useShopifyOptions";

const fieldClass = "w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500";

function Status({ text, tone = "slate", children }) {
  const tones = { slate: "text-slate-500", red: "text-red-700", amber: "text-amber-800" };
  return (
    <p className={`text-sm ${tones[tone]}`} role={tone === "red" ? "alert" : undefined}>
      {text}
      {children}
    </p>
  );
}

// Searchable Shopify taxonomy category (one per product).
function CategoryPicker({ value, onChange, error }) {
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim());
  const url = query.length >= 2 ? `/api/shopify/options/categories?q=${encodeURIComponent(query)}` : null;
  const { loading, error: loadError, data, reload } = useShopifyOptions(url);
  const results = data?.categories || [];

  return (
    <div>
      <label htmlFor="category-search" className="block text-sm font-medium mb-2">Product category</label>
      {value ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-sm text-slate-800">{value.fullName || value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-sm font-medium text-indigo-700 hover:underline">
            Remove
          </button>
        </div>
      ) : (
        <>
          <input
            id="category-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Shopify categories, e.g. mugs"
            className={fieldClass}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
          />
          <div className="mt-2" aria-live="polite">
            {search.trim().length > 0 && search.trim().length < 2 && <Status text="Type at least 2 characters." />}
            {url && loading && <Status text="Searching…" />}
            {url && loadError && (
              <Status text={loadError} tone="red">
                {" "}
                <button type="button" onClick={reload} className="underline">Retry</button>
              </Status>
            )}
            {url && !loading && !loadError && data && results.length === 0 && <Status text="No matching categories." />}
            {results.length > 0 && !loading && (
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {results.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ id: category.id, name: category.name, fullName: category.fullName });
                        setSearch("");
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">{category.name}</span>
                      <span className="block text-xs text-slate-500">{category.fullName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// Multi-select of the store's collections. Automated collections are shown
// but locked: Shopify adds products to them by rules.
function CollectionPicker({ value, onChange, error }) {
  const [search, setSearch] = useState("");
  // Pages loaded with "Load more", for the search they were loaded for.
  const [more, setMore] = useState({ query: null, items: [], cursor: undefined, loading: false, error: null });
  const query = useDebounced(search.trim());
  const base = `/api/shopify/options/collections?q=${encodeURIComponent(query)}`;
  const first = useShopifyOptions(base);

  const sameSearch = more.query === query;
  const listed = [
    ...new Map([...(first.data?.collections || []), ...(sameSearch ? more.items : [])].map((c) => [c.id, c])).values(),
  ];
  const nextCursor = sameSearch && more.cursor !== undefined ? more.cursor : first.data?.nextCursor;
  const selected = new Map(value.map((c) => [c.id, c]));

  const toggle = (collection) => {
    if (selected.has(collection.id)) onChange(value.filter((c) => c.id !== collection.id));
    else onChange([...value, { id: collection.id, title: collection.title, manual: collection.manual }]);
  };

  const loadMore = async () => {
    const items = sameSearch ? more.items : [];
    setMore({ query, items, cursor: nextCursor, loading: true, error: null });
    try {
      const response = await fetch(`${base}&after=${encodeURIComponent(nextCursor)}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.message || "Could not load more collections.");
      setMore({ query, items: [...items, ...json.collections], cursor: json.nextCursor, loading: false, error: null });
    } catch (err) {
      setMore({ query, items, cursor: nextCursor, loading: false, error: err.message });
    }
  };

  return (
    <fieldset>
      <legend className="block text-sm font-medium mb-2">Collections</legend>
      {value.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Selected collections">
          {value.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-800">
              {c.title}
              {c.manual === false ? (
                <span className="text-xs text-indigo-500">(automated)</span>
              ) : (
                <button type="button" onClick={() => toggle(c)} aria-label={`Remove ${c.title}`} className="ml-1 font-semibold">
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search collections"
        aria-label="Search collections"
        className={fieldClass}
        aria-invalid={error ? true : undefined}
      />
      <div className="mt-2" aria-live="polite">
        {first.loading && <Status text="Loading collections…" />}
        {first.error && (
          <Status text={first.error} tone="red">
            {" "}
            <button type="button" onClick={first.reload} className="underline">Retry</button>
          </Status>
        )}
        {!first.loading && !first.error && listed.length === 0 && (
          <Status text={query ? "No matching collections." : "This store has no collections yet."} />
        )}
        {listed.length > 0 && (
          <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {listed.map((c) => (
              <li key={c.id}>
                <label className={`flex items-center gap-3 px-4 py-2 text-sm ${c.manual ? "cursor-pointer hover:bg-slate-50" : "text-slate-400"}`}>
                  <input type="checkbox" checked={selected.has(c.id)} disabled={!c.manual} onChange={() => toggle(c)} />
                  <span>{c.title}</span>
                  {!c.manual && <span className="text-xs">automated — set by its rules</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {sameSearch && more.error && <Status text={more.error} tone="red" />}
        {nextCursor && !first.loading && (
          <button type="button" onClick={loadMore} disabled={more.loading} className="mt-2 text-sm font-medium text-indigo-700 hover:underline disabled:opacity-60">
            {more.loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}

// Sales channels the product is published to (separate from its status).
function SalesChannels({ value, onChange, status, known, onAvailability, error }) {
  const { loading, error: loadError, data, reload } = useShopifyOptions("/api/shopify/options/publications");
  const channels = data?.publications || [];
  const available = data?.available;
  const selected = new Set(value);

  // Tell the form whether channel choices can be sent.
  const availability = data ? Boolean(available && known !== false) : null;
  useEffect(() => {
    onAvailability?.(availability);
  }, [availability, onAvailability]);

  const toggle = (id) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <fieldset>
      <legend className="block text-sm font-medium mb-2">Sales channels</legend>
      <div aria-live="polite">
        {loading && <Status text="Loading sales channels…" />}
        {loadError && (
          <Status text={loadError} tone="red">
            {" "}
            <button type="button" onClick={reload} className="underline">Retry</button>
          </Status>
        )}
        {data && !available && (
          <Status
            tone="amber"
            text={`Choosing sales channels needs the Shopify permissions ${data.missingScopes.join(" and ")}. They are not granted to SmartSell yet, so publishing is left unchanged.`}
          />
        )}
        {data && available && known === false && (
          <Status tone="amber" text="Sales channels for this product haven't been read yet. Run a sync to load them before changing them here." />
        )}
        {data && available && known !== false && channels.length === 0 && <Status text="No sales channels are available to this app." />}
        {data && available && known !== false && channels.length > 0 && (
          <ul className="space-y-2">
            {channels.map((channel) => (
              <li key={channel.id}>
                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <input type="checkbox" checked={selected.has(channel.id)} onChange={() => toggle(channel.id)} />
                  {channel.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        {data && available && status !== "active" && value.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Customers only see the product on these channels while its status is Active.
          </p>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}

export default function Organization({ formData, setFormData, errors = {}, onChannelsAvailability }) {
  const bind = makeBinder(formData, setFormData, errors);
  const set = (field) => (next) => setFormData((prev) => ({ ...prev, [field]: next }));

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
          <FolderTree size={22} className="text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Organization</h2>
          <p className="text-sm text-slate-500">Status, category, collections and where the product is sold.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label htmlFor="product-status" className="block text-sm font-medium mb-2">Product status</label>
          <select id="product-status" {...bind("status")} className={fieldClass}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
            {formData.status === "unlisted" && <option value="unlisted">Unlisted</option>}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Status decides whether the product can be sold; sales channels decide where it appears.
          </p>
        </div>

        <CategoryPicker value={formData.category} onChange={set("category")} error={errors.category} />
        <CollectionPicker value={formData.collections} onChange={set("collections")} error={errors.collections} />
        <SalesChannels
          value={formData.publications}
          onChange={set("publications")}
          status={formData.status}
          known={formData.publicationsKnown}
          onAvailability={onChannelsAvailability}
          error={errors.publications}
        />
      </div>
    </motion.div>
  );
}
