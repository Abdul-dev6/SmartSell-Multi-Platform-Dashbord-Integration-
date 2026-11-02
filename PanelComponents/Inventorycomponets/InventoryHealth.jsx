"use client";

import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert } from "lucide-react";

// Share of stock-tracked inventory rows (variant × location) that are in
// stock. Untracked items are excluded rather than counted as in or out.
export function inventoryHealth(inventorydata = []) {
  const tracked = inventorydata.filter((item) => typeof item.available === "number");
  const inStock = tracked.filter((item) => item.available > 0).length;
  return {
    tracked: tracked.length,
    inStock,
    outOfStock: tracked.length - inStock,
    percentage: tracked.length ? Math.round((inStock / tracked.length) * 100) : null,
  };
}

export default function InventoryHealth({ inventorydata = [] }) {
  const { tracked, inStock, outOfStock, percentage } = inventoryHealth(inventorydata);
  const good = percentage !== null && percentage >= 80;
  const Icon = good ? ShieldCheck : ShieldAlert;
  const tone = percentage === null ? "text-slate-400" : good ? "text-green-600" : percentage >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      whileHover={{
        y: -5,
        transition: { duration: 0.2 },
      }}
      className="mt-8 bg-white rounded-2xl shadow-lg p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={tone} size={24} aria-hidden="true" />

            <h2 className="text-2xl font-bold text-slate-800">
              Inventory Health
            </h2>
          </div>

          <p className="text-slate-500 mt-3">
            {percentage === null
              ? "No stock-tracked items yet."
              : `${inStock} of ${tracked} stock-tracked items are in stock${outOfStock ? `; ${outOfStock} out of stock` : ""}.`}
          </p>
        </div>

        <span className={`text-3xl font-bold ${tone}`}>
          {percentage === null ? "—" : `${percentage}%`}
        </span>
      </div>

      <div className="mt-8">
        <div
          className="w-full bg-slate-200 rounded-full h-4 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage ?? undefined}
          aria-label="Share of stock-tracked items in stock"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage ?? 0}%` }}
            transition={{
              duration: 1.2,
              ease: "easeOut",
            }}
            className="h-full rounded-full bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500"
          />
        </div>

        <div className="flex justify-between mt-3 text-sm text-slate-500">
          <span>0%</span>
          <span>50%</span>
          <span>100% in stock</span>
        </div>
      </div>
    </motion.div>
  );
}
