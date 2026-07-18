"use client";

import { motion } from "framer-motion";

import ProductHeader from "@/PanelComponents/productHeader";
import ProductStats from "@/PanelComponents/ProductStat";
import SearchFilter from "@/PanelComponents/SeachFilter";
import ProductTable from "@/PanelComponents/ProductTable";
export default function ProductsPage() {
  return (
    <motion.div
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      transition={{
        duration: 0.4,
      }}
      className="p-4 sm:p-6 lg:p-8 bg-slate-50 min-h-screen"
    >
      <ProductHeader />

      <ProductStats />

      <SearchFilter />

      <ProductTable />
    </motion.div>
  );
}
