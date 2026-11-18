"use client";

import { motion } from "framer-motion";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import ProductHeader from "@/components/dashboard/products/ProductHeader";
import ProductCards from "@/components/dashboard/products/ProductCards";
import ProductFilters from "@/components/dashboard/products/ProductFilters";
import ProductTable from "@/components/dashboard/products/ProductTable";
import MarketplaceSync from "@/components/dashboard/shared/MarketplaceSync";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import NeedsAttention from "@/components/dashboard/products/NeedsAttention";
import AmazonSandboxProducts from "@/components/dashboard/products/AmazonSandboxProducts";
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
  // Also asks for Amazon Sandbox sample rows; the server adds them only where
  // the Sandbox viewer is enabled (never in a production build).
  const { body, error, loading, reload } = useApiData("/api/inventory?include=amazonSandbox");
  const ProductData = useMemo(() => body?.data || [], [body]);
  // Sandbox sample rows are listed, but not counted as real products.
  const realProducts = useMemo(() => ProductData.filter((row) => !row.sample), [ProductData]);
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
      <ProductHeader ProductData={realProducts} />

      <MarketplaceSync body={body} onSynced={reload} autoSyncIfNever />

      <NeedsAttention items={body?.needsAttention} onChanged={reload} />

      <AmazonSandboxProducts sandbox={body?.amazonSandbox} onImported={reload} />

      <LoadState
        loading={loading && !body}
        error={error}
        empty={body?.hasMarketplace && !ProductData.length}
        emptyText="No products synced yet. Use “Sync now” or “Import from eBay” to bring them in."
        onRetry={reload}
      />

      <ProductCards ProductData={realProducts} />

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
