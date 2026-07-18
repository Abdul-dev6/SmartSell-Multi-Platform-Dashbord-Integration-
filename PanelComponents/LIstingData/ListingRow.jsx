"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

import {
  MoreVertical,
  Eye,
  Pencil,
  Copy,
  RefreshCcw,
  Trash2,
} from "lucide-react";

export default function ListingRow({ product }) {
  const [openMenu, setOpenMenu] = useState(false);

  const getStatusColor = (status) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700";

      case "Draft":
        return "bg-yellow-100 text-yellow-700";

      case "Archived":
        return "bg-gray-100 text-gray-700";

      case "Out of Stock":
        return "bg-red-100 text-red-700";

      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        y: -4,
        scale: 1.01,
      }}
      transition={{ duration: 0.25 }}
      className="
        relative
        bg-white
        rounded-2xl
        border
        border-slate-200
        shadow-md
        hover:shadow-xl
        transition-all
        p-4 sm:p-6
      "
    >
      {/* Top */}

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
        {/* Product */}

        <div className="flex items-center gap-4 sm:gap-5">
          <Image
            src={product.image}
            alt={product.title}
            width={80}
            height={80}
            className="rounded-xl border object-cover"
          />

          <div>
            <h2 className="text-xl font-semibold text-slate-800">
              {product.title}
            </h2>

            <p className="text-sm text-slate-500 mt-2">SKU : {product.sku}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium">
                {product.vendor}
              </span>

              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">
                {product.collection}
              </span>
            </div>
          </div>
        </div>
        {/* Right Side */}

        <div className="flex flex-wrap items-center gap-5 sm:gap-8">
          {/* Price */}

          <div>
            <p className="text-sm text-slate-500">Price</p>
            <h3 className="text-xl font-bold text-slate-800">
              {product.price}
            </h3>
          </div>

          {/* Inventory */}

          <div>
            <p className="text-sm text-slate-500">Inventory</p>
            <h3 className="text-xl font-bold text-indigo-600">
              {product.inventory}
            </h3>
          </div>

          {/* Status */}

          <div>
            <p className="text-sm text-slate-500">Status</p>

            <span
              className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(
                product.status,
              )}`}
            >
              {product.status}
            </span>
          </div>

          {/* Updated */}

          <div>
            <p className="text-sm text-slate-500">Updated</p>

            <h3 className="text-sm font-semibold text-slate-700 mt-2">
              {product.updated}
            </h3>
          </div>

          {/* Action Menu */}

          <div className="relative">
            <button
              onClick={() => setOpenMenu(!openMenu)}
              className="
                p-2
                rounded-lg
                hover:bg-slate-100
                transition
              "
            >
              <MoreVertical size={22} />
            </button>

            {openMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="
                  absolute
                  right-0
                  top-12
                  w-64 sm:w-56
                  bg-white
                  rounded-xl
                  shadow-xl
                  border
                  border-slate-200
                  overflow-hidden
                  z-50
                "
              >
                <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                  <Eye size={18} />
                  View Product
                </button>

                <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                  <Pencil size={18} />
                  Edit Listing
                </button>

                <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                  <Copy size={18} />
                  Duplicate
                </button>

                <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                  <RefreshCcw size={18} />
                  Sync Shopify
                </button>

                <button className="flex items-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50">
                  <Trash2 size={18} />
                  Delete
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
