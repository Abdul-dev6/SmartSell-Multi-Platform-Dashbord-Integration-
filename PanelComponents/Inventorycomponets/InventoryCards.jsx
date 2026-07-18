"use client";

import { motion } from "framer-motion";
import { inventoryStats } from "./InventoryData";

export default function InventoryCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-8">
      {inventoryStats.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.15 }}
          whileHover={{
            scale: 1.03,
            y: -8,
          }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className={`w-12 h-12 rounded-full ${item.color} flex items-center justify-center text-white font-bold`}>
            {item.id}
          </div>

          <h2 className="text-3xl font-bold mt-5">{item.value}</h2>

          <p className="text-slate-500 mt-2">{item.title}</p>

          <p className="text-green-600 font-medium mt-4">{item.change}</p>

          <p className="text-sm text-slate-400">{item.description}</p>
        </motion.div>
      ))}
    </div>
  );
}
