import AmazonListing from "@/models/AmazonListing";

// Listings Items API 2021-08-01 (operations and fields as in Amazon's API
// model): getListingsItem, searchListingsItems, putListingsItem,
// patchListingsItem, deleteListingsItem. Only mapped fields are kept.
//
// Writes return a ListingsItemSubmissionResponse: status ACCEPTED (queued for
// processing; not yet live), INVALID (rejected, with issues) or VALID (mode
// VALIDATION_PREVIEW passed). Acceptance is not publication: the listing's
// real state comes from a later getListingsItem (summaries status + issues).

const str = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const date = (v) => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const num = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const itemPath = (sellerId, sku) => `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`;
export const LISTING_DETAIL_DATA = ["summaries", "offers", "fulfillmentAvailability", "issues"];
export const SUBMISSION_DATA = ["issues", "identifiers"];

// Summary fields only (used by the Sandbox Data Viewer).
export function toSafeListing(item, marketplaceId) {
  const sku = str(item?.sku, 200);
  if (!sku) return null;
  const summaries = Array.isArray(item.summaries) ? item.summaries : [];
  const s = summaries.find((x) => x?.marketplaceId === marketplaceId) || summaries[0] || {};
  return {
    sku,
    marketplaceId: str(s.marketplaceId, 20) || marketplaceId,
    asin: str(s.asin, 20),
    productType: str(s.productType, 100),
    conditionType: str(s.conditionType, 50),
    statuses: (Array.isArray(s.status) ? s.status : []).filter((x) => str(x, 40)).slice(0, 10),
    itemName: str(s.itemName, 500),
    createdDate: date(s.createdDate),
    lastUpdatedDate: date(s.lastUpdatedDate),
  };
}

export function toSafeIssues(issues) {
  return (Array.isArray(issues) ? issues : []).slice(0, 50).map((i) => ({
    code: str(String(i?.code ?? ""), 40),
    message: typeof i?.message === "string" ? i.message.slice(0, 1000) : null,
    severity: ["ERROR", "WARNING", "INFO"].includes(i?.severity) ? i.severity : "INFO",
    attributeNames: (Array.isArray(i?.attributeNames) ? i.attributeNames : []).filter((a) => str(a, 100)).slice(0, 20),
  }));
}

// Summary + the seller's own offer price + fulfillment + issues.
export function toListingRecord(item, marketplaceId) {
  const base = toSafeListing(item, marketplaceId);
  if (!base) return null;
  const offers = (Array.isArray(item.offers) ? item.offers : []).filter((o) => !o.marketplaceId || o.marketplaceId === base.marketplaceId);
  const offer = offers.find((o) => o.offerType === "B2C") || offers[0];
  const fulfillment = (Array.isArray(item.fulfillmentAvailability) ? item.fulfillmentAvailability : [])[0];
  const channel = str(fulfillment?.fulfillmentChannelCode, 40);
  return {
    ...base,
    price: num(offer?.price?.amount),
    currency: str(offer?.price?.currencyCode, 3),
    fulfillmentChannel: channel,
    quantity: channel === "DEFAULT" ? num(fulfillment?.quantity) : null,
    issues: toSafeIssues(item.issues),
  };
}

export function toSubmission(response) {
  return {
    status: ["ACCEPTED", "INVALID", "VALID"].includes(response?.status) ? response.status : "INVALID",
    submissionId: str(response?.submissionId, 100),
    issues: toSafeIssues(response?.issues),
    asin: str(response?.identifiers?.[0]?.asin, 20),
  };
}

// Processing result from a fresh listing read: failed when Amazon reports an
// ERROR issue, live when the listing is buyable or discoverable, otherwise
// still processing.
export function processingStatus(record) {
  if (!record) return "processing";
  if ((record.issues || []).some((i) => i.severity === "ERROR")) return "failed";
  if ((record.statuses || []).some((s) => s === "BUYABLE" || s === "DISCOVERABLE")) return "live";
  return "processing";
}

// The mapped listing plus Amazon's raw response (raw only for the Sandbox
// Data Viewer's debug view; never stored).
export async function fetchListingsItem(client, { sellerId, sku, marketplaceId, includedData }) {
  const raw = await client.get("getListingsItem", itemPath(sellerId, sku), { marketplaceIds: [marketplaceId], includedData });
  return { listing: toSafeListing(raw, marketplaceId), record: toListingRecord(raw, marketplaceId), raw };
}

export async function getListingsItem(client, args) {
  return (await fetchListingsItem(client, args)).listing;
}

// One page of the seller's listings (pageToken pagination).
export async function searchListingsItems(client, { sellerId, marketplaceId, pageToken, pageSize = 20 }) {
  const data = await client.get("searchListingsItems", `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`, {
    marketplaceIds: [marketplaceId],
    includedData: LISTING_DETAIL_DATA,
    pageSize,
    pageToken,
  });
  return {
    items: (Array.isArray(data?.items) ? data.items : []).map((i) => toListingRecord(i, marketplaceId)).filter(Boolean),
    nextToken: str(data?.pagination?.nextToken, 4096),
  };
}

