// Form state <-> API payload for the Add/Edit Product form. Kept free of
// React so it can be unit tested.

export const EMPTY_FORM = {
  // General
  title: "",
  description: "",
  vendor: "",
  productType: "",
  tags: "",

  // Organization
  status: "active",
  category: null, // { id, name, fullName }
  collections: [], // [{ id, title, manual }]
  publications: [], // publication IDs
  publicationsKnown: true,

  // Media
  images: [],

  // Pricing
  price: "",
  comparePrice: "",
  cost: "",

  // Inventory
  sku: "",
  barcode: "",
  trackInventory: true,
  continueSelling: false,
  // Available stock per location ID, as typed ("" = not set).
  inventory: {},
  // Stock as loaded from SmartSell, per location ID (numbers); sent as
  // `expected` so a change made in Shopify since loading is not overwritten.
  inventoryExpected: {},

  // Shipping (the variant's inventory item in Shopify)
  requiresShipping: true,
  weight: "",
  weightUnit: "KILOGRAMS",
  countryOfOrigin: "",
  hsCode: "",

  // SEO
  seoTitle: "",
  seoDescription: "",
  handle: "",
};

// Fields sent to the API. The server validates them, decides what reaches
// Shopify and reports anything it could not send.
const BASIC = [
  "title", "description", "vendor", "productType", "tags", "status",
  "price", "comparePrice", "sku", "barcode",
  "continueSelling", "seoTitle", "seoDescription", "handle",
];
// Per-variant fields (single-variant products only).
const SHIPPING = ["cost", "requiresShipping", "weight", "weightUnit", "countryOfOrigin", "hsCode"];

export function formFromProduct(product) {
  const shipping = product.shipping || {};
  const levels = product.inventoryLevels || [];
  return {
    ...EMPTY_FORM,
    title: product.title || "",
    description: product.description || "",
    vendor: product.vendor || "",
    productType: product.productType || "",
    tags: (product.tags || []).join(", "),
    status: product.status || "draft",
    category: product.category || null,
    collections: product.collections || [],
    publications: product.publishedOn || [],
    publicationsKnown: Boolean(product.publishedOnKnown),
    price: product.price ?? "",
    comparePrice: product.comparePrice ?? "",
    cost: product.cost ?? "",
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    handle: product.handle || "",
    trackInventory: product.trackInventory ?? true,
    inventory: Object.fromEntries(levels.map((l) => [String(l.locationId), l.available === null || l.available === undefined ? "" : String(l.available)])),
    inventoryExpected: Object.fromEntries(levels.map((l) => [String(l.locationId), l.available ?? null])),
    requiresShipping: shipping.requiresShipping ?? true,
    weight: shipping.weight === null || shipping.weight === undefined ? "" : String(shipping.weight),
    weightUnit: shipping.weightUnit || "KILOGRAMS",
    countryOfOrigin: shipping.countryCodeOfOrigin || "",
    hsCode: shipping.harmonizedSystemCode || "",
  };
}

// The API value of a form field.
function apiValue(key, form) {
  if (key === "category") return form.category?.id ?? "";
  if (key === "collections") return form.collections.map((c) => c.id);
  return form[key];
}

// Comparable form of a value (order of selections does not matter).
function canonical(key, form) {
  const value = apiValue(key, form);
  return JSON.stringify(Array.isArray(value) ? [...value].sort() : value ?? "");
}

// The request body. Create sends every field that has a value; edit sends
// only fields that changed, so untouched Shopify values are never
// overwritten. Options:
//   channelsAvailable – sales channels can be sent (permissions granted and
//                       the product's current channels are known)
//   shippingEditable  – false for products with several variants
//   inventoryEditable – stock can be managed (write_inventory granted and a
//                       single variant)
//   statusOverride    – e.g. "draft" from "Save as draft"
export function buildProductPayload(form, baseline, { isEdit, channelsAvailable, shippingEditable = true, inventoryEditable = false, statusOverride, idempotencyKey } = {}) {
  const keys = [...BASIC, "category", "collections"];
  if (channelsAvailable) keys.push("publications");
  if (inventoryEditable) keys.push("trackInventory");
  if (shippingEditable) keys.push(...SHIPPING);

  let changed = isEdit ? keys.filter((key) => canonical(key, form) !== canonical(key, baseline)) : keys;

  if (!isEdit) {
    // Nothing chosen = nothing to send for these on create.
    changed = changed.filter((key) => {
      if (key === "category") return Boolean(form.category);
      if (key === "collections" || key === "publications") return form[key].length > 0;
      return true;
    });
  }
  // Weight and its unit only mean something together.
  if (changed.includes("weight") !== changed.includes("weightUnit")) {
    changed = [...new Set([...changed, "weight", "weightUnit"])];
  }
  // A non-physical product has no weight to send.
  if (shippingEditable && !form.requiresShipping) {
    changed = changed.filter((key) => key !== "weight" && key !== "weightUnit");
  }

  const payload = Object.fromEntries(changed.map((key) => [key, apiValue(key, form)]));
  if (inventoryEditable && form.trackInventory) {
    const inventory = inventoryChanges(form, baseline, isEdit);
    if (inventory.length) payload.inventory = inventory;
  }
  if (statusOverride) payload.status = statusOverride;
  if (!isEdit) payload.idempotencyKey = idempotencyKey;
  return payload;
}

// Stock entries to send: on create every location with a number typed; on
// edit only locations whose number changed (with the stock the user saw).
// A cleared field is not sent: stock cannot be "unset" at a location.
function inventoryChanges(form, baseline, isEdit) {
  const entries = [];
  for (const [locationId, raw] of Object.entries(form.inventory || {})) {
    const text = String(raw ?? "").trim();
    if (text === "") continue;
    if (isEdit && text === String(baseline.inventory?.[locationId] ?? "").trim()) continue;
    entries.push({
      locationId,
      available: Number(text),
      expected: isEdit ? baseline.inventoryExpected?.[locationId] ?? null : null,
    });
  }
  return entries;
}
