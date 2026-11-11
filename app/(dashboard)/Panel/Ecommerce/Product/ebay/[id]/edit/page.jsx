"use client";

import { useParams } from "next/navigation";
import CreateListingHeader from "@/components/dashboard/listing-form/CreateListingHeader";
import EbayListingForm from "@/components/dashboard/ebay/EbayListingForm";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";

export default function EditEbayProductPage() {
  const { id } = useParams();
  const { body, error, loading, reload } = useApiData(`/api/ebay/products/${encodeURIComponent(id)}`);
  const product = body?.product;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <CreateListingHeader
        title={product ? `Edit “${product.title}”` : "Edit eBay product"}
        subtitle="Changes are sent to your eBay account and update the live listing."
        backHref="/Panel/Ecommerce/Product"
        backLabel="Back to Products"
      />

      <LoadState loading={loading && !product} error={error} onRetry={reload} />

      {product && (
        <>
          {product.listingUrl && (
            <p className="mb-4 text-sm">
              <a href={product.listingUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:text-indigo-800">
                View listing on eBay ↗
              </a>
            </p>
          )}
          {product.syncStatus !== "synced" && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The last change was not confirmed by eBay{product.lastSyncError ? `: ${product.lastSyncError}` : "."} Saving again sends it once more.
            </p>
          )}
          {/* Remount when the product changes so the form starts from fresh values. */}
          <EbayListingForm key={product.id} product={product} />
        </>
      )}
    </div>
  );
}
