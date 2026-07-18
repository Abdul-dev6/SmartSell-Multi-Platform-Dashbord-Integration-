"use client";

import { motion } from "framer-motion";
import { Search, Download } from "lucide-react";

import { statusOptions, collectionOptions, vendorOptions } from "./ListingData";

export default function ListingFilters() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 sm:p-6 mt-8"
    >
      <div className="grid grid-cols-1 xl:grid-cols-6 gap-4">
        {/* Search */}

        <div className="relative xl:col-span-2">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            type="text"
            placeholder="Search product..."
            className="
              w-full
              pl-11
              pr-4
              py-3
              rounded-xl
              border
              border-slate-300
              outline-none
              transition
              focus:ring-2
              focus:ring-indigo-500
              focus:border-indigo-500
            "
          />
        </div>

        {/* Status */}

        <select
          className="
            w-full
            rounded-xl
            border
            border-slate-300
            px-4
            py-3
            outline-none
            focus:ring-2
            focus:ring-indigo-500
          "
        >
          {statusOptions.map((status, index) => (
            <option key={index}>{status}</option>
          ))}
        </select>

        {/* Collection */}

        <select
          className="
            w-full
            rounded-xl
            border
            border-slate-300
            px-4
            py-3
            outline-none
            focus:ring-2
            focus:ring-indigo-500
          "
        >
          {collectionOptions.map((collection, index) => (
            <option key={index}>{collection}</option>
          ))}
        </select>

        {/* Vendor */}

        <select
          className="
            w-full
            rounded-xl
            border
            border-slate-300
            px-4
            py-3
            outline-none
            focus:ring-2
            focus:ring-indigo-500
          "
        >
          {vendorOptions.map((vendor, index) => (
            <option key={index}>{vendor}</option>
          ))}
        </select>

        {/* Sort */}

        <select
          className="
            w-full
            rounded-xl
            border
            border-slate-300
            px-4
            py-3
            outline-none
            focus:ring-2
            focus:ring-indigo-500
          "
        >
          <option>Newest</option>
          <option>Oldest</option>
          <option>Price: Low to High</option>
          <option>Price: High to Low</option>
          <option>Inventory</option>
        </select>

        {/* Export */}

        <button
          className="
            flex
            items-center
            justify-center
            gap-2
            w-full
            bg-indigo-600
            hover:bg-indigo-700
            text-white
            px-6
            py-3
            rounded-xl
            transition-all
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
