"use client";

import ProductTable from "@/components/dashboard/products/ProductTable";

// Listings use the same table as the Products page.
export default function ListingTable({ ListingData = [], onChanged }) {
  return <ProductTable ProductData={ListingData} onChanged={onChanged} />;
}
