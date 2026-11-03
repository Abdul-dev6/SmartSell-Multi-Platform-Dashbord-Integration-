"use client";

import { motion } from "framer-motion";
import { LayoutGrid, CheckCircle2, FileStack, PackageX } from "lucide-react";


const iconMap = [LayoutGrid, CheckCircle2, FileStack, PackageX];
const bgMap = [
  "bg-indigo-500 shadow-indigo-200",
  "bg-emerald-500 shadow-emerald-200",
  "bg-amber-500 shadow-amber-200",
  "bg-red-500 shadow-red-200",
];

export default function ListingCards({ ListingData = [] }) {
  // Rows are one per variant per location; count each product once.
  const products = [...new Map(ListingData.map((item) => [item.product_id, item])).values()];
  const countStatus = (status) => products.filter((item) => item.status === status).length;

  // No history is stored yet, so no period-over-period change is shown.
  const listingStats = [
    { id: 1, title: "Total Products", value: products.length },
    { id: 2, title: "Draft", value: countStatus("draft") },
    { id: 3, title: "Active", value: countStatus("active") },
    { id: 4, title: "Archived", value: countStatus("archived") },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-8">
      {listingStats.map((item, index) => {
        const Icon = iconMap[index] ?? LayoutGrid;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -6, scale: 1.02 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 font-medium">{item.title}</p>
              <div
                className={`w-10 h-10 rounded-xl ${bgMap[index]} shadow-lg flex items-center justify-center`}
              >
                <Icon size={18} className="text-white" />
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold text-slate-900 mt-1">
                {item.value}
              </h2>
              <p className="text-xs text-slate-400 mt-2">Products</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