// putListingsItem: creates or fully replaces a listing.
export async function putListingsItem(client, { sellerId, sku, marketplaceId, productType, attributes, preview = false }) {
  const response = await client.put(
    "putListingsItem",
    itemPath(sellerId, sku),
    { marketplaceIds: [marketplaceId], includedData: SUBMISSION_DATA, mode: preview ? "VALIDATION_PREVIEW" : undefined },
    { productType, requirements: "LISTING", attributes },
  );
  return toSubmission(response);
}

// patchListingsItem: partial update with JSON Patch operations on attributes.
export async function patchListingsItem(client, { sellerId, sku, marketplaceId, productType, patches, preview = false }) {
  const response = await client.patch(
    "patchListingsItem",
    itemPath(sellerId, sku),
    { marketplaceIds: [marketplaceId], includedData: SUBMISSION_DATA, mode: preview ? "VALIDATION_PREVIEW" : undefined },
    { productType, patches },
  );
  return toSubmission(response);
}

export async function deleteListingsItem(client, { sellerId, sku, marketplaceId }) {
  return toSubmission(await client.delete("deleteListingsItem", itemPath(sellerId, sku), { marketplaceIds: [marketplaceId] }));
}

// ── Attribute builders (Amazon listing attribute format) ───────────────────
const LANG = "en_US";
const textAttr = (value, marketplaceId) => [{ value, language_tag: LANG, marketplace_id: marketplaceId }];

export function priceAttribute(price, currency, marketplaceId) {
  return [{ marketplace_id: marketplaceId, currency, our_price: [{ schedule: [{ value_with_tax: price }] }] }];
}

export function fulfillmentAttribute(fulfillment, quantity) {
  return fulfillment === "FBA"
    ? [{ fulfillment_channel_code: "AMAZON_NA" }]
    : [{ fulfillment_channel_code: "DEFAULT", quantity: quantity ?? 0 }];
}

// Seller-provided attributes plus the form's convenience fields. Explicit
// `attributes` win, so product-type-specific values are never overwritten.
export function buildAttributes(value, marketplaceId) {
  const out = {};
  if (value.title) out.item_name = textAttr(value.title, marketplaceId);
  if (value.description) out.product_description = textAttr(value.description, marketplaceId);
  if (value.brand) out.brand = textAttr(value.brand, marketplaceId);
  if (value.manufacturer) out.manufacturer = textAttr(value.manufacturer, marketplaceId);
  if (value.bulletPoints?.length) out.bullet_point = value.bulletPoints.map((b) => ({ value: b, language_tag: LANG, marketplace_id: marketplaceId }));
  if (value.condition) out.condition_type = [{ value: value.condition, marketplace_id: marketplaceId }];
  if (value.images?.length) {
    out.main_product_image_locator = [{ media_location: value.images[0], marketplace_id: marketplaceId }];
    value.images.slice(1).forEach((url, i) => {
      out[`other_product_image_locator_${i + 1}`] = [{ media_location: url, marketplace_id: marketplaceId }];
    });
  }
  if (value.identifier) {
    if (value.identifier.type === "asin") out.merchant_suggested_asin = [{ value: value.identifier.value, marketplace_id: marketplaceId }];
    else out.externally_assigned_product_identifier = [{ type: value.identifier.type, value: value.identifier.value, marketplace_id: marketplaceId }];
  }
  if (value.price !== undefined) out.purchasable_offer = priceAttribute(value.price, value.currency, marketplaceId);
  if (value.fulfillment) out.fulfillment_availability = fulfillmentAttribute(value.fulfillment, value.quantity);
  return { ...out, ...(value.attributes || {}) };
}

// JSON Patch operations for an update. Offer price and fulfillment quantity
// use "merge", so the seller's other offer and fulfillment settings (sale
// prices, price limits, handling time, ...) are kept; other attributes are
// replaced with the new value.
const MERGED_ATTRIBUTES = new Set(["purchasable_offer", "fulfillment_availability"]);

export function buildPatches(value, marketplaceId) {
  const attrs = buildAttributes({ ...value, fulfillment: undefined }, marketplaceId);
  if (value.quantity !== undefined) attrs.fulfillment_availability = fulfillmentAttribute("MFN", value.quantity);
  return Object.entries(attrs).map(([name, v]) => ({ op: MERGED_ATTRIBUTES.has(name) ? "merge" : "replace", path: `/attributes/${name}`, value: v }));
}

// ── Storage ───────────────────────────────────────────────────────────────
// Stores one listing for an account (loaded for its owner).
export async function saveListing(account, listing, { now = new Date(), extra = {} } = {}) {
  return AmazonListing.findOneAndUpdate(
    { user: account.user, amazonAccount: account._id, marketplaceId: listing.marketplaceId, sku: listing.sku },
    { $set: { ...listing, ...extra, environment: account.environment, lastSyncedAt: now } },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).lean();
}

export async function syncListingsItem(account, client, { sku, marketplaceId }) {
  const listing = await getListingsItem(client, { sellerId: account.sellingPartnerId, sku, marketplaceId });
  return listing ? saveListing(account, listing) : null;
}
