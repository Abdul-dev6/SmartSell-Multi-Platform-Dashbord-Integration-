"use client";

import { motion } from "framer-motion";
import { health } from "./InventoryData";
import { ShieldCheck, TrendingUp } from "lucide-react";

export default function InventoryHealth() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      whileHover={{
        y: -5,
        transition: { duration: 0.2 },
      }}
      className="mt-8 bg-white rounded-2xl shadow-lg p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-green-600" size={24} />

            <h2 className="text-2xl font-bold text-slate-800">
              {health.title}
            </h2>
          </div>

          <p className="text-slate-500 mt-3">{health.description}</p>
        </div>

        <div className="flex items-center gap-2">
          <TrendingUp className="text-green-600" size={22} />

          <span className="text-3xl font-bold text-green-600">
            {health.percentage}%
          </span>
        </div>
      </div>

      <div className="mt-8">
        <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${health.percentage}%` }}
            transition={{
              duration: 1.2,
              ease: "easeOut",
            }}
            className="h-full rounded-full bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500"
          />
        </div>

        <div className="flex justify-between mt-3 text-sm text-slate-500">
          <span>Poor</span>
          <span>Average</span>
          <span>Excellent</span>
        </div>
      </div>
    </motion.div>
  );
}
