"use client";

import useApiData from "@/components/dashboard/shared/useApiData";
import { formatDate } from "@/components/dashboard/shared/format";

const when = (value) => (value ? new Date(value).toLocaleString() : "never");

function Line({ ok, children }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span>{children}</span>
    </li>
  );
}

// Recovery status: webhook deliveries that ran out of retries or are stuck,
// the last sync, and whether the daily recovery check is running.
export default function StoreHealth() {
  const { body, error, loading, reload } = useApiData("/api/shopify/health");

  if (loading && !body) return null;
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Health status unavailable: {error}{" "}
        <button type="button" onClick={reload} className="underline">
          Retry
        </button>
      </p>
    );
  }
  if (!body?.stores?.length) return null;

  const { cron } = body;

  return (
    <section aria-labelledby="store-health-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 id="store-health-title" className="text-base font-semibold text-slate-900">
          Sync health
        </h2>
        <button type="button" onClick={reload} className="text-sm font-medium text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        <Line ok={!cron.overdue && cron.status !== "failed"}>
          Daily recovery check:{" "}
          {cron.lastRunAt
            ? `last ran ${when(cron.lastRunAt)} (${cron.status === "success" ? "succeeded" : "failed"})`
            : "has not run yet"}
          {cron.overdue && cron.lastRunAt ? " — overdue; it should run every day at 04:00 UTC." : ""}
        </Line>
      </ul>

      {body.stores.map((store) => {
        const w = store.webhooks;
        return (
          <div key={store.storeId} className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-sm font-medium text-slate-800 break-all">{store.shop}</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              <Line ok={store.lastSync.status === "success"}>
                Last sync: {when(store.lastSync.at)}
                {store.lastSync.status && store.lastSync.status !== "success" ? ` — ${store.lastSync.error || store.lastSync.status}` : ""}
              </Line>
              <Line ok={w.failedLast7Days === 0}>
                {w.failedLast7Days === 0
                  ? "No live updates failed in the last 7 days."
                  : `${w.failedLast7Days} live update${w.failedLast7Days === 1 ? "" : "s"} failed in the last 7 days after all retries. A sync repairs the data.`}
              </Line>
              <Line ok={!w.stuck}>
                {w.pending === 0
                  ? "No live updates waiting."
                  : `${w.pending} live update${w.pending === 1 ? "" : "s"} waiting${w.stuck ? `, oldest since ${when(w.oldestPendingAt)} — it will be retried automatically` : ""}.`}
              </Line>
            </ul>
            {w.recentFailures.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {w.recentFailures.map((f, i) => (
                  <li key={i}>
                    {f.topic} · {formatDate(f.failedAt)} · {f.attempts} attempts{f.error ? ` · ${f.error}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
