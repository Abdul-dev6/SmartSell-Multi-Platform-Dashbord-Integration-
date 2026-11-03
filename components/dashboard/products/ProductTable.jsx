"use client";

import Link from "next/link";
import ProductThumb from "@/components/dashboard/shared/ProductThumb";
import { formatMoney } from "@/components/dashboard/shared/format";
import { deleteProductWithConfirm, shopifyAdminUrl } from "@/components/dashboard/products/deleteProduct";
import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";

export default function ProductTable({ ProductData = [], onChanged }) {
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  // Shopify product statuses.
  const badgeColor = (status) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";

      case "draft":
        return "bg-yellow-100 text-yellow-700";

      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const handleDelete = async (item) => {
    setDeletingId(item.local_id);
    setError(null);
    const result = await deleteProductWithConfirm({ id: item.local_id, title: item.title });
    setDeletingId(null);
    if (result.error) setError(`${item.title}: ${result.error}`);
    if (result.deleted) await onChanged?.();
  };

  function StockavailabilityStatus(available) {
    // null means Shopify does not track quantity for this item.
    if (available === null || available === undefined) {
      return "Not tracked";
    }
    if (available <= 0) {
      return "Out of Stock";
    } else if (available > 0 && available <= 10) {
      return "Low Stock";
    } else {
      return "In Stock";
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-8 overflow-x-auto rounded-2xl bg-white shadow-lg border border-slate-200"
    >
      {error && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
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
          {ProductData.map((item) => (
            <motion.tr
              key={item.row_id ?? item.id}
              whileHover={{
                backgroundColor: "#F8FAFC",
              }}
              className="border-b"
            >
              <td className="px-6 py-5">
                <div className="flex items-center gap-4">
                  <ProductThumb src={item.image} alt={item.title} />

                  <div>
                    <h2 className="font-semibold">{item.title}</h2>
                    {item.variant_count > 1 && (
                      <p className="text-xs text-slate-500">{item.variant_title}</p>
                    )}
                  </div>
                </div>
              </td>

              <td>{item.sku}</td>

              <td>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-600">
                  {item.platform}
                </span>
              </td>

              <td>{formatMoney(item.price, item.currency)}</td>

              <td>{StockavailabilityStatus(item.available)}</td>

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
                  {item.shop && item.product_id && (
                    <a
                      href={shopifyAdminUrl.product(item.shop, item.product_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-blue-100 p-2 hover:bg-blue-200"
                      aria-label={`View ${item.title} in Shopify admin`}
                      title="View in Shopify admin"
                    >
                      <ExternalLink size={18} aria-hidden="true" />
                    </a>
                  )}

                  {item.local_id && (
                    <Link
                      href={`/Panel/Ecommerce/Product/${item.local_id}/edit`}
                      className="rounded-lg bg-yellow-100 p-2 hover:bg-yellow-200"
                      aria-label={`Edit ${item.title}`}
                      title="Edit"
                    >
                      <Pencil size={18} aria-hidden="true" />
                    </Link>
                  )}

                  {item.local_id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.local_id}
                      className="rounded-lg bg-red-100 p-2 hover:bg-red-200 disabled:opacity-50"
                      aria-label={`Delete ${item.title} from Shopify`}
                      title="Delete from Shopify"
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
