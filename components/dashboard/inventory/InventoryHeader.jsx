"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { shopifyAdminUrl } from "@/components/dashboard/products/deleteProduct";

// Stock quantities are read-only in SmartSell, so this opens Shopify's own
// inventory page (shown once the store is known).
export default function InventoryHeader({ shop = null }) {
  const inventoryUrl = shopifyAdminUrl.inventory(shop);
  return (
    <motion.div
      initial={{ opacity: 0, y: -25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Inventory Management
        </h1>

        <p className="text-slate-500 mt-2">
          Monitor stock levels across all connected marketplaces.
        </p>
      </div>

      {inventoryUrl && (
        <a
          href={inventoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="
        flex
        items-center
        justify-center
        gap-2
        rounded-xl
        bg-indigo-600
        px-6
        py-3
        font-medium
        text-white
        transition
        duration-300
        hover:bg-indigo-700
        hover:scale-105
        shadow-lg
      "
        >
          <ExternalLink size={18} aria-hidden="true" />
          Edit stock in Shopify
        </a>
      )}
    </motion.div>
  );
}
