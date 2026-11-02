"use client";

import { motion } from "framer-motion";
import { Layers, PackageCheck, AlertCircle, PackageX } from "lucide-react";

const iconMap = [Layers, PackageCheck, AlertCircle, PackageX];
const bgMap = [
  "bg-indigo-500 shadow-indigo-200",
  "bg-emerald-500 shadow-emerald-200",
  "bg-amber-500 shadow-amber-200",
  "bg-red-500 shadow-red-200",
];



export default function InventoryCards({ inventorydata = [] }) {
  const totalSku = new Set(inventorydata.map((item) => item.sku)).size;
  const totalProducts = inventorydata.length;
  // Untracked items (available === null) count as neither in nor out of stock.
  const inStockProducts = inventorydata.filter(
    (item) => typeof item.available === "number" && item.available > 0,
  ).length;
  const outOfStockProducts = inventorydata.filter(
    (item) => typeof item.available === "number" && item.available <= 0,
  ).length;
  const untrackedProducts = inventorydata.filter(
    (item) => typeof item.available !== "number",
  ).length;

  // No historical snapshots are stored yet, so no period-over-period change is shown.
  const inventoryStats = [
    { id: 1, title: "Total SKUs", value: totalSku, description: "Unique SKUs" },
    { id: 2, title: "Inventory Rows", value: totalProducts, description: "Variant × location" },
    { id: 3, title: "In Stock", value: inStockProducts, description: "Quantity above 0" },
    {
      id: 4,
      title: "Out of Stock",
      value: outOfStockProducts,
      description: untrackedProducts ? `${untrackedProducts} not tracked` : "Quantity 0 or less",
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-8">
      {inventoryStats.map((item, index) => {
        const Icon = iconMap[index] ?? Layers;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02, y: -6 }}
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
              <h2 className="text-3xl font-bold text-slate-900">
                {item.value}
              </h2>
              <p className="mt-2 text-xs text-slate-400">{item.description}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
