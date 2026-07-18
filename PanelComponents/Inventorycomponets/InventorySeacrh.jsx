"use client";

import { motion } from "framer-motion";
import { Search, Download } from "lucide-react";

import {
  marketplaceOptions,
  warehouseOptions,
  statusOptions,
} from "./InventoryData";

export default function InventorySearch() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="mt-8 bg-white rounded-2xl shadow-lg p-4 sm:p-6"
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* Search Box */}

        <div className="relative xl:col-span-2">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />

          <input
            type="text"
            placeholder="Search products, SKU..."
            className="
              w-full
              rounded-xl
              border
              border-slate-300
              bg-white
              pl-11
              pr-4
              py-3
              outline-none
              transition
              duration-300
              focus:ring-2
              focus:ring-indigo-500
              focus:border-indigo-500
            "
          />
        </div>

        {/* Marketplace */}

        <select
          className="
            w-full
            rounded-xl
            border
            border-slate-300
            bg-white
            px-4
            py-3
            outline-none
            transition
            duration-300
            focus:ring-2
            focus:ring-indigo-500
          "
        >
          {marketplaceOptions.map((item, index) => (
            <option key={index}>{item}</option>
          ))}
        </select>

        {/* Warehouse */}

        <select
          className="
            w-full
            rounded-xl
            border
            border-slate-300
            bg-white
            px-4
            py-3
            outline-none
            transition
            duration-300
            focus:ring-2
            focus:ring-indigo-500
          "
        >
          {warehouseOptions.map((item, index) => (
            <option key={index}>{item}</option>
          ))}
        </select>

        {/* Status */}

        <select
          className="
            w-full
            rounded-xl
            border
            border-slate-300
            bg-white
            px-4
            py-3
            outline-none
            transition
            duration-300
            focus:ring-2
            focus:ring-indigo-500
          "
        >
          {statusOptions.map((item, index) => (
            <option key={index}>{item}</option>
          ))}
        </select>

        {/* Export */}

        <button
          className="
            flex
            items-center
            justify-center
            gap-2
            w-full
            rounded-xl
            bg-indigo-600
            px-6
            py-3
            font-medium
            text-white
            transition-all
            duration-300
            hover:bg-indigo-700
            hover:scale-105
            shadow-lg
          "
        >
          <Download size={18} />
          Export
        </button>
      </div>
    </motion.div>
  );
}
