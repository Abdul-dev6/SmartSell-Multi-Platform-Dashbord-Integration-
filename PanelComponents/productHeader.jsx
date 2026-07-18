"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";

export default function ProductHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col md:flex-row md:items-center md:justify-between gap-5"
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Products</h1>

        <p className="text-slate-500 mt-2 max-w-2xl">
          Manage all your marketplace products.
        </p>
      </div>

      <button
        className="
        flex items-center gap-2
        bg-indigo-600
        hover:bg-indigo-700
        text-white
        px-6
        py-3
        rounded-xl
        transition
        duration-300
        shadow-lg
        hover:shadow-xl
        hover:scale-105
        "
      >
        <Plus size={18} />
        Add Product
      </button>
    </motion.div>
  );
}
