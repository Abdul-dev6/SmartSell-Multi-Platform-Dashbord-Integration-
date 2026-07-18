"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { DollarSign } from "lucide-react";

export default function Pricing() {
  const [price, setPrice] = useState("");
  const [comparePrice, setComparePrice] = useState("");
  const [cost, setCost] = useState("");

  const sellingPrice = Number(price) || 0;
  const costPrice = Number(cost) || 0;

  const profit = sellingPrice - costPrice;

  const margin =
    sellingPrice > 0 ? ((profit / sellingPrice) * 100).toFixed(2) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      {/* Header */}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
          <DollarSign size={22} className="text-green-600" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-800">Pricing</h2>

          <p className="text-sm text-slate-500">
            Set your selling price and product cost.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Price */}

        <div>
          <label className="block text-sm font-medium mb-2">Price</label>

          <input
            type="number"
            placeholder="999"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="
              w-full
              border
              border-slate-300
              rounded-xl
              px-4
              py-3
              outline-none
              focus:ring-2
              focus:ring-indigo-500
            "
          />
        </div>

        {/* Compare Price */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Compare-at Price
          </label>

          <input
            type="number"
            placeholder="1200"
            value={comparePrice}
            onChange={(e) => setComparePrice(e.target.value)}
            className="
              w-full
              border
              border-slate-300
              rounded-xl
              px-4
              py-3
              outline-none
              focus:ring-2
              focus:ring-indigo-500
            "
          />
        </div>

        {/* Cost */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Cost Per Item
          </label>

          <input
            type="number"
            placeholder="850"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="
              w-full
              border
              border-slate-300
              rounded-xl
              px-4
              py-3
              outline-none
              focus:ring-2
              focus:ring-indigo-500
            "
          />
        </div>

        {/* Profit */}

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-100 rounded-xl p-4">
            <p className="text-sm text-slate-500">Profit</p>

            <h2 className="text-2xl font-bold text-green-600 mt-2">
              ${profit.toFixed(2)}
            </h2>
          </div>

          <div className="bg-slate-100 rounded-xl p-4">
            <p className="text-sm text-slate-500">Margin</p>

            <h2 className="text-2xl font-bold text-indigo-600 mt-2">
              {margin}%
            </h2>
          </div>
        </div>

        {/* Tax */}

        <label className="flex items-center gap-3 mt-2 cursor-pointer">
          <input type="checkbox" className="w-5 h-5" />

          <span className="text-sm">Charge tax on this product</span>
        </label>
      </div>
    </motion.div>
  );
}
