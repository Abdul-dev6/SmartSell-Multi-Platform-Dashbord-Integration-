"use client";

import ProductTable from "@/components/dashboard/products/ProductTable";

// Inventory uses the Products table, with location, exact stock and the
// last update shown (one row per variant per location).
export default function InventoryList({ inventorydata = [], onChanged }) {
  return <ProductTable ProductData={inventorydata} onChanged={onChanged} showLocation />;
}
