"use client";

import { motion } from "framer-motion";
import { ExternalLink, Pencil, PackagePlus } from "lucide-react";
import ProductThumb from "@/components/dashboard/shared/ProductThumb";
import RowActionsMenu from "@/components/dashboard/shared/RowActionsMenu";
import { shopifyAdminUrl } from "@/components/dashboard/products/deleteProduct";

export default function InventoryRow({ product }) {
 
 
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
      case "Shopify":
        return "bg-green-100 text-green-700";

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
          <ProductThumb src={product.image} alt={product.name} size={70} className="rounded-xl" />

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

        {/* Quantities are read-only in SmartSell; stock is changed in Shopify. */}
        <RowActionsMenu
          label={`Actions for ${product.name}`}
          items={[
            product.local_id && {
              label: "Edit product",
              icon: Pencil,
              href: `/Panel/Ecommerce/Product/${product.local_id}/edit`,
            },
            shopifyAdminUrl.variant(product.shop, product.product_id, product.variant_id) && {
              label: "Adjust stock in Shopify",
              icon: PackagePlus,
              href: shopifyAdminUrl.variant(product.shop, product.product_id, product.variant_id),
              external: true,
            },
            shopifyAdminUrl.product(product.shop, product.product_id) && {
              label: "View in Shopify",
              icon: ExternalLink,
              href: shopifyAdminUrl.product(product.shop, product.product_id),
              external: true,
            },
          ]}
        />
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
