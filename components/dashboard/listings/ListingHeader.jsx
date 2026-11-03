"use client";

import { motion } from "framer-motion";
import { Plus, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
export default function ListingHeader() {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: -25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Shopify Listings</h1>

        <p className="text-slate-500 mt-2 max-w-2xl">
          Manage all your Shopify products from one dashboard.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          className="
          flex
          items-center
          gap-2
          px-5
          py-3
          rounded-xl
          bg-white
          border
          border-slate-300
          hover:bg-slate-100
          transition
        "
        >
          <RefreshCcw size={18} />
          Sync Products
        </button>

        <button
          onClick={() => router.push("/Panel/Ecommerce/Listing/CreateListing")}
          className="
          flex
          items-center
          gap-2
          px-6
          py-3
          rounded-xl
          bg-indigo-600
          text-white
          hover:bg-indigo-700
          hover:scale-105
          transition-all
          shadow-lg
        "
        >
          <Plus size={18} />
          Create Listing
        </button>
      </div>
    </motion.div>
  );
}
