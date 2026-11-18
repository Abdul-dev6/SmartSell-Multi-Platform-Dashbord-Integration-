"use client";

import { apiErrorText } from "@/components/dashboard/shared/apiError";

// Small shared pieces for the Amazon dashboard tabs.

export async function amazonRequest(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    const error = new Error(apiErrorText(response, data, `Request failed (${response.status})`));
    error.status = response.status;
    error.code = data.code;
    error.errors = data.errors;
    error.issues = data.issues;
    throw error;
  }
  return data;
}

export const money = (amount, currency) =>
  amount === null || amount === undefined
    ? "—"
    : (() => {
        try {
          return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount);
        } catch {
          return `${amount} ${currency || ""}`.trim();
        }
      })();

export const when = (value) => (value ? new Date(value).toLocaleString() : "—");

export function Badge({ tone = "slate", children }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone] || tones.slate}`}>{children}</span>;
}

export const SUBMISSION_TONE = { live: "green", processing: "amber", ACCEPTED: "amber", VALID: "green", failed: "red", INVALID: "red" };
export const SUBMISSION_LABEL = { live: "Live", processing: "Processing at Amazon", ACCEPTED: "Accepted, processing", VALID: "Valid", failed: "Failed", INVALID: "Rejected" };

export function Issues({ issues }) {
  if (!issues?.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {issues.map((i, n) => (
        <li key={`${i.code}-${n}`} className={i.severity === "ERROR" ? "text-red-700" : i.severity === "WARNING" ? "text-amber-800" : "text-slate-600"}>
          <span className="font-semibold">{i.severity}</span>
          {i.code ? ` ${i.code}` : ""}: {i.message}
          {i.attributeNames?.length ? <span className="text-slate-500"> ({i.attributeNames.join(", ")})</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>
        {total} result{total === 1 ? "" : "s"} · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">
          Previous
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}

export function Card({ title, actions, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
