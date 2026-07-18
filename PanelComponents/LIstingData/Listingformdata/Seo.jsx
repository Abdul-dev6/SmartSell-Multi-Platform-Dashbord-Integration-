"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";

export default function Seo() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [handle, setHandle] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      {/* Header */}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center">
          <Search size={22} className="text-purple-600" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            Search Engine Listing
          </h2>

          <p className="text-sm text-slate-500">
            Improve how your product appears in Google and other search engines.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* SEO Title */}

        <div>
          <label className="block text-sm font-medium mb-2">SEO Title</label>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Apple iPhone 16 Pro"
            maxLength={70}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="text-right text-xs text-slate-500 mt-2">
            {title.length}/70
          </div>
        </div>

        {/* Description */}

        <div>
          <label className="block text-sm font-medium mb-2">
            Meta Description
          </label>

          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={160}
            placeholder="Describe your product for search engines..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 resize-none outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="text-right text-xs text-slate-500 mt-2">
            {description.length}/160
          </div>
        </div>

        {/* URL Handle */}

        <div>
          <label className="block text-sm font-medium mb-2">URL Handle</label>

          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="iphone-16-pro"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Preview */}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="font-semibold mb-4">Google Preview</h3>

          <p className="text-blue-700 text-lg font-medium">
            {title || "Your Product Title"}
          </p>

          <p className="text-green-700 text-sm mt-1">
            https://yourstore.com/products/
            {handle || "product-handle"}
          </p>

          <p className="text-slate-600 text-sm mt-2">
            {description ||
              "Your meta description will appear here when customers search for your product."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
