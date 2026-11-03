"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import GeneralInformation from "@/components/dashboard/listing-form/GeneralInformation";
import Organization from "@/components/dashboard/listing-form/Organization";
import MediaUploader from "@/components/dashboard/listing-form/MediaUploader";
import Pricing from "@/components/dashboard/listing-form/Pricing";
import InventoryFields from "@/components/dashboard/listing-form/InventoryFields";
import Shipping from "@/components/dashboard/listing-form/Shipping";
import Seo from "@/components/dashboard/listing-form/Seo";
import ActionButtons from "@/components/dashboard/listing-form/ActionButtons";
import { apiErrorText } from "@/components/dashboard/shared/apiError";
import { EMPTY_FORM, buildProductPayload, formFromProduct } from "@/components/dashboard/listing-form/payload";

const FIELD_LABELS = {
  title: "Product title",
  description: "Description",
  vendor: "Vendor",
  productType: "Product type",
  tags: "Tags",
  status: "Status",
  price: "Price",
  comparePrice: "Compare-at price",
  sku: "SKU",
  barcode: "Barcode",
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  handle: "URL handle",
  category: "Category",
  collections: "Collections",
  publications: "Sales channels",
  inventory: "Available quantity",
  trackInventory: "Track quantity",
  requiresShipping: "Physical product",
  weight: "Weight",
  weightUnit: "Weight unit",
  countryOfOrigin: "Country of origin",
  hsCode: "HS code",
  idempotencyKey: "Request",
  _form: "Form",
};

function newRequestKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k${Date.now()}${Math.random().toString(36).slice(2)}`;
}

function ImageResults({ results }) {
  if (!results) return null;
  return (
    <div className="mt-2 text-sm" aria-live="polite">
      {results.uploaded > 0 && (
        <p className="text-emerald-800">
          {results.uploaded} image{results.uploaded === 1 ? "" : "s"} uploaded. Shopify may take a moment to process them.
        </p>
      )}
      {results.failed.length > 0 && (
        <div role="alert" className="text-red-700">
          <p>Some images could not be uploaded (you can add them from the Edit page):</p>
          <ul className="list-disc pl-5">
            {results.failed.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Create mode posts a new product; edit mode (with `product`) sends only the
// fields that changed, so untouched Shopify values are never overwritten.
export default function CreateListingForm({ product = null }) {
  const router = useRouter();
  const isEdit = Boolean(product);
  // Values last saved in Shopify; edit mode sends only fields that differ.
  const [baseline, setBaseline] = useState(() =>
    isEdit ? formFromProduct(product) : EMPTY_FORM,
  );
  // One key per form: a retried or double-clicked submit reuses it, so the
  // server never creates a second Shopify product.
  const [requestKey] = useState(newRequestKey);

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(baseline);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saved, setSaved] = useState(null);
  // null while loading; true when sales channels can be read and changed.
  const [channelsAvailable, setChannelsAvailable] = useState(null);
  // null while loading; true when stock can be managed (write_inventory).
  const [inventoryEditable, setInventoryEditable] = useState(null);
  const multiVariant = isEdit && product.variantCount > 1;

  const buildPayload = (statusOverride) =>
    buildProductPayload(formData, baseline, {
      isEdit,
      channelsAvailable: channelsAvailable === true,
      shippingEditable: !multiVariant,
      inventoryEditable: inventoryEditable === true && !multiVariant,
      statusOverride,
      idempotencyKey: requestKey,
    });

  // Uploads the queued images one at a time; a failed image does not stop
  // the others. Returns { uploaded, failed: [message] }.
  const uploadImages = async (productId) => {
    const queued = formData.images || [];
    const results = { uploaded: 0, failed: [] };
    for (const image of queued) {
      try {
        const body = new FormData();
        body.append("image", image.file, image.file.name);
        body.append("alt", formData.title || "");
        const response = await fetch(`/api/products/${productId}/images`, { method: "POST", body });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Upload failed.");
        results.uploaded += 1;
      } catch (error) {
        results.failed.push(`${image.file.name}: ${error.message}`);
      }
    }
    queued.forEach((image) => URL.revokeObjectURL(image.preview));
    setFormData((prev) => ({ ...prev, images: [] }));
    return results;
  };

  const submit = async (statusOverride) => {
    if (loading) return;
    const payload = buildPayload(statusOverride);
    const hasImages = (formData.images || []).length > 0;
    if (isEdit && !Object.keys(payload).length && !hasImages) {
      setMessage({ type: "info", text: "No changes to save." });
      return;
    }

    setLoading(true);
    setErrors({});
    setMessage(null);
    try {
      // Edit with only new images: nothing to PATCH, just upload them.
      if (isEdit && !Object.keys(payload).length) {
        const imageResults = await uploadImages(product.id);
        setSaved({ product, notSent: [], imageResults });
        return;
      }

      const response = await fetch(isEdit ? `/api/products/${product.id}` : "/api/products", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const imageResults = hasImages ? await uploadImages(data.product.id) : null;
        setSaved({ product: data.product, notSent: data.notSent || [], imageResults, partial: data.partial || null });
        if (isEdit) {
          const fresh = formFromProduct(data.product);
          setBaseline(fresh);
          setFormData(fresh);
        }
        return;
      }

      if (data.errors) setErrors(data.errors);
      const shopifyErrors = (data.userErrors || []).map((e) => e.message);
      if (data.code === "stock_changed" && data.stockChanges?.length) {
        shopifyErrors.push(
          `Now in Shopify: ${data.stockChanges.map((c) => `${c.current} (you saw ${c.expected})`).join(", ")}.`,
        );
      }
      setMessage({
        type: "error",
        text: [apiErrorText(response, data, "Save failed."), ...shopifyErrors].join(" "),
      });
    } catch {
      setMessage({
        type: "error",
        text: "Could not reach the server. Your request was not confirmed; submitting again is safe.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete "${product.title}" from Shopify?\n\nThis permanently deletes the product in your Shopify store. SmartSell keeps an archived record so order history stays intact.`,
    );
    if (!confirmed) return;

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorText(response, data, "Delete failed."));
      router.push("/Panel/Ecommerce/Product");
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      setLoading(false);
    }
  };

  const sectionProps = { formData, setFormData, errors };
  const errorEntries = Object.entries(errors);

  if (saved && !isEdit) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900" role="status">
        <h2 className="text-lg font-semibold">
          “{saved.product?.title}” was created in Shopify
          {saved.product?.status === "draft" ? " as a draft" : ""}.
        </h2>
        {saved.partial === "publications" && (
          <p className="mt-2 text-sm text-amber-800">
            The product was created, but its sales channels could not be updated. Retry it from the product list
            (Needs attention).
          </p>
        )}
        {saved.notSent.length > 0 && (
          <p className="mt-2 text-sm text-amber-800">Not saved to Shopify by SmartSell: {saved.notSent.join(", ")}.</p>
        )}
        <ImageResults results={saved.imageResults} />
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
          <Link href="/Panel/Ecommerce/Product" className="rounded-xl bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800">
            Go to products
          </Link>
          {saved.product?.id && (
            <Link href={`/Panel/Ecommerce/Product/${saved.product.id}/edit`} className="rounded-xl border border-emerald-700 px-4 py-2 hover:bg-emerald-100">
              Edit this product
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left */}

      <div className="xl:col-span-2 space-y-6">
        {multiVariant && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This product has {product.variantCount} variants. Price, SKU, barcode and shipping differ per variant and are
            not edited by this form; everything else is.
          </p>
        )}

        <GeneralInformation {...sectionProps} />

        <MediaUploader
          formData={formData}
          setFormData={setFormData}
          existingImages={isEdit ? product.images || [] : []}
        />

        <Pricing {...sectionProps} />

        <InventoryFields
          {...sectionProps}
          onEditable={setInventoryEditable}
          disabledReason={multiVariant ? "Stock differs per variant for this product and is not edited here." : null}
        />

        <Shipping
          {...sectionProps}
          disabledReason={multiVariant ? "Shipping details differ per variant for this product and are not edited here." : null}
        />

        <Seo {...sectionProps} />

        {(message || errorEntries.length > 0 || (saved && isEdit)) && (
          <div aria-live="polite" className="space-y-2">
            {saved && isEdit && !message && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
                Changes saved to Shopify.
                {saved.notSent.length > 0 && ` Not saved by SmartSell: ${saved.notSent.join(", ")}.`}
              </p>
            )}
            {saved && isEdit && !message && saved.imageResults && (
              <ImageResults results={saved.imageResults} />
            )}
            {message && (
              <p
                role={message.type === "error" ? "alert" : "status"}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  message.type === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {message.text}
              </p>
            )}
            {errorEntries.length > 0 && (
              <ul className="list-disc rounded-xl border border-red-200 bg-red-50 py-3 pl-8 pr-4 text-sm text-red-800">
                {errorEntries.map(([field, text]) => (
                  <li key={field}>
                    {FIELD_LABELS[field] || field}: {text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ActionButtons
          loading={loading}
          onCancel={() => router.push(isEdit ? "/Panel/Ecommerce/Product" : "/Panel/Ecommerce/Listing")}
          onSaveDraft={isEdit ? null : () => submit("draft")}
          onPublish={() => submit(isEdit ? null : "active")}
          publishLabel={isEdit ? "Save Changes" : "Publish Product"}
        />

        {isEdit && (
          <div className="rounded-2xl border border-red-200 bg-white p-5">
            <h2 className="font-semibold text-red-700">Delete product</h2>
            <p className="mt-1 text-sm text-slate-600">
              Deletes the product from your Shopify store. SmartSell keeps an archived record for order history.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="mt-3 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Delete from Shopify
            </button>
          </div>
        )}
      </div>

      {/* Right */}

      <div className="space-y-6">
        <Organization {...sectionProps} onChannelsAvailability={setChannelsAvailable} />
      </div>
    </div>
  );
}
