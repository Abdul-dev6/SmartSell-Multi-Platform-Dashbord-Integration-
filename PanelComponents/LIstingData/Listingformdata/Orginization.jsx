"use client";

import { makeBinder } from "./bind";

import { motion } from "framer-motion";
import { FolderTree } from "lucide-react";

export default function Organization({ formData, setFormData, errors = {} }) {
  const bind = makeBinder(formData, setFormData, errors);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      {/* Header */}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
          <FolderTree size={22} className="text-indigo-600" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-800">Organization</h2>

          <p className="text-sm text-slate-500">
            Organize and publish your product.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Status */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Product Status
          </label>

          <select
            {...bind("status")}
            aria-label="Product status"
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
          >
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Collection */}

        <div>
          <label className="block text-sm font-medium mb-2">Collection</label>

          <input
            type="text"
            placeholder="Summer Collection"
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

        {/* Category */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Product Category
          </label>

          <input
            type="text"
            placeholder="Electronics"
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

        {/* Sales Channel */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Sales Channel
          </label>

          <select
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
          >
            <option>Shopify</option>
          </select>
        </div>

        {/* Visibility */}

        <div>
          <label className="block text-sm font-medium mb-3">Visibility</label>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="visibility" defaultChecked />
              <span>Online Store</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="visibility" />
              <span>Hidden</span>
            </label>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
