"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatMoney } from "@/components/dashboard/shared/format";

const COLORS = ["#64748b", "#6366f1"];

const CustomTooltip = ({ active, payload, total, currency }) => {
  if (active && payload && payload.length) {
    const item = payload[0];

    return (
      <div className="bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl">
        <p className="font-semibold">{item.name}</p>

        <p className="text-slate-300">
          {formatMoney(item.value, currency)} &mdash;{" "}
          {total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%
        </p>
      </div>
    );
  }

  return null;
};

// Splits the year's revenue into recorded expenses and what remains (profit).
// Both slices are parts of revenue, so they add up to the whole.
const PieChartComponent = ({ chartData = [], currency }) => {
  const totalRevenue = chartData.reduce(
    (total, item) => total + Number(item.revenue || 0),
    0,
  );

  const totalExpense = chartData.reduce(
    (total, item) => total + Number(item.expense || 0),
    0,
  );

  const totalProfit = totalRevenue - totalExpense;

  const pieData = [
    {
      name: "Expenses",
      value: totalExpense,
    },
    {
      name: "Profit",
      value: Math.max(totalProfit, 0),
    },
  ];

  const total = totalRevenue;
  const canChart = totalRevenue > 0 && totalProfit >= 0;

  return (
    <div className="bg-white p-5 rounded-2xl h-full min-h-72 flex flex-col shadow-sm border border-slate-200/80">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-base font-semibold text-slate-900">
          Financial Overview
        </h1>

        <p className="text-xs text-slate-400 mt-0.5">
          Revenue this year: {formatMoney(totalRevenue, currency)}
        </p>
      </div>

      {/* Donut Chart */}
      <div className="flex-1 min-h-0">
        {canChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={3}
                isAnimationActive={true}
                animationDuration={1200}
              >
                {pieData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    stroke="transparent"
                  />
                ))}
              </Pie>

              <Tooltip
                content={({ active, payload }) => (
                  <CustomTooltip
                    active={active}
                    payload={payload}
                    total={total}
                    currency={currency}
                  />
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center py-10 text-center text-sm text-slate-500">
            {totalRevenue <= 0
              ? "No revenue recorded this year."
              : "Expenses exceed revenue this year."}
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
        {pieData.map((item, index) => (
          <div
            key={item.name}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: COLORS[index],
                }}
              />

              <span className="text-xs text-slate-600 font-medium">
                {item.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800">
                {formatMoney(item.name === "Profit" ? totalProfit : item.value, currency)}
              </span>

              <span className="text-xs text-slate-400">
                {total > 0
                  ? `${((item.value / total) * 100).toFixed(1)}%`
                  : "0%"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PieChartComponent;
