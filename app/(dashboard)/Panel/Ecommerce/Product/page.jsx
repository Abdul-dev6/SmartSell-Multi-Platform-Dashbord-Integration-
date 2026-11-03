"use client";

import { motion } from "framer-motion";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import ProductHeader from "@/components/dashboard/products/ProductHeader";
import ProductCards from "@/components/dashboard/products/ProductCards";
import ProductFilters from "@/components/dashboard/products/ProductFilters";
import ProductTable from "@/components/dashboard/products/ProductTable";
import SyncStatus from "@/components/dashboard/shared/SyncStatus";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import NeedsAttention from "@/components/dashboard/products/NeedsAttention";
import useCatalogFilters from "@/components/dashboard/shared/useCatalogFilters";

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <ProductsWithQuery />
    </Suspense>
  );
}

// Remounts when the navbar search changes, so the new query applies.
function ProductsWithQuery() {
  const q = useSearchParams().get("q") || "";
  return <ProductsContent key={q} initialQuery={q} />;
}

function ProductsContent({ initialQuery }) {
  const { body, error, loading, reload } = useApiData("/api/inventory");
  const ProductData = useMemo(() => body?.data || [], [body]);
  const { filters, setFilters, filtered, options } = useCatalogFilters(ProductData, initialQuery);

  return (
    <motion.div
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      transition={{
        duration: 0.4,
      }}
      className="p-4 sm:p-6 lg:p-8 bg-slate-50 min-h-screen"
    >
      <ProductHeader ProductData={ProductData} />

      {body && (
        <div className="mt-6">
          <SyncStatus hasStore={body.hasStore} sync={body.sync} onSynced={reload} autoSyncIfNever />
        </div>
      )}

      <NeedsAttention items={body?.needsAttention} onChanged={reload} />

      <LoadState
        loading={loading && !body}
        error={error}
        empty={body?.hasStore && !ProductData.length}
        emptyText="No products synced yet. Use “Sync now” to import them from Shopify."
        onRetry={reload}
      />

      <ProductCards ProductData={ProductData} />

      <ProductFilters
        filters={filters}
        setFilters={setFilters}
        productTypes={options.productTypes}
        shown={filtered.length}
        total={ProductData.length}
      />

      <ProductTable ProductData={filtered} onChanged={reload} />
      {ProductData.length > 0 && filtered.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No products match your filters.</p>
      )}
    </motion.div>
  );
}
