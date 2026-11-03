"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function CreateListingHeader({
  title = "Create Shopify Listing",
  subtitle = "Add a new product and publish it directly to your Shopify store.",
  backHref = "/Panel/Ecommerce/Listing",
  backLabel = "Back to Listings",
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-8"
    >
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        {backLabel}
      </Link>

      <h1 className="text-3xl font-bold text-slate-800 mt-4">{title}</h1>

      <p className="text-slate-500 mt-2">{subtitle}</p>
    </motion.div>
  );
}
