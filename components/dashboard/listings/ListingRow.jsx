"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import ProductThumb from "@/components/dashboard/shared/ProductThumb";
import RowActionsMenu from "@/components/dashboard/shared/RowActionsMenu";
import { deleteProductWithConfirm, shopifyAdminUrl } from "@/components/dashboard/products/deleteProduct";

export default function ListingRow({ ListingData = {}, onChanged }) {
  const [deleteError, setDeleteError] = useState(null);

  const handleDelete = async () => {
    setDeleteError(null);
    const result = await deleteProductWithConfirm({ id: ListingData.local_id, title: ListingData.title });
    if (result.error) setDeleteError(result.error);
    if (result.deleted) await onChanged?.();
  };


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
          <ProductThumb src={ListingData.image} alt={ListingData.title} size={80} className="rounded-xl" />

          <div>
            <h2 className="text-xl font-semibold text-slate-800">
              {ListingData.title}
            </h2>

            <p className="text-sm text-slate-500 mt-2">SKU : {ListingData.sku}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium">
                {ListingData.vendor}
              </span>

              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">
                {ListingData.collection}
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
              {ListingData.price}
            </h3>
          </div>

          {/* Inventory */}

          <div>
            <p className="text-sm text-slate-500">Inventory</p>
            <h3 className="text-xl font-bold text-indigo-600">
              {ListingData.inventory}
            </h3>
          </div>

          {/* Status */}

          <div>
            <p className="text-sm text-slate-500">Status</p>

            <span
              className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(
                ListingData.status,
              )}`}
            >
              {ListingData.status}
            </span>
          </div>

          {/* Updated */}

          <div>
            <p className="text-sm text-slate-500">Updated</p>

            <h3 className="text-sm font-semibold text-slate-700 mt-2">
              {formatUpdatedAt(ListingData.updated)}
            </h3>
          </div>

          {/* Action Menu */}

          <RowActionsMenu
            label={`Actions for ${ListingData.title}`}
            items={[
              ListingData.local_id && {
                label: "Edit listing",
                icon: Pencil,
                href: `/Panel/Ecommerce/Product/${ListingData.local_id}/edit`,
              },
              shopifyAdminUrl.product(ListingData.shop, ListingData.product_id) && {
                label: "View in Shopify",
                icon: ExternalLink,
                href: shopifyAdminUrl.product(ListingData.shop, ListingData.product_id),
                external: true,
              },
              ListingData.local_id && {
                label: "Delete from Shopify",
                icon: Trash2,
                onClick: handleDelete,
                danger: true,
              },
            ]}
          />
        </div>
      </div>
      {deleteError && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {deleteError}
        </p>
      )}
    </motion.div>
  );
}
