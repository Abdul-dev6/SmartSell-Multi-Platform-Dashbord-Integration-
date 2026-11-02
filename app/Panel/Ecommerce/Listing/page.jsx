"use client";

import { useMemo } from "react";

import ListingHeader from "@/PanelComponents/LIstingData/ListingHeader";
import ListingCards from "@/PanelComponents/LIstingData/ListingCards";
import ListingFilters from "@/PanelComponents/LIstingData/ListingFilter";
import ListingTable from "@/PanelComponents/LIstingData/ListingTable";
import SyncStatus from "@/PanelComponents/SyncStatus";
import LoadState from "@/PanelComponents/LoadState";
import useApiData from "@/PanelComponents/useApiData";
import useCatalogFilters from "@/PanelComponents/useCatalogFilters";
import { CSV_COLUMNS, downloadCsv, exportFilename, toCsv } from "@/PanelComponents/catalogFilters";

export default function ListingPage() {
  const { body, error, loading, reload } = useApiData("/api/inventory");
  const ListingData = useMemo(() => body?.data || [], [body]);
  const { filters, setFilters, filtered, options } = useCatalogFilters(ListingData);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <ListingHeader ListingData={ListingData} />

      {body && (
        <div className="mt-6">
          <SyncStatus hasStore={body.hasStore} sync={body.sync} onSynced={reload} autoSyncIfNever />
        </div>
      )}

      <LoadState
        loading={loading && !body}
        error={error}
        empty={body?.hasStore && !ListingData.length}
        emptyText="No listings synced yet. Use “Sync now” to import them from Shopify."
        onRetry={reload}
      />

      <ListingCards ListingData={ListingData} />
      <ListingFilters
        filters={filters}
        setFilters={setFilters}
        vendors={options.vendors}
        productTypes={options.productTypes}
        shown={filtered.length}
        total={ListingData.length}
        onExport={() => downloadCsv(exportFilename("smartsell-listings"), toCsv(filtered, CSV_COLUMNS))}
      />

      <ListingTable ListingData={filtered} />
      {ListingData.length > 0 && filtered.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No listings match your filters.</p>
      )}
    </div>
  );
}
