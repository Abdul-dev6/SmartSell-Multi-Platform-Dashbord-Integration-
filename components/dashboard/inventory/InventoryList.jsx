"use client";

import InventoryRow from "@/components/dashboard/inventory/InventoryRow";
import { ListProgress, useIncrementalList } from "@/components/dashboard/shared/useIncrementalList";

export default function InventoryList({ inventorydata = [] }) {
  const rows = inventorydata.map((item) => ({
    ...item,
    id: item.product_id || item.inventory_item_id,
    name: item.title || "Untitled product",
    marketplace: item.platform || "Shopify",
    warehouse: item.location_name || item.location_id || "Shopify location",
    reserved: item.reserved ?? 0,
    reorder: item.reorder ?? 0,
    available: item.available ?? null,
    updated: item.updated_at || "Not available",
    image: item.image || null,
    sku: item.sku || "Not available",
    Location: item.location_name || item.location_id || "Not available",
  }));

  const { visible, setRoot, setSentinel, shown, total, hasMore } = useIncrementalList(rows);

  return (
    <div className="mt-8">
      <div ref={setRoot} className="max-h-[75vh] overflow-y-auto space-y-6 pr-1">
        {visible.map((product) => (
          <InventoryRow key={product.row_id ?? product.id} product={product} />
        ))}
        <div ref={setSentinel} aria-hidden="true" className="h-px" />
      </div>
      <ListProgress shown={shown} total={total} hasMore={hasMore} />
    </div>
  );
}
