"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

import ProductHeader from "@/PanelComponents/productcomponent/productHeader";
import ProductCards from "@/PanelComponents/productcomponent/ProductCards";
import SearchFilter from "@/PanelComponents/productcomponent/SeachFilter";
import ProductTable from "@/PanelComponents/productcomponent/ProductTable";
import SyncStatus from "@/PanelComponents/SyncStatus";
import LoadState from "@/PanelComponents/LoadState";
import useApiData from "@/PanelComponents/useApiData";
import NeedsAttention from "@/PanelComponents/productcomponent/NeedsAttention";
import useCatalogFilters from "@/PanelComponents/useCatalogFilters";

export default function ProductsPage() {
  const { body, error, loading, reload } = useApiData("/api/inventory");
  const ProductData = useMemo(() => body?.data || [], [body]);
  const { filters, setFilters, filtered, options } = useCatalogFilters(ProductData);

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

      <SearchFilter
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
