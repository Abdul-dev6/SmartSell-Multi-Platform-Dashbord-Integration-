"use client";

import { motion } from "framer-motion";
import { listingStats } from "./ListingData";

export default function ListingStats() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-8">
      {listingStats.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.15 }}
          whileHover={{
            y: -6,
            scale: 1.02,
          }}
          className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-500 text-sm">{item.title}</p>

              <h2 className="text-3xl font-bold mt-3 text-slate-800">
                {item.value}
              </h2>
            </div>

            <div
              className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center text-white font-bold`}
            >
              {item.value.charAt(0)}
            </div>
          </div>

          <div className="mt-6">
            <span className="text-green-600 font-semibold">{item.change}</span>

            <span className="text-slate-500 text-sm ml-2">vs last month</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
