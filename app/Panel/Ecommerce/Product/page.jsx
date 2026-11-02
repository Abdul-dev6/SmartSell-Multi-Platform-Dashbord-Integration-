"use client";

import { motion } from "framer-motion";

import ProductHeader from "@/PanelComponents/productcomponent/productHeader";
import ProductCards from "@/PanelComponents/productcomponent/ProductCards";
import SearchFilter from "@/PanelComponents/productcomponent/SeachFilter";
import ProductTable from "@/PanelComponents/productcomponent/ProductTable";
import SyncStatus from "@/PanelComponents/SyncStatus";
import LoadState from "@/PanelComponents/LoadState";
import useApiData from "@/PanelComponents/useApiData";
import NeedsAttention from "@/PanelComponents/productcomponent/NeedsAttention";

export default function ProductsPage() {
  const { body, error, loading, reload } = useApiData("/api/inventory");
  const ProductData = body?.data || [];

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

      <SearchFilter ProductData={ProductData} />

      <ProductTable ProductData={ProductData} onChanged={reload} />
    </motion.div>
  );
}
