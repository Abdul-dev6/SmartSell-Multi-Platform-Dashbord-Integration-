"use client";

import { motion } from "framer-motion";
import ListingRow from "./ListingRow";

export default function ListingTable({ ListingData = [] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="mt-8 space-y-5"
    >
      {ListingData.map((item) => {
        const product = {
          ...item,
          id: item.product_id || item.inventory_item_id,
          title: item.title || "Untitled product",
          image: item.image || "/user.avif",
          sku: item.sku || "Not available",
          vendor: item.platform || "Shopify",
          collection: item.variant_title || "Default",
          price: item.price ? `$${item.price}` : "Not available",
          inventory: item.available ?? "Not tracked",
          status: item.status
            ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
            : "Unknown",
          updated: item.updated_at || "Not available",
        };
        return <ListingRow key={item.row_id ?? product.id} ListingData={product} />;
      })}
    </motion.div>
  );
}
