"use client";

import InventoryRow from "./InventoryRow";
import { inventoryProducts } from "./Productdata";

export default function InventoryList() {
  return (
    <div className="mt-8 space-y-6">
      {inventoryProducts.map((product) => (
        <InventoryRow key={product.id} product={product} />
      ))}
    </div>
  );
}
