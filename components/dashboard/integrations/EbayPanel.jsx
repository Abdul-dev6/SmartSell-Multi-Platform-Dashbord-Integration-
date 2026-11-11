"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";

// eBay connection, listing setup (business policies + inventory location)
// and import, shown on the Integrations page. `open` controls the connect
// dialog; messages go to the page's banners through onSuccess / onError.

async function call(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const details = (data.ebayErrors || []).map((e) => e.message).filter((m) => m && m !== data.message);
    throw new Error([data.message || "Request failed.", ...details].join(" "));
  }
  return data;
}

const post = (url, body) =>
  call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

const STATUS_TEXT = {
  active: { label: "Connected", className: "text-emerald-700" },
  reauth_required: { label: "Reconnect required", className: "text-amber-700" },
  disconnected: { label: "Disconnected", className: "text-slate-500" },
};

function SetupEditor({ account, onDone, onSuccess, onError }) {
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState("");
  const [location, setLocation] = useState({ name: "", postalCode: "", city: "", stateOrProvince: "", country: "US" });
  const [locationErrors, setLocationErrors] = useState({});

  const load = useCallback(async () => {
    try {
      setDetails(await call(`/api/ebay/setup?accountId=${account.id}`));
    } catch (error) {
      onError(error.message);
    }
  }, [account.id, onError]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const run = async (action, extra = {}) => {
    setBusy(action);
    setLocationErrors({});
    try {
      const data = await post("/api/ebay/setup", { accountId: account.id, action, ...extra });
      setDetails(data);
      onSuccess(data.account.setup.ready ? "eBay listing setup is complete." : "eBay setup updated.");
      onDone();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy("");
    }
  };

  const createLocation = async (event) => {
    event.preventDefault();
    setBusy("create_location");
    setLocationErrors({});
    try {
      const response = await fetch("/api/ebay/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, action: "create_location", location }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 400 && data.errors) {
        setLocationErrors(data.errors);
        return;
      }
      if (!response.ok) throw new Error(data.message || "Could not create the location.");
      setDetails(data);
      onSuccess("Inventory location created on eBay.");
      onDone();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy("");
    }
  };

  if (!details) return <p className="mt-3 text-xs text-slate-500">Reading your eBay account…</p>;

  const setup = details.account.setup;
  const issues = setup.issues || [];
  const options = details.options || {};
  const select = (field) => (event) => run("select", { [field]: event.target.value });
  const selectClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800";

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
      {issues.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-amber-800">
          {issues.map((issue) => (
            <li key={issue}>{details.issueMessages?.[issue] || issue}</li>
          ))}
        </ul>
      )}

      {issues.includes("business_policies_not_enabled") && (
        <button type="button" disabled={Boolean(busy)} onClick={() => run("opt_in")} className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">
          {busy === "opt_in" ? "Enabling…" : "Enable business policies"}
        </button>
      )}

      {issues.some((i) => i.startsWith("missing_") && i.endsWith("_policy")) && (
        details.canCreateDefaultPolicies ? (
          <div>
            <p className="text-slate-600">SmartSell can create simple defaults: free domestic shipping, 1-day handling, 30-day returns.</p>
            <button type="button" disabled={Boolean(busy)} onClick={() => run("create_policies")} className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">
              {busy === "create_policies" ? "Creating…" : "Create default policies"}
            </button>
          </div>
        ) : (
          <p className="text-slate-600">Create the missing policies in your eBay account, then click “Check again”.</p>
        )
      )}

      {!issues.includes("business_policies_not_enabled") && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["fulfillment", "fulfillmentPolicyId", "Shipping policy"],
            ["payment", "paymentPolicyId", "Payment policy"],
            ["return", "returnPolicyId", "Return policy"],
          ].map(([kind, field, label]) =>
            options[kind]?.length ? (
              <label key={kind} className="block font-medium text-slate-700">
                {label}
                <select className={selectClass} disabled={Boolean(busy)} value={setup[field] || ""} onChange={select(field)}>
                  {options[kind].map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </label>
            ) : null,
          )}
          {options.locations?.length > 0 && (
            <label className="block font-medium text-slate-700">
              Ship-from location
              <select className={selectClass} disabled={Boolean(busy)} value={setup.merchantLocationKey || ""} onChange={select("merchantLocationKey")}>
                {options.locations.map((l) => (
                  <option key={l.key} value={l.key}>{l.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {issues.includes("missing_location") && (
        <form onSubmit={createLocation} className="space-y-2">
          <p className="font-medium text-slate-700">Add the address you ship from</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["name", "Name (e.g. Home warehouse)"],
              ["postalCode", "Postal code"],
              ["city", "City"],
              ["stateOrProvince", "State / province"],
              ["country", "Country code (e.g. US)"],
            ].map(([field, placeholder]) => (
              <div key={field}>
                <input
                  aria-label={placeholder}
                  placeholder={placeholder}
                  value={location[field]}
                  onChange={(e) => setLocation((l) => ({ ...l, [field]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-800"
                />
                {locationErrors[field] && <p className="mt-0.5 text-red-600">{locationErrors[field]}</p>}
              </div>
            ))}
          </div>
          <button type="submit" disabled={Boolean(busy)} className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50">
            {busy === "create_location" ? "Creating…" : "Create location"}
          </button>
        </form>
      )}

      <button type="button" disabled={Boolean(busy)} onClick={load} className="font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
        Check again
      </button>
    </div>
  );
}

export default function EbayPanel({ open, onClose, onSuccess, onError }) {
  const [status, setStatus] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setStatus(await call("/api/ebay/status"));
    } catch {
      onError("Could not load eBay connection status.");
    }
  }, [onError]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const accounts = (status?.accounts || []).filter((a) => a.status !== "disconnected");

  const disconnect = async (account) => {
    if (!window.confirm(`Disconnect eBay account ${account.username}?\n\nSmartSell deletes its eBay access. Your eBay listings are not changed.`)) return;
    setBusyId(account.id);
    try {
      const data = await call(`/api/ebay/accounts/${account.id}`, { method: "DELETE" });
      onSuccess(data.message);
      await load();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const sync = async (account) => {
    setBusyId(account.id);
    try {
      const data = await post("/api/ebay/sync", { accountId: account.id });
      onSuccess(data.message);
      await load();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {accounts.length > 0 && (
        <section aria-labelledby="ebay-accounts-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Image src="/ebay.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            <h2 id="ebay-accounts-title" className="text-base font-semibold text-slate-900">
              Connected eBay accounts
            </h2>
            {status?.environment === "sandbox" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Sandbox</span>
            )}
          </div>
          <ul className="mt-3 space-y-3">
            {accounts.map((account) => {
              const state = STATUS_TEXT[account.status] || STATUS_TEXT.active;
              const busy = busyId === account.id;
              return (
                <li key={account.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 break-all">
                        {account.username} <span className="text-xs text-slate-500">({account.marketplaceId})</span>
                      </p>
                      <p className={state.className}>{state.label}</p>
                      {account.status === "active" && (
                        <p className={account.setup.ready ? "text-emerald-700" : "text-amber-700"}>
                          Listing setup: {account.setup.ready ? "Ready" : "Needs attention"}
                          {account.setup.ready && account.setup.policyNames?.fulfillment ? ` · ${account.setup.policyNames.fulfillment}` : ""}
                        </p>
                      )}
                      {account.sync?.lastSyncAt && (
                        <p className="text-xs text-slate-500">
                          Last import: {new Date(account.sync.lastSyncAt).toLocaleString()}
                          {account.sync.lastSyncStatus === "failed" && account.sync.lastSyncError ? ` · ${account.sync.lastSyncError}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs font-medium">
                      {account.status === "active" ? (
                        <>
                          <button type="button" disabled={busy} onClick={() => sync(account)} className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                            {busy ? "Working…" : "Import from eBay"}
                          </button>
                          <button type="button" onClick={() => setEditingId(editingId === account.id ? null : account.id)} className="text-indigo-600 hover:text-indigo-800">
                            {editingId === account.id ? "Hide setup" : account.setup.ready ? "Listing setup" : "Fix setup"}
                          </button>
                        </>
                      ) : (
                        <a href="/api/ebay/connect" className="text-indigo-600 hover:text-indigo-800">Reconnect</a>
                      )}
                      <button type="button" disabled={busy} onClick={() => disconnect(account)} className="text-red-600 hover:text-red-800 disabled:opacity-50">
                        Disconnect
                      </button>
                    </div>
                  </div>
                  {editingId === account.id && account.status === "active" && (
                    <SetupEditor account={account} onDone={load} onSuccess={onSuccess} onError={onError} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="ebay-modal-title" className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <Image src="/ebay.png" alt="eBay" width={32} height={32} className="h-8 w-8 object-contain" />
                <h3 id="ebay-modal-title" className="text-lg font-semibold text-slate-900">Connect eBay</h3>
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="text-lg font-bold text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {!status ? (
              <p className="text-sm text-slate-600">Checking connected accounts…</p>
            ) : !status.configured ? (
              <p className="text-sm text-red-700">eBay is not configured on this server. Contact support.</p>
            ) : (
              <div className="space-y-3 text-sm text-slate-600">
                {status.environment === "sandbox" && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    SmartSell is using the <strong>eBay Sandbox</strong>. Sign in with an eBay Sandbox test user, not your real eBay account.
                  </p>
                )}
                <p>
                  You will be redirected to eBay to sign in and allow SmartSell to manage your inventory, listings and orders.
                  {accounts.length > 0 ? ` You already have ${accounts.length} connected account${accounts.length === 1 ? "" : "s"}.` : ""}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
                Cancel
              </button>
              {status?.configured && (
                <a href="/api/ebay/connect" className="rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700 active:scale-95">
                  {accounts.length ? "Connect another account" : "Authorize eBay"}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
