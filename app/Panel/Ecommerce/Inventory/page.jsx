"use client";

import { useMemo } from "react";

import InventoryHeader from "@/PanelComponents/Inventorycomponets/InventoryHeader";
import InventoryCards from "@/PanelComponents/Inventorycomponets/InventoryCards";
import InventoryHealth from "@/PanelComponents/Inventorycomponets/InventoryHealth";
import InventorySearch from "@/PanelComponents/Inventorycomponets/InventorySeacrh";
import InventoryList from "@/PanelComponents/Inventorycomponets/InventoryList";
import SyncStatus from "@/PanelComponents/SyncStatus";
import LoadState from "@/PanelComponents/LoadState";
import useApiData from "@/PanelComponents/useApiData";
import useCatalogFilters from "@/PanelComponents/useCatalogFilters";
import { CSV_COLUMNS, downloadCsv, exportFilename, toCsv } from "@/PanelComponents/catalogFilters";

export default function InventoryPage() {
  const { body, error, loading, reload } = useApiData("/api/inventory");
  const inventorydata = useMemo(() => body?.data || [], [body]);
  const { filters, setFilters, filtered, options } = useCatalogFilters(inventorydata);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <InventoryHeader inventorydata={inventorydata} />

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

      <InventorySearch
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
