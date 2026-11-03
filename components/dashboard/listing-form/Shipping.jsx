"use client";

import { motion } from "framer-motion";
import { Truck } from "lucide-react";

export default function Shipping() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      {/* Header */}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
          <Truck size={22} className="text-blue-600" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-800">Shipping</h2>

          <p className="text-sm text-slate-500">
            Configure shipping information for this product.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Not sent to Shopify yet. Set shipping details in Shopify admin.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Physical Product */}

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" defaultChecked className="w-5 h-5" />

          <span>This is a physical product</span>
        </label>

        {/* Weight */}

        <div>
          <label className="block text-sm font-medium mb-2">Weight (kg)</label>

          <input
            type="number"
            step="0.01"
            placeholder="0.50"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Dimensions */}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Length</label>

            <input
              type="number"
              placeholder="20"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Width</label>

            <input
              type="number"
              placeholder="10"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Height</label>

            <input
              type="number"
              placeholder="5"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Country */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Country of Origin
          </label>

          <select className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500">
            <option>Pakistan</option>
            <option>United States</option>
            <option>China</option>
            <option>United Kingdom</option>
          </select>
        </div>

        {/* HS Code */}

        <div>
          <label className="block text-sm font-medium mb-2">HS Code</label>

          <input
            type="text"
            placeholder="8517.13"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Summary */}

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800">Shipping Summary</h3>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Physical Product</span>
              <span>Yes</span>
            </div>

            <div className="flex justify-between">
              <span>Weight Unit</span>
              <span>Kilograms</span>
            </div>

            <div className="flex justify-between">
              <span>Dimension Unit</span>
              <span>Centimeters</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
