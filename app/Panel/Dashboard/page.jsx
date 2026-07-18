"use client";
import React from "react";
import { motion } from "framer-motion";
import { FaArrowTrendUp } from "react-icons/fa6";

import CardDashboard from "@/PanelComponents/CardDashboard";
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
import PieAnimation from "@/PanelComponents/Piechart";
import Table from "@/PanelComponents/Table";
import Activity from "@/PanelComponents/Activity";

function Dashboard() {
  const data = [
    {
      title: "Total Revenue",
      value: 120,
      percentage: "+20%",
      month: "Last 30 days",
      icon: FaArrowTrendUp,
    },
    {
      title: "Total Sales",
      value: 120,
      percentage: "+20%",
      month: "Last 30 days",
      icon: LuChartNoAxesCombined,
    },
    {
      title: "Total Margin",
      value: 120,
      percentage: "+20%",
      month: "Last 30 days",
      icon: MdOutlineInsertChart,
    },
    {
      title: "Total Profit",
      value: 120,
      percentage: "+20%",
      month: "Last 30 days",
      icon: LuChartSpline,
    },
  ];

  const data1 = [
    { month: "Jan", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Feb", revenue: 4500, expenses: 3500, profit: 4000 },
    { month: "Mar", revenue: 7500, expenses: 8500, profit: 9000 },
    { month: "Apr", revenue: 8500, expenses: 7500, profit: 4000 },
    { month: "May", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Jun", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Jul", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Aug", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Sep", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Oct", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Nov", revenue: 4500, expenses: 2500, profit: 2000 },
    { month: "Dec", revenue: 4500, expenses: 2500, profit: 2000 },
  ];
  return (
    <>
      <div className="flex flex-col gap-4 px-4 sm:px-6 lg:px-10 py-6">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 py-8 text-white shadow-lg shadow-blue-950/20">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">
            Nexus Panel
          </p>
          <h1 className="mt-3 text-2xl sm:text-3xl font-black">
            Dashboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm sm:text-base text-blue-100/80">
            Welcome to your dashboard. Here's an overview of your sales and performance.
          </p>
        </div>
      </div>
      <div className="bg-slate-50">
  <div className="p-4 sm:p-6 lg:p-8 pt-6 lg:pt-8">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
      {data.map((item, index) => (
        <motion.div
          key={index} // or item.id if available
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.15 }}
          whileHover={{
            y: -8,
            scale: 1.03,
          }}
          className="flex justify-between items-center rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-blue-950/5"
        >
          <CardDashboard {...item} />
        </motion.div>
      ))}
    </div>
  </div>


        {/* ── Charts Grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 px-4 sm:px-6 lg:px-8 pb-6">
          {/* SVG Gradients */}
          <svg width="0" height="0" style={{ position: "absolute" }}>
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

          <div className="bg-white min-h-96 rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col justify-center items-start pb-3">
                <h1 className="text-base font-semibold text-slate-900">
                  Revenue Overview
                </h1>
                <h3 className="text-slate-500 text-xs">
                  Monthly Revenue and Expenses
                </h3>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  <span>Revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                  <span>Expenses</span>
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height="85%">
              <BarChart
                data={data1}
                barGap={4}
                barCategoryGap="30%"
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
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
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                />

                <Bar
                  dataKey="revenue"
                  fill="url(#revenueGradient)"
                  radius={[6, 6, 0, 0]}
                  barSize={18}
                />
                <Bar
                  dataKey="expenses"
                  fill="url(#expensesGradient)"
                  radius={[6, 6, 0, 0]}
                  barSize={18}
                />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      // Force revenue first
                      const revenue = payload.find(
                        (p) => p.dataKey === "revenue",
                      );
                      const expenses = payload.find(
                        (p) => p.dataKey === "expenses",
                      );
                      return (
                        <div className="p-1 bg-black text-white rounded-lg text-sm">
                          <div>{label}</div>
                          {revenue && (
                            <div style={{ color: "#a855f7" }}>
                              Revenue: ${revenue.value.toLocaleString()}
                            </div>
                          )}
                          {expenses && (
                            <div style={{ color: "#94a3b8" }}>
                              Expenses: ${expenses.value.toLocaleString()}
                            </div>
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

          <div className="">
            <PieAnimation />
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 px-4 sm:px-6 lg:px-8 pb-6">
          <div className="bg-white h-auto rounded-2xl shadow-sm border border-slate-200/80 ">
            <Table />
          </div>
          <div className="bg-white h-auto rounded-2xl shadow-sm border border-slate-200/80 ">
            <Activity />
          </div>
        </div>
      </div>
    </>
  );
}

export default Dashboard;
