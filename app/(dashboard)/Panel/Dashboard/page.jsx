"use client";

import { motion } from "framer-motion";
import { FaArrowTrendUp } from "react-icons/fa6";

import StatCard from "@/components/dashboard/overview/StatCard";
import { LuChartNoAxesCombined } from "react-icons/lu";
import { MdOutlineInsertChart } from "react-icons/md";
import { LuChartSpline } from "react-icons/lu";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import FinancialOverviewChart from "@/components/dashboard/overview/FinancialOverviewChart";
import RecentOrdersTable from "@/components/dashboard/overview/RecentOrdersTable";
import TopProducts from "@/components/dashboard/overview/TopProducts";
import SyncStatus from "@/components/dashboard/shared/SyncStatus";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import { formatMoney } from "@/components/dashboard/shared/format";

function Dashboard() {
  const { body, error, loading, reload } = useApiData("/api/dashboard/summary");
  const summary = body?.data;
  const currency = summary?.currency;
  const chartData = summary?.monthly || [];
  const vsLastMonth = "vs last month";

  const cards = summary
    ? [
        {
          title: `Revenue (${summary.monthLabel})`,
          value: formatMoney(summary.current.revenue, currency),
          percentage: summary.change.revenue,
          month: vsLastMonth,
          icon: FaArrowTrendUp,
        },
        {
          title: `Orders (${summary.monthLabel})`,
          value: summary.current.orders.toLocaleString(),
          percentage: summary.change.orders,
          month: vsLastMonth,
          icon: MdOutlineInsertChart,
        },
        {
          title: "Avg. Order Value",
          value: formatMoney(summary.current.averageOrderValue, currency),
          percentage: summary.change.averageOrderValue,
          month: vsLastMonth,
          icon: LuChartSpline,
        },
        {
          title: `Expenses (${summary.monthLabel})`,
          value: formatMoney(summary.current.expense, currency),
          percentage: summary.change.expense,
          month: vsLastMonth,
          icon: LuChartNoAxesCombined,
          goodWhenUp: false,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 px-4 sm:px-6 lg:px-8 py-6 bg-slate-50 min-h-screen">
      {/* ── Hero Banner ── */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 py-8 text-white shadow-lg shadow-blue-950/20">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">
          Nexus Panel
        </p>

        <h1 className="mt-2 text-2xl sm:text-3xl font-black">Dashboard</h1>

        <p className="mt-1.5 max-w-2xl text-sm text-blue-100/70">
          Welcome back! Here&apos;s an overview of your sales and performance.
        </p>
      </div>

      {summary && (
        <SyncStatus
          hasStore={summary.hasStore}
          sync={summary.sync}
          onSynced={reload}
          autoSyncIfNever
        />
      )}

      <LoadState loading={loading && !summary} error={error} onRetry={reload} />

      {summary?.otherCurrencies?.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Figures are in {currency}.{" "}
          {summary.otherCurrencies
            .map((c) => `${c.orders} order${c.orders === 1 ? "" : "s"} in ${c.currency}`)
            .join(", ")}{" "}
          {summary.otherCurrencies.length === 1 ? "is" : "are"} not included (no currency conversion).
        </p>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
        {cards.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -6, scale: 1.02 }}
            className="flex justify-between items-center rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-blue-950/5"
          >
            <StatCard {...item} />
          </motion.div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* SVG Gradients */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" />

              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>

            <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" />

              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
          </defs>
        </svg>

        {/* Bar Chart */}
        <div className="xl:col-span-2 bg-white min-h-96 rounded-2xl p-5 shadow-sm border border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                Revenue Overview {summary?.year}
              </h1>

              <h3 className="text-slate-400 text-xs mt-0.5" title={summary?.definitions?.revenue}>
                Monthly revenue vs recorded expenses
                {summary?.timezone ? ` · ${summary.timezone}` : ""}
              </h3>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>Revenue</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span>Expenses</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              barGap={4}
              barCategoryGap="30%"
              margin={{
                top: 5,
                right: 10,
                left: 0,
                bottom: 5,
              }}
            >
              <CartesianGrid
                strokeDasharray="0"
                vertical={false}
                stroke="#f1f5f9"
              />

              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "#94a3b8",
                  fontSize: 11,
                }}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "#94a3b8",
                  fontSize: 11,
                }}
                tickFormatter={(val) => formatMoney(val, currency, { compact: true })}
              />

              <Bar
                dataKey="revenue"
                fill="url(#revenueGradient)"
                radius={[6, 6, 0, 0]}
                barSize={14}
              />

              <Bar
                dataKey="expense"
                fill="url(#expensesGradient)"
                radius={[6, 6, 0, 0]}
                barSize={14}
              />

              <Tooltip
                cursor={{
                  fill: "rgba(148,163,184,0.08)",
                }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const revenue = payload.find(
                      (p) => p.dataKey === "revenue",
                    );

                    const expense = payload.find(
                      (p) => p.dataKey === "expense",
                    );

                    const orders = payload[0]?.payload?.orders;

                    return (
                      <div className="bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="font-semibold mb-1">{label}</p>

                        {revenue && (
                          <p className="text-indigo-300">
                            Revenue: {formatMoney(revenue.value, currency)}
                            {orders !== undefined ? ` (${orders} orders)` : ""}
                          </p>
                        )}

                        {expense && (
                          <p className="text-slate-400">
                            Expenses: {formatMoney(expense.value, currency)}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return null;
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top products */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <TopProducts products={summary?.topProducts || []} currency={currency} />
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Pie Chart */}
        <div>
          <FinancialOverviewChart chartData={chartData} currency={currency} />
        </div>

        {/* Table */}
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5">
          <RecentOrdersTable orders={summary?.recentOrders || []} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
