"use client";

import { useState } from "react";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import { apiErrorText } from "@/components/dashboard/shared/apiError";

// Amazon Sandbox Data Viewer. Shows what Amazon's SP-API static sandbox
// returns for the signed-in user's own sandbox account. Every value here is
// Amazon's SAMPLE/MOCK data, never a real seller listing.

const when = (value) => (value ? new Date(value).toLocaleString() : "—");

function SampleBadge() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-200">
      Sandbox sample data
    </span>
  );
}

function Section({ title, children, raw, error }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <SampleBadge />
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error.message}
        </p>
      ) : (
        <div className="mt-3">{children}</div>
      )}
      {raw && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700">Raw JSON response (Amazon Sandbox, buyer-like fields removed)</summary>
          <pre className="max-h-96 overflow-auto border-t border-slate-200 px-3 py-2 text-xs leading-5 text-slate-800">{JSON.stringify(raw, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}

export default function SandboxViewer() {
  const { body, error, loading, reload } = useApiData("/api/amazon/sandbox");
  const [action, setAction] = useState({ busy: false, error: null });

  async function send(url, method) {
    setAction({ busy: true, error: null });
    try {
      const response = await fetch(url, { method });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(apiErrorText(response, json, `Request failed (${response.status})`));
      setAction({ busy: false, error: null });
      reload();
    } catch (err) {
      setAction({ busy: false, error: err.message || "Request failed" });
    }
  }

  const connected = body?.connected === true;
  const account = body?.account;
  const participations = body?.participations;
  const listing = body?.listing;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Amazon Sandbox Data Viewer</h1>
            <SampleBadge />
          </div>
          <p className="mt-1 text-sm text-slate-500">Live responses from Amazon&apos;s SP-API static sandbox. Nothing here is stored.</p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="self-start rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div role="note" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Sample data only.</strong> Everything on this page is mock data that Amazon&apos;s SP-API static sandbox returns for testing. It is not a real
        seller account or listing, and no orders or buyer data are requested.
      </div>

      {action.error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {action.error}
        </p>
      )}

      <LoadState loading={loading && !body} error={error} onRetry={reload} />

      {body && !connected && (
        <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <h2 className="text-base font-semibold text-slate-900">No Amazon Sandbox account connected</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Connect the Sandbox account to call Amazon&apos;s static sandbox with the developer Sandbox credentials. The refresh token is stored encrypted.
          </p>
          <button
            type="button"
            onClick={() => send("/api/amazon/sandbox", "POST")}
            disabled={action.busy}
            className="mt-4 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {action.busy ? "Connecting…" : "Connect Sandbox account"}
          </button>
        </section>
      )}

      {connected && (
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Section title="Connected Sandbox account">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Environment">{account.environmentLabel}</Field>
              <Field label="Selling partner ID">{account.sellingPartnerId}</Field>
              <Field label="Region">{account.region?.toUpperCase()}</Field>
              <Field label="Connected">{when(account.connectedAt)}</Field>
              <Field label="Last fetched">{when(body.fetchedAt)}</Field>
            </dl>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Disconnect the Amazon Sandbox account? SmartSell deletes it and its synced Amazon data.")) {
                  send(`/api/amazon/accounts/${account.id}`, "DELETE");
                }
              }}
              disabled={action.busy}
              className="mt-4 rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-60"
            >
              Disconnect
            </button>
          </Section>

          <Section title="Marketplace participation" raw={participations?.raw} error={participations?.ok ? null : participations?.error}>
            {participations?.data?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Marketplace</th>
                      <th className="py-2 pr-4 font-medium">ID</th>
                      <th className="py-2 pr-4 font-medium">Currency</th>
                      <th className="py-2 font-medium">Participating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {participations.data.map((m) => (
                      <tr key={m.marketplaceId}>
                        <td className="py-2 pr-4 text-slate-900">{m.name || "—"}{m.countryCode ? ` (${m.countryCode})` : ""}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-slate-700">{m.marketplaceId}</td>
                        <td className="py-2 pr-4 text-slate-900">{m.defaultCurrencyCode || "—"}</td>
                        <td className="py-2 text-slate-900">{m.isParticipating ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Amazon Sandbox returned no marketplaces.</p>
            )}
          </Section>

          <Section title="Sample listing (getListingsItem)" raw={listing?.raw} error={listing?.ok ? null : listing?.error}>
            {listing?.data ? (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Product title (sample)">{listing.data.itemName}</Field>
                </div>
                <Field label="SKU">{listing.data.sku}</Field>
                <Field label="ASIN">{listing.data.asin}</Field>
                <Field label="Listing status">
                  {listing.data.statuses?.length ? (
                    <span className="flex flex-wrap gap-1">
                      {listing.data.statuses.map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{s}</span>
                      ))}
                    </span>
                  ) : null}
                </Field>
                <Field label="Marketplace ID">{listing.data.marketplaceId}</Field>
                <Field label="Product type">{listing.data.productType}</Field>
                <Field label="Condition">{listing.data.conditionType}</Field>
                <Field label="Last updated (sample)">{when(listing.data.lastUpdatedDate)}</Field>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Amazon Sandbox returned no listing for SKU {body.request?.sku}.</p>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
