"use client";

import { useState } from "react";

const OPERATION_LABELS = { create: "Create", update: "Update", delete: "Delete" };

// SmartSell → Shopify writes that failed or were not confirmed, with retry.
export default function NeedsAttention({ items = [], onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [messages, setMessages] = useState({});

  if (!items.length) return null;

  const retry = async (item) => {
    setBusyId(item.id);
    setMessages((m) => ({ ...m, [item.id]: null }));
    try {
      const response = await fetch(`/api/products/${item.id}/retry`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      // Deleted in Shopify: SmartSell archived it, so the item is resolved.
      if (data.code === "deleted_in_shopify") {
        await onChanged?.();
        return;
      }
      if (!response.ok) throw new Error(data.message || "Retry failed.");
      await onChanged?.();
    } catch (error) {
      setMessages((m) => ({ ...m, [item.id]: error.message }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-labelledby="needs-attention-title">
      <h2 id="needs-attention-title" className="font-semibold text-amber-900">
        Needs attention ({items.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-xl bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-800">
                {item.title}
                {item.operation && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {OPERATION_LABELS[item.operation]} {item.syncStatus === "pending" ? "not confirmed" : "failed"}
                  </span>
                )}
              </p>
              {(messages[item.id] || item.error) && (
                <p className="text-xs text-red-700">{messages[item.id] || item.error}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => retry(item)}
              disabled={busyId === item.id}
              className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busyId === item.id ? "Retrying…" : "Retry"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
