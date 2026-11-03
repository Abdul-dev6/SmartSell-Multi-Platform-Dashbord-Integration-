"use client";

import { useMemo } from "react";

import InventoryHeader from "@/components/dashboard/inventory/InventoryHeader";
import InventoryCards from "@/components/dashboard/inventory/InventoryCards";
import InventoryHealth from "@/components/dashboard/inventory/InventoryHealth";
import InventoryFilters from "@/components/dashboard/inventory/InventoryFilters";
import InventoryList from "@/components/dashboard/inventory/InventoryList";
import SyncStatus from "@/components/dashboard/shared/SyncStatus";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";
import useCatalogFilters from "@/components/dashboard/shared/useCatalogFilters";
import { CSV_COLUMNS, downloadCsv, exportFilename, toCsv } from "@/components/dashboard/shared/catalogFilters";

export default function InventoryPage() {
  const { body, error, loading, reload } = useApiData("/api/inventory");
  const inventorydata = useMemo(() => body?.data || [], [body]);
  const { filters, setFilters, filtered, options } = useCatalogFilters(inventorydata);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <InventoryHeader shop={inventorydata.find((row) => row.shop)?.shop} />

      {body && (
        <div className="mt-6">
          <SyncStatus hasStore={body.hasStore} sync={body.sync} onSynced={reload} autoSyncIfNever />
        </div>
      )}

      <LoadState
        loading={loading && !body}
        error={error}
        empty={body?.hasStore && !inventorydata.length}
        emptyText="No inventory synced yet. Use “Sync now” to import it from Shopify."
        onRetry={reload}
      />

      <InventoryCards inventorydata={inventorydata} />

      <InventoryHealth inventorydata={inventorydata} />

      <InventoryFilters
        filters={filters}
        setFilters={setFilters}
        locations={options.locations}
        shown={filtered.length}
        total={inventorydata.length}
        onExport={() => downloadCsv(exportFilename("smartsell-inventory"), toCsv(filtered, CSV_COLUMNS))}
      />

      <InventoryList inventorydata={filtered} />
      {inventorydata.length > 0 && filtered.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No inventory matches your filters.</p>
      )}
    </div>
  );
}
