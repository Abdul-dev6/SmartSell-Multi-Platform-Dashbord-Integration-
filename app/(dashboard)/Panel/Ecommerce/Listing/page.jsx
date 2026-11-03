"use client";

import { useMemo } from "react";

import ListingHeader from "@/components/dashboard/listings/ListingHeader";
import ListingCards from "@/components/dashboard/listings/ListingCards";
import ListingFilters from "@/components/dashboard/listings/ListingFilters";
import ListingTable from "@/components/dashboard/listings/ListingTable";
import SyncStatus from "@/components/dashboard/shared/SyncStatus";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import useCatalogFilters from "@/components/dashboard/shared/useCatalogFilters";
import { CSV_COLUMNS, downloadCsv, exportFilename, toCsv } from "@/components/dashboard/shared/catalogFilters";

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

      <ListingTable ListingData={filtered} onChanged={reload} />
      {ListingData.length > 0 && filtered.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No listings match your filters.</p>
      )}
    </div>
  );
}
