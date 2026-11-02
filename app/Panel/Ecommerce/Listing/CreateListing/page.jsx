import CreateListingHeader from "@/PanelComponents/LIstingData/Listingformdata/CreateListingHeader";
import CreateListingForm from "@/PanelComponents/LIstingData/Listingformdata/CreateListingForm";

export default function CreateListingPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <CreateListingHeader />

      <CreateListingForm />
    </div>
  );
}
