"use client";

import { makeBinder } from "./bind";

import { motion } from "framer-motion";
import { Package } from "lucide-react";

export default function GeneralInformation({ formData, setFormData, errors = {} }) {
  const bind = makeBinder(formData, setFormData, errors);

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
    >
      {/* Header */}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Package className="text-indigo-600" size={22} />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            General Information
          </h2>

          <p className="text-sm text-slate-500">
            Basic information about your product.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Product Title */}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Product Title
          </label>

          <input
            type="text"
            {...bind("title")}
            aria-label="Product title"
            required
            placeholder="e.g. iPhone 16 Pro Max"
            className="
              w-full
              rounded-xl
              border
              border-slate-300
              px-4
              py-3
              outline-none
              transition
              focus:ring-2
              focus:ring-indigo-500
              focus:border-indigo-500
            "
          />
        </div>

        {/* Description */}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Description
          </label>

          <textarea
            rows={8}
            {...bind("description")}
            aria-label="Description"
            placeholder="Write a detailed product description..."
            className="
              w-full
              rounded-xl
              border
              border-slate-300
              px-4
              py-3
              resize-none
              outline-none
              transition
              focus:ring-2
              focus:ring-indigo-500
              focus:border-indigo-500
            "
          />

          <div className="flex justify-end mt-2">
            <span className="text-xs text-slate-400">0 / 5000 characters</span>
          </div>
        </div>

        {/* Vendor + Product Type */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Vendor
            </label>

            <input
              type="text"
              {...bind("vendor")}
              aria-label="Vendor"
              placeholder="Apple"
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Product Type
            </label>

            <input
              type="text"
              {...bind("productType")}
              aria-label="Product type"
              placeholder="Smartphone"
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
            />
          </div>
        </div>

        {/* Tags */}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Tags
          </label>

          <input
            type="text"
            {...bind("tags")}
            aria-label="Tags, comma separated"
            placeholder="iphone, apple, mobile, ios"
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
          />

          <p className="text-xs text-slate-500 mt-2">
            Separate tags using commas (,)
          </p>
        </div>
      </div>
    </motion.div>
  );
}
