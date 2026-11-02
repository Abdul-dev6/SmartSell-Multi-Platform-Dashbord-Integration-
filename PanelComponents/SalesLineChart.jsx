import React from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import { formatMoney } from "./format";

// Average order value per month. Months without orders have no average, so
// they are left as gaps rather than drawn as 0.
export function SalesLineChart({ data = [], currency }) {
  const hasData = data.some((m) => m.orders > 0);

  return (
    <div className="w-full h-full p-4 bg-white rounded-2xl shadow-sm flex flex-col justify-center">
      <h3 className="text-xl font-bold text-gray-800 mb-1 px-2">
        Average Order Value
      </h3>
      <p className="mb-2 px-2 text-xs text-slate-500">
        Revenue divided by orders, per month
      </p>
      {hasData ? (
        <LineChart
          xAxis={[{ scaleType: "point", data: data.map((m) => m.month) }]}
          yAxis={[{ valueFormatter: (v) => formatMoney(v, currency, { compact: true }) }]}
          series={[
            {
              data: data.map((m) => m.averageOrderValue ?? null),
              label: "Avg. order value",
              connectNulls: false,
              valueFormatter: (v) => (v === null ? "No orders" : formatMoney(v, currency)),
              color: "#8b5cf6", // Tailwind Violet 500
            },
          ]}
          height={300}
        />
      ) : (
        <p className="py-16 text-center text-sm text-slate-500">No orders this year yet.</p>
      )}
    </div>
  );
}
