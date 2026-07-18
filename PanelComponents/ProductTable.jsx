"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Eye, Pencil, Trash2 } from "lucide-react";

import products from "./ProductData";

export default function ProductTable() {
  const badgeColor = (status) => {
    switch (status) {
      case "Published":
        return "bg-green-100 text-green-700";

      case "Draft":
        return "bg-yellow-100 text-yellow-700";

      default:
        return "bg-red-100 text-red-700";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-8 overflow-x-auto rounded-2xl bg-white shadow-lg border border-slate-200"
    >
      <table className="w-full min-w-[920px]">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-6 py-4 text-left">Product</th>

            <th className="text-left">SKU</th>

            <th className="text-left">Marketplace</th>

            <th className="text-left">Price</th>

            <th className="text-left">Stock</th>

            <th className="text-left">Status</th>

            <th className="text-center">Actions</th>
          </tr>
        </thead>

        <tbody>
          {products.map((item) => (
            <motion.tr
              key={item.id}
              whileHover={{
                backgroundColor: "#F8FAFC",
              }}
              className="border-b"
            >
              <td className="px-6 py-5">
                <div className="flex items-center gap-4">
                  <Image
                    src={item.image}
                    alt={item.name}
                    width={55}
                    height={55}
                    className="rounded-lg border"
                  />

                  <div>
                    <h2 className="font-semibold">{item.name}</h2>
                  </div>
                </div>
              </td>

              <td>{item.sku}</td>

              <td>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-600">
                  {item.marketplace}
                </span>
              </td>

              <td>{item.price}</td>

              <td>{item.stock}</td>

              <td>
                <span
                  className={`rounded-full px-3 py-1 text-sm ${badgeColor(
                    item.status,
                  )}`}
                >
                  {item.status}
                </span>
              </td>

              <td>
                <div className="flex justify-center gap-3">
                  <button className="rounded-lg bg-blue-100 p-2 hover:bg-blue-200">
                    <Eye size={18} />
                  </button>

                  <button className="rounded-lg bg-yellow-100 p-2 hover:bg-yellow-200">
                    <Pencil size={18} />
                  </button>

                  <button className="rounded-lg bg-red-100 p-2 hover:bg-red-200">
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
