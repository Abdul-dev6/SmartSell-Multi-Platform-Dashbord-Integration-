import { isRegionMarketplace, marketplaceCurrency } from "@/lib/amazon/config";
import { invalid } from "@/lib/amazon/errors";

// Input validation for Amazon listing writes, before anything is sent to
// Amazon. Product-type-specific requirements are checked separately against
// the Product Type Definition (lib/amazon/productTypes.js) and by Amazon's
// VALIDATION_PREVIEW mode.

export const SKU_RE = /^[\x21-\x7E][\x20-\x7E]{0,39}$/; // printable ASCII, 1–40 chars
const PRODUCT_TYPE_RE = /^[A-Z0-9_]{1,64}$/;
const ATTRIBUTE_RE = /^[a-z0-9_]{1,100}$/;
const CONDITION_RE = /^[a-z_]{3,40}$/;
const MAX_ATTRIBUTES_BYTES = 50_000;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max) => (typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null);

export function validateSku(sku) {
  return typeof sku === "string" && SKU_RE.test(sku) && sku === sku.trim();
}

// The marketplace must be one the seller's account is authorized in, and in
// the configured region.
export function validateMarketplace(account, marketplaceId) {
  return typeof marketplaceId === "string" && isRegionMarketplace(marketplaceId) && (account.marketplaceIds || []).includes(marketplaceId);
}

export function validatePrice(price, currency, marketplaceId) {
  const errors = {};
  const value = typeof price === "string" ? Number(price) : price;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000 || Math.round(value * 100) !== value * 100) {
    errors.price = "Price must be more than 0, at most 1,000,000, with up to 2 decimals.";
  }
  const expected = marketplaceCurrency(marketplaceId);
  if (!currency || currency !== expected) errors.currency = `Currency must be ${expected || "the marketplace currency"} for this marketplace.`;
  return { value, errors };
}

export function validateQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 0 && quantity <= 1_000_000;
}

// Validates a create (all required fields) or an update (only what is sent).
// Returns { value, errors }.
export function validateListingInput(body, { account, mode }) {
  const errors = {};
  const value = {};
  if (!isPlainObject(body)) return { value, errors: { body: "Send the listing as a JSON object." } };

  if (mode === "create") {
    if (!validateSku(body.sku)) errors.sku = "SKU must be 1–40 printable characters with no leading or trailing spaces.";
    else value.sku = body.sku;
    if (!validateMarketplace(account, body.marketplaceId)) errors.marketplaceId = "Choose a marketplace this Amazon account is authorized to sell in.";
    else value.marketplaceId = body.marketplaceId;
    if (typeof body.productType !== "string" || !PRODUCT_TYPE_RE.test(body.productType)) errors.productType = "Choose an Amazon product type.";
    else value.productType = body.productType;
    if (!["MFN", "FBA"].includes(body.fulfillment)) errors.fulfillment = "Choose seller-fulfilled (MFN) or Fulfilled by Amazon (FBA).";
    else value.fulfillment = body.fulfillment;
  }

  const fields = {
    title: [500, "Title must be 1–500 characters."],
    description: [2000, "Description must be 1–2,000 characters."],
    brand: [100, "Brand must be 1–100 characters."],
    manufacturer: [100, "Manufacturer must be 1–100 characters."],
  };
  for (const [key, [max, message]] of Object.entries(fields)) {
    if (body[key] === undefined) continue;
    const v = text(body[key], max);
    if (!v) errors[key] = message;
    else value[key] = v;
  }
  if (body.condition !== undefined) {
    if (typeof body.condition !== "string" || !CONDITION_RE.test(body.condition)) errors.condition = "Condition must be an Amazon condition_type value such as new_new.";
    else value.condition = body.condition;
  }
  if (body.bulletPoints !== undefined) {
    const list = Array.isArray(body.bulletPoints) ? body.bulletPoints.map((b) => text(b, 500)) : [];
    if (!Array.isArray(body.bulletPoints) || list.length > 10 || list.some((b) => !b)) errors.bulletPoints = "Up to 10 bullet points of 1–500 characters.";
    else value.bulletPoints = list;
  }
  if (body.images !== undefined) {
    const ok =
      Array.isArray(body.images) &&
      body.images.length <= 9 &&
      body.images.every((u) => {
        try {
          return typeof u === "string" && new URL(u).protocol === "https:";
        } catch {
          return false;
        }
      });
    if (!ok) errors.images = "Up to 9 image URLs, each starting with https://.";
    else value.images = body.images;
  }
  if (body.identifier !== undefined) {
    const id = body.identifier;
    if (!isPlainObject(id) || !["ean", "upc", "gtin", "isbn", "asin"].includes(id.type) || typeof id.value !== "string" || !/^[A-Za-z0-9]{10,14}$/.test(id.value)) {
      errors.identifier = "Identifier must be { type: ean|upc|gtin|isbn|asin, value }.";
    } else value.identifier = { type: id.type, value: id.value };
  }
  if (body.attributes !== undefined) {
    const a = body.attributes;
    const okShape = isPlainObject(a) && Object.entries(a).every(([k, v]) => ATTRIBUTE_RE.test(k) && Array.isArray(v));
    if (!okShape) errors.attributes = "Attributes must be an object of Amazon attribute names to arrays of values.";
    else if (JSON.stringify(a).length > MAX_ATTRIBUTES_BYTES) errors.attributes = "Attributes are too large.";
    else value.attributes = a;
  }
  if (body.price !== undefined) {
    const marketplaceId = value.marketplaceId || body.marketplaceId;
    const p = validatePrice(body.price, body.currency, marketplaceId);
    Object.assign(errors, p.errors);
    if (!Object.keys(p.errors).length) {
      value.price = p.value;
      value.currency = body.currency;
    }
  }
  if (body.quantity !== undefined) {
    if (!validateQuantity(body.quantity)) errors.quantity = "Quantity must be a whole number from 0 to 1,000,000.";
    else value.quantity = body.quantity;
  }
  if (mode === "create" && value.fulfillment === "FBA" && body.quantity !== undefined) {
    errors.quantity = "Amazon manages quantities for Fulfilled by Amazon listings.";
  }
  if (mode === "update" && !Object.keys(value).length && !Object.keys(errors).length) {
    errors.body = "Nothing to update.";
  }
  return { value, errors };
}

export function assertValid({ value, errors }) {
  if (Object.keys(errors).length) throw invalid("Check the highlighted fields.", errors);
  return value;
}
