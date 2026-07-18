"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

export default function InventoryHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Inventory Management
        </h1>

        <p className="text-slate-500 mt-2">
          Monitor stock levels across all connected marketplaces.
        </p>
      </div>

      <button
        className="
        flex
        items-center
        justify-center
        gap-2
        rounded-xl
        bg-indigo-600
        px-6
        py-3
        font-medium
        text-white
        transition
        duration-300
        hover:bg-indigo-700
        hover:scale-105
        shadow-lg
      "
      >
        <Plus size={18} />
        Update Inventory
      </button>
    </motion.div>
  );
}
