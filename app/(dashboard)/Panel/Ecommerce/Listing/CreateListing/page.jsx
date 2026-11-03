import CreateListingHeader from "@/components/dashboard/listing-form/CreateListingHeader";
import CreateListingForm from "@/components/dashboard/listing-form/CreateListingForm";

export default function CreateListingPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <CreateListingHeader />

      <CreateListingForm />
    </div>
  );
}
