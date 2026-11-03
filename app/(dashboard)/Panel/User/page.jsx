"use client";
import React, { useState } from "react";
import Link from "next/link";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import { formatDate } from "@/components/dashboard/shared/format";

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
}

// Ends every session of this account, on all devices, then returns to Login.
function SignOutEverywhere() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!window.confirm("Sign out of SmartSell on every device, including this one?")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout-all", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not sign out other devices.");
      }
      window.location.assign("/Login");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Security</h2>
      <p className="text-sm text-slate-600 mb-4">
        Lost a device or signed in on a shared computer? This ends every SmartSell session for your account.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {busy ? "Signing out…" : "Sign out everywhere"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// Shows only what SmartSell actually stores about the account.
const Userprofile = () => {
  const { body, error, loading, reload } = useApiData("/api/auth/me");
  const { body: storesBody } = useApiData("/api/shopify/status");
  const user = body?.user;
  const stores = (storesBody?.stores || []).filter((s) => s.status === "active");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">User Profile</h1>
        <p className="text-slate-600 text-sm mt-1">Your SmartSell account</p>
      </div>

      <LoadState loading={loading && !user} error={error} onRetry={reload} />

      {user && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8">
              <div
                className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg"
                aria-hidden="true"
              >
                {initials(user.name, user.email)}
              </div>

              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 break-words">
                  {user.name || user.email}
                </h2>
                <p className="text-slate-500 text-sm break-all">{user.email}</p>
                <p className="text-slate-500 text-xs">Member since {formatDate(user.createdAt)}</p>
              </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <dt className="text-slate-500 text-xs">Name</dt>
                <dd className="text-slate-900 font-medium">{user.name || "Not set"}</dd>
              </div>

              <div>
                <dt className="text-slate-500 text-xs">Email</dt>
                <dd className="text-slate-900 font-medium break-all">{user.email}</dd>
              </div>

              <div>
                <dt className="text-slate-500 text-xs">Sign-in method</dt>
                <dd className="text-slate-900 font-medium">
                  {user.signInMethod === "password" ? "Email and password" : "Google or GitHub"}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 text-xs">Member since</dt>
                <dd className="text-slate-900 font-medium">{formatDate(user.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Connected stores</h2>
            {stores.length ? (
              <ul className="space-y-2">
                {stores.map((store) => (
                  <li key={store._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-800 break-all">{store.shop}</span>
                    <span className="text-emerald-600">Shopify</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                No stores connected.{" "}
                <Link href="/Panel/Ecommerce/Integration" className="font-medium text-indigo-600 underline">
                  Connect one
                </Link>
                .
              </p>
            )}
          </div>

          <SignOutEverywhere />
        </>
      )}
    </div>
  );
};

export default Userprofile;
