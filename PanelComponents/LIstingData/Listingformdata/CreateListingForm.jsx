"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import GeneralInformation from "./GeneralInformation";
import Organization from "./Orginization";
import MediaUploader from "./CreateMediaUploader";
import Pricing from "./Pricing";
import Inventory from "./Inventory";
import Shipping from "./Shipping";
import Seo from "./Seo";
import ActionButtons from "./Actionbutton";

const EMPTY_FORM = {
  // General
  title: "",
  description: "",
  vendor: "",
  productType: "",
  tags: "",

  // Organization
  status: "active",
  collection: "",
  category: "",
  salesChannel: "shopify",
  visibility: "online",

  // Media
  images: [],

  // Pricing
  price: "",
  comparePrice: "",
  cost: "",

  // Inventory
  sku: "",
  barcode: "",
  warehouse: "Main Warehouse",
  trackInventory: true,
  continueSelling: false,

  // Shipping
  physicalProduct: true,
  weight: "",
  length: "",
  width: "",
  height: "",
  country: "Pakistan",
  hsCode: "",

  // SEO
  seoTitle: "",
  seoDescription: "",
  handle: "",
};

// Fields sent to the API. The server decides what reaches Shopify and
// reports anything it could not send.
const SENDABLE = [
  "title", "description", "vendor", "productType", "tags", "status",
  "price", "comparePrice", "cost", "sku", "barcode", "trackInventory",
  "continueSelling", "seoTitle", "seoDescription", "handle",
];

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
  idempotencyKey: "Request",
  _form: "Form",
};

function formFromProduct(product) {
  return {
    ...EMPTY_FORM,
    title: product.title || "",
    description: product.description || "",
    vendor: product.vendor || "",
    productType: product.productType || "",
    tags: (product.tags || []).join(", "),
    status: product.status || "draft",
    price: product.price ?? "",
    comparePrice: product.comparePrice ?? "",
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    handle: product.handle || "",
  };
}

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

  const buildPayload = (statusOverride) => {
    const keys = isEdit
      ? SENDABLE.filter((key) => String(formData[key] ?? "") !== String(baseline[key] ?? ""))
      : SENDABLE;
    const payload = Object.fromEntries(keys.map((key) => [key, formData[key]]));
    if (statusOverride) payload.status = statusOverride;
    if (!isEdit) payload.idempotencyKey = requestKey;
    return payload;
  };

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
        setSaved({ product: data.product, notSent: data.notSent || [], imageResults });
        if (isEdit) {
          const fresh = formFromProduct(data.product);
          setBaseline(fresh);
          setFormData(fresh);
        }
        return;
      }

      if (data.errors) setErrors(data.errors);
      const shopifyErrors = (data.userErrors || []).map((e) => e.message);
      setMessage({
        type: "error",
        text: [data.message || "Save failed.", ...shopifyErrors].join(" "),
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
      if (!response.ok) throw new Error(data.message || "Delete failed.");
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
        {saved.notSent.length > 0 && (
          <p className="mt-2 text-sm text-amber-800">
            Not sent to Shopify: {saved.notSent.join(", ")}. Set these in Shopify admin.
          </p>
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
        {isEdit && product.variantCount > 1 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This product has {product.variantCount} variants. Price, SKU and barcode are managed per variant in Shopify; other fields can be edited here.
          </p>
        )}

        <GeneralInformation {...sectionProps} />

        <MediaUploader
          formData={formData}
          setFormData={setFormData}
          existingImages={isEdit ? product.images || [] : []}
        />

        <Pricing {...sectionProps} />

        <Inventory {...sectionProps} />

        <Shipping formData={formData} setFormData={setFormData} />

        <Seo {...sectionProps} />

        {(message || errorEntries.length > 0 || (saved && isEdit)) && (
          <div aria-live="polite" className="space-y-2">
            {saved && isEdit && !message && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
                Changes saved to Shopify.
                {saved.notSent.length > 0 && ` Not sent: ${saved.notSent.join(", ")}.`}
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
        <Organization {...sectionProps} />
      </div>
    </div>
  );
}
