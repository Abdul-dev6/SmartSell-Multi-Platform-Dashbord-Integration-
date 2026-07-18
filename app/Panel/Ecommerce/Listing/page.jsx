import ListingHeader from "@/PanelComponents/LIstingData/ListingHeader";
import ListingStats from "@/PanelComponents/LIstingData/ListingStats";
import ListingFilters from "@/PanelComponents/LIstingData/ListingFilter";
import ListingTable from "@/PanelComponents/LIstingData/ListingTable";

export default function ListingPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <ListingHeader />

      <ListingStats />

      <ListingFilters />

      <ListingTable />
    </div>
  );
}
