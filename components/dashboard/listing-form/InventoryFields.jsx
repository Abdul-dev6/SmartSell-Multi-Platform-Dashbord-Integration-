"use client";

import { makeBinder } from "@/components/dashboard/listing-form/bind";
import { motion } from "framer-motion";
import { PackageSearch } from "lucide-react";

export default function Inventory({ formData, setFormData, errors = {} }) {
  const bind = makeBinder(formData, setFormData, errors);
  const trackInventory = Boolean(formData?.trackInventory);
  const continueSelling = Boolean(formData?.continueSelling);

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      {/* Header */}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
          <PackageSearch size={22} className="text-orange-600" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-800">Inventory</h2>

          <p className="text-sm text-slate-500">
            Manage product stock and inventory details.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* SKU */}

        <div>
          <label className="block text-sm font-medium mb-2">SKU</label>

          <input
            type="text"
            {...bind("sku")}
            aria-label="SKU"
            placeholder="IPHONE16PRO"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Barcode */}

        <div>
          <label className="block text-sm font-medium mb-2">Barcode</label>

          <input
            type="text"
            {...bind("barcode")}
            aria-label="Barcode"
            placeholder="1234567890123"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Quantity */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Available Quantity
          </label>

          {/* Inventory quantities are read-only in SmartSell; set them in Shopify. */}
          <input
            type="text"
            value="Managed in Shopify"
            disabled
            aria-label="Available quantity (managed in Shopify)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500"
          />
        </div>

        {/* Warehouse */}

        <div>
          <label className="block text-sm font-medium mb-2">Warehouse</label>

          <select className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500">
            <option>Main Warehouse</option>
            <option>Lahore Warehouse</option>
            <option>Karachi Warehouse</option>
          </select>
        </div>

        {/* Track Inventory */}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...bind("trackInventory", { checkbox: true })}
            className="w-5 h-5"
          />

          <span>Track Quantity</span>
        </label>

        {/* Continue Selling */}

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...bind("continueSelling", { checkbox: true })}
            className="w-5 h-5"
          />

          <span>Continue selling when out of stock</span>
        </label>

        {/* Summary */}

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="rounded-xl bg-slate-100 p-4">
            <p className="text-sm text-slate-500">Tracking</p>

            <h3 className="text-lg font-bold text-slate-800 mt-2">
              {trackInventory ? "Enabled" : "Disabled"}
            </h3>
          </div>

          <div className="rounded-xl bg-slate-100 p-4">
            <p className="text-sm text-slate-500">Overselling</p>

            <h3 className="text-lg font-bold text-slate-800 mt-2">
              {continueSelling ? "Allowed" : "Blocked"}
            </h3>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
