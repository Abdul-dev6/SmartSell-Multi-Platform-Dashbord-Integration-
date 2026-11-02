"use client";

import InventoryRow from "./InventoryRow";

export default function InventoryList({ inventorydata = [] }) {
  const rows = inventorydata.map((item) => ({
    ...item,
    id: item.product_id || item.inventory_item_id,
    name: item.title || "Untitled product",
    marketplace: item.platform || "Shopify",
    warehouse: item.location_id || "Shopify location",
    reserved: item.reserved ?? 0,
    reorder: item.reorder ?? 0,
    available: item.available ?? null,
    updated: item.updated_at || "Not available",
    image: item.image || "/user.avif",
    sku: item.sku || "Not available",
    Location: item.location_id || "Not available",
  }));

  return (
    <div className="mt-8 space-y-6">
      {rows.map((product) => (
        <InventoryRow key={product.row_id ?? product.id} product={product} />
      ))}
    </div>
  );
}
