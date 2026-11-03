import React from "react";
import { formatMoney } from "@/components/dashboard/shared/format";

// Best-selling products by units over the last 30 days, from synced orders.
function Activity({ products = [], currency }) {
  const totalUnits = products.reduce((sum, p) => sum + Number(p.units || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center px-5 pt-5 pb-3">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Top Products</h1>
          <p className="text-xs text-slate-400 mt-0.5">Units sold, last 30 days</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-slate-100" />

      {/* List */}
      {products.length === 0 ? (
        <p className="flex-1 px-5 py-10 text-center text-sm text-slate-500">
          No sales in the last 30 days.
        </p>
      ) : (
        <ol className="flex flex-col gap-1 px-3 py-3 flex-1">
          {products.map((item, index) => (
            <li
              key={item.productId ?? index}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors duration-150 group cursor-default"
            >
              {/* Rank + Info */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-700 transition-colors truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-400">{formatMoney(item.revenue, currency)}</p>
                </div>
              </div>

              <span className="ml-2 shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                {item.units} sold
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* Footer */}
      <div className="mx-5 mb-4 mt-auto pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-400 text-center">
          Total units sold:{" "}
          <span className="font-semibold text-slate-600">{totalUnits}</span>
        </p>
      </div>
    </div>
  );
}

export default Activity;
