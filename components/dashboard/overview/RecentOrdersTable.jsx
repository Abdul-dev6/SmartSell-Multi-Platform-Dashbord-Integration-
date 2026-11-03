import React from "react";
import { formatDate, formatMoney } from "@/components/dashboard/shared/format";

// Statuses come from Shopify's fulfillment status and cancellation date.
const statusConfig = {
  Fulfilled: {
    cls: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
  },
  "Partially fulfilled": {
    cls: "bg-sky-100 text-sky-700 border border-sky-200",
    dot: "bg-sky-500",
  },
  Unfulfilled: {
    cls: "bg-amber-100 text-amber-700 border border-amber-200",
    dot: "bg-amber-500",
  },
  Cancelled: {
    cls: "bg-red-100 text-red-700 border border-red-200",
    dot: "bg-red-500",
  },
};

const Table = ({ orders = [] }) => {
  const count = (status) => orders.filter((o) => o.status === status).length;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Recent Orders
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Latest orders synced from Shopify
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No orders synced yet.
        </p>
      ) : (
        <>
          {/* Table — scrolls horizontally on small screens only */}
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-600 to-sky-500 text-white text-xs font-semibold uppercase tracking-wide">
                  <th scope="col" className="px-5 py-3 rounded-tl-xl">Order</th>
                  <th scope="col" className="px-5 py-3">Customer</th>
                  <th scope="col" className="px-5 py-3">Product</th>
                  <th scope="col" className="px-5 py-3">Amount</th>
                  <th scope="col" className="px-5 py-3">Fulfillment</th>
                  <th scope="col" className="px-5 py-3 rounded-tr-xl">Date</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const badge = statusConfig[order.status] ?? {
                    cls: "bg-slate-100 text-slate-600 border border-slate-200",
                    dot: "bg-slate-400",
                  };
                  return (
                    <tr
                      key={order.id}
                      className="bg-white hover:bg-indigo-50/40 transition-colors duration-150 group"
                    >
                      <td className="px-5 py-3.5 text-sm font-mono font-medium text-indigo-600">
                        {order.orderId}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium text-slate-700">
                        {order.customer}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">
                        {order.product}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-slate-800">
                        {formatMoney(order.amount, order.currency)}
                        {order.paymentStatus && (
                          <span className="block text-xs font-normal text-slate-400">
                            {order.paymentStatus.replace(/_/g, " ")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {order.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {formatDate(order.date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>Showing the {orders.length} most recent orders</span>
            <div className="flex flex-wrap items-center gap-3">
              {Object.keys(statusConfig).map((status) => (
                <span key={status} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${statusConfig[status].dot}`} /> {status}: {count(status)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Table;
