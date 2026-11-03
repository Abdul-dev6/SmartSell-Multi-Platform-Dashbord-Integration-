"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

import {
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  ArrowRightLeft,
  PackagePlus,
} from "lucide-react";

export default function InventoryRow({ product }) {
  const [openMenu, setOpenMenu] = useState(false);
 
 
  function StockavailabilityStatus(available) {
    // null means Shopify does not track quantity for this item.
    if (available === null || available === undefined) {
      return "Not tracked";
    }
    if (available <= 0) {
      return "Out of Stock";
    }
    else if (available > 0 && available <= 10) {
      return "Low Stock";
      
    }
    else {
      return "In Stock";
    }
  }

  function formatUpdatedAt(timestamp) {
    if (!timestamp || timestamp === "Not available") {
      return "Not available";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "Not available";
    }

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  

  const getStatusColor = (status) => {
    switch (status) {
      case "In Stock":
        return "bg-green-100 text-green-700";

      case "Low Stock":
        return "bg-yellow-100 text-yellow-700";

      case "Out of Stock":
        return "bg-red-100 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getMarketplaceColor = (marketplace) => {
    switch (marketplace) {
      case "Amazon":
        return "bg-orange-100 text-orange-700";

      case "Shopify":
        return "bg-green-100 text-green-700";

      case "eBay":
        return "bg-blue-100 text-blue-700";

      case "Walmart":
        return "bg-indigo-100 text-indigo-700";

      default:
        return "bg-gray-100 text-gray-700";
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
        shadow-md
        hover:shadow-xl
        border
        border-slate-200
        p-4 sm:p-6
        transition-all
      "
    >
      {/* Top Section */}

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
        {/* Left */}

        <div className="flex items-center gap-4 sm:gap-5">
          <Image
            src={product.image}
            alt={product.name}
            width={70}
            height={70}
            className="rounded-xl border object-cover"
          />

          <div>
            <h2 className="text-xl font-semibold text-slate-800">
              {product.name}
            </h2>

            <p className="text-sm text-slate-500 mt-1">SKU : {product.sku}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getMarketplaceColor(
                  product.marketplace,
                )}`}
              >
                {product.marketplace}
              </span>

              <span
                className="
                  bg-slate-100
                  text-slate-700
                  px-3
                  py-1
                  rounded-full
                  text-sm
                  font-medium
                "
              >
                {product.warehouse}
              </span>
            </div>
          </div>
        </div>

        {/* Right */}

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
            <div
              className="
                absolute
                right-0
                mt-2
                w-56
                rounded-xl
                bg-white
                shadow-xl
                border
                border-slate-200
                z-50
                overflow-hidden
              "
            >
              <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                <Eye size={18} />
                View Details
              </button>

              <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                <Pencil size={18} />
                Edit Product
              </button>

              <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                <PackagePlus size={18} />
                Update Stock
              </button>

              <button className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50">
                <ArrowRightLeft size={18} />
                Transfer Stock
              </button>

              <button className="flex items-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50">
                <Trash2 size={18} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Bottom Section */}

      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5 border-t pt-6">
        <div>
          <p className="text-sm text-slate-500">Available</p>

          <h3 className="text-xl font-bold text-green-600">
            {product.available ?? "Not tracked"}
          </h3>
        </div>

        <div>
          <p className="text-sm text-slate-500">In Stock</p>

          <h3 className="text-xl font-bold text-yellow-500">
            {StockavailabilityStatus(product.available)=== "In Stock" ? product.available : 0}
          </h3>
        </div>

        <div>
          <p className="text-sm text-slate-500">Out of Stock</p>

          <h3 className="text-xl font-bold text-red-500">
            {StockavailabilityStatus(product.available)=== "Out of Stock" ? "yes" : "no"}
          </h3>
        </div>

        <div>
          <p className="text-sm text-slate-500">Price</p>

          <h3 className="text-xl font-bold text-slate-700">${product.price}</h3>
        </div>

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

        <div>
          <p className="text-sm text-slate-500">Last Updated</p>

          <h3 className="text-sm font-semibold text-slate-700 mt-2">
            {formatUpdatedAt(product.updated)}
          </h3>
        </div>
      </div>
    </motion.div>
  );
}
