"use client";
import React from "react";
import { YearlyOverviewChart } from "@/components/dashboard/overview/YearlyOverviewChart";
import { OrderValueChart } from "@/components/dashboard/overview/OrderValueChart";
import FinancialOverviewChart from "@/components/dashboard/overview/FinancialOverviewChart";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";

function Reports() {
  const { body, error, loading, reload } = useApiData("/api/dashboard/summary");
  const summary = body?.data;
  const monthly = summary?.monthly || [];
  const currency = summary?.currency;

  return (
    <div className="bg-slate-50 w-full min-h-screen px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">

      {/* ── Hero Banner ── */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 py-8 text-white shadow-lg shadow-blue-950/20">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">
          Nexus Panel
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black">
          Analytics & Reports
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-blue-100/70">
          Orders, revenue and order value from your synced Shopify data
          {summary?.timezone ? ` (${summary.timezone})` : ""}.
        </p>
      </div>

      <LoadState loading={loading && !summary} error={error} onRetry={reload} />

      {summary && !summary.hasStore && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Connect a Shopify store on the Integrations page to see reports.
        </p>
      )}

      {summary?.definitions?.revenue && (
        <p className="text-xs text-slate-500">{summary.definitions.revenue}</p>
      )}

      {/* ── Full-width Yearly Overview Chart ── */}
      <div className="w-full">
        <YearlyOverviewChart data={monthly} currency={currency} year={summary?.year} />
      </div>

      {/* ── Line Chart + Pie Chart ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8">
          <OrderValueChart data={monthly} currency={currency} />
        </div>
        <div className="xl:col-span-4">
          <FinancialOverviewChart chartData={monthly} currency={currency} />
        </div>
      </div>
    </div>
  );
}

export default Reports;
