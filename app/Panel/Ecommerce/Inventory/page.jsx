"use client";

import InventoryHeader from "@/PanelComponents/Inventorycomponets/InventoryHeader";
import InventoryCards from "@/PanelComponents/Inventorycomponets/InventoryCards";
import InventoryHealth from "@/PanelComponents/Inventorycomponets/InventoryHealth";
import InventorySearch from "@/PanelComponents/Inventorycomponets/InventorySeacrh";
import InventoryList from "@/PanelComponents/Inventorycomponets/InventoryList";
export default function InventoryPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <InventoryHeader />

      <InventoryCards />

      <InventoryHealth />

      <InventorySearch />

      {/* Inventory Table (Next Step) */}

      <InventoryList />
    </div>
  );
}
