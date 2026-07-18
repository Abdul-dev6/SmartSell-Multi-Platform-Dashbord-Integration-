"use client";

import { motion } from "framer-motion";
import ListingRow from "./ListingRow";
import { listings } from "./ListingData";

export default function ListingTable() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="mt-8 space-y-5"
    >
      {listings.map((product) => (
        <ListingRow key={product.id} product={product} />
      ))}
    </motion.div>
  );
}
