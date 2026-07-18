"use client";

import { motion } from "framer-motion";
import stats from "./Dummydata";

export default function ProductStats() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-8">
      {stats.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{
            opacity: 0,
            y: 40,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: index * 0.15,
          }}
          whileHover={{
            y: -8,
            scale: 1.03,
          }}
          className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200"
        >
          <div className={`w-12 h-12 rounded-full ${item.color} flex items-center justify-center text-white font-bold`}>
            {item.id}
          </div>

          <h2 className="text-3xl font-bold mt-5 text-slate-900">{item.value}</h2>

          <p className="text-slate-500 mt-2">{item.title}</p>
        </motion.div>
      ))}
    </div>
  );
}
