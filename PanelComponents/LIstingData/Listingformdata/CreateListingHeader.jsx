"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Save, UploadCloud } from "lucide-react";

export default function CreateListingHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8"
    >
      {/* Left */}

      <div>
        <Link
          href="/Panel/Listings"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition"
        >
          <ArrowLeft size={18} />
          Back to Listings
        </Link>

        <h1 className="text-3xl font-bold text-slate-800 mt-4">
          Create Shopify Listing
        </h1>

        <p className="text-slate-500 mt-2">
          Add a new product and publish it directly to your Shopify store.
        </p>
      </div>

      {/* Right */}

      <div className="flex flex-wrap gap-3">
        <button
          className="
          flex items-center gap-2
          px-5 py-3
          rounded-xl
          border
          border-slate-300
          bg-white
          hover:bg-slate-50
          transition-all
        "
        >
          <Save size={18} />
          Save Draft
        </button>

        <button
          className="
          flex items-center gap-2
          px-6 py-3
          rounded-xl
          bg-indigo-600
          hover:bg-indigo-700
          text-white
          shadow-lg
          hover:scale-105
          transition-all
        "
        >
          <UploadCloud size={18} />
          Publish Product
        </button>
      </div>
    </motion.div>
  );
}
