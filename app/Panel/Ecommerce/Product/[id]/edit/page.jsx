"use client";

import { useParams } from "next/navigation";
import CreateListingHeader from "@/PanelComponents/LIstingData/Listingformdata/CreateListingHeader";
import CreateListingForm from "@/PanelComponents/LIstingData/Listingformdata/CreateListingForm";
import LoadState from "@/PanelComponents/LoadState";
import useApiData from "@/PanelComponents/useApiData";

export default function EditProductPage() {
  const { id } = useParams();
  const { body, error, loading, reload } = useApiData(`/api/products/${encodeURIComponent(id)}`);
  const product = body?.product;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <CreateListingHeader
        title={product ? `Edit “${product.title}”` : "Edit product"}
        subtitle="Changes are saved to your Shopify store."
        backHref="/Panel/Ecommerce/Product"
        backLabel="Back to Products"
      />

      <LoadState loading={loading && !product} error={error} onRetry={reload} />

      {product?.archivedAt && (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          This product was {product.archiveReason === "deleted_in_smartsell" ? "deleted from SmartSell" : "deleted in Shopify"} and can no longer be edited.
        </p>
      )}

      {product && !product.archivedAt && product.shopifyProductId && (
        // Remount when the product changes so the form starts from fresh values.
        <CreateListingForm key={product.id} product={product} />
      )}

      {product && !product.archivedAt && !product.shopifyProductId && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This product has not been created in Shopify yet ({product.lastSyncError || "pending"}). Retry it from the product list.
        </p>
      )}
    </div>
  );
}
