import crypto from "node:crypto";

// Server-side validation for SmartSell → eBay product writes. Only the
// fields below are ever sent to eBay; anything else in a request is ignored.
// Limits follow eBay's Inventory API.

export const CONDITIONS = [
  "NEW",
  "LIKE_NEW",
  "NEW_OTHER",
  "NEW_WITH_DEFECTS",
  "CERTIFIED_REFURBISHED",
  "EXCELLENT_REFURBISHED",
  "VERY_GOOD_REFURBISHED",
  "GOOD_REFURBISHED",
  "SELLER_REFURBISHED",
  "USED_EXCELLENT",
  "USED_VERY_GOOD",
  "USED_GOOD",
  "USED_ACCEPTABLE",
  "FOR_PARTS_OR_NOT_WORKING",
];
const NEW_CONDITIONS = new Set(["NEW", "LIKE_NEW", "NEW_OTHER"]);

const SKU_RE = /^[A-Za-z0-9._-]{1,50}$/;
const PRICE_RE = /^\d{1,9}(\.\d{1,2})?$/;
const CATEGORY_RE = /^\d{1,10}$/;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

export const LIMITS = {
  title: 80,
  description: 50000,
  conditionDescription: 1000,
  images: 24,
  imageUrl: 1000,
  aspects: 45,
  aspectName: 65,
  aspectValue: 65,
  aspectValues: 30,
  maxQuantity: 1_000_000,
  maxPrice: 99_999_999,
};

const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
const trimmed = (v) => (typeof v === "string" ? v.trim() : v);

export function generateSku() {
  return `SS-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function validImageUrl(value) {
  if (typeof value !== "string" || value.length > LIMITS.imageUrl) return false;
  try {
    const url = new URL(value);
    // eBay downloads images itself, so they must be public HTTPS URLs.
    return url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function aspectsValue(input, errors) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    errors.aspects = "Item specifics must be name/value pairs";
    return undefined;
  }
  const entries = Object.entries(input);
  if (entries.length > LIMITS.aspects) {
    errors.aspects = `At most ${LIMITS.aspects} item specifics`;
    return undefined;
  }
  const out = {};
  for (const [rawName, rawValues] of entries) {
    const name = String(rawName).trim();
    const values = (Array.isArray(rawValues) ? rawValues : [rawValues])
      .map((v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : ""))
      .filter(Boolean);
    if (!name || !values.length) continue;
    if (name.length > LIMITS.aspectName) {
      errors.aspects = `Item specific names can be at most ${LIMITS.aspectName} characters`;
      return undefined;
    }
    if (values.length > LIMITS.aspectValues || values.some((v) => v.length > LIMITS.aspectValue)) {
      errors.aspects = `“${name}”: at most ${LIMITS.aspectValues} values of ${LIMITS.aspectValue} characters`;
      return undefined;
    }
    out[name] = [...new Set(values)];
  }
  return out;
}

// mode: "create" | "update". On update, the SKU and account cannot change
// and the full form is expected (eBay replaces items and offers as a whole).
export function validateEbayProductInput(body, { mode }) {
  const errors = {};
  const value = {};
  if (!body || typeof body !== "object") {
    return { value, errors: { form: "Invalid request" } };
  }

  if (mode === "create") {
    if (typeof body.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_RE.test(body.idempotencyKey)) {
      errors.idempotencyKey = "Missing request key. Reload the page and try again.";
    } else {
      value.idempotencyKey = body.idempotencyKey;
    }
    if (!isBlank(body.accountId)) {
      if (typeof body.accountId !== "string" || !OBJECT_ID_RE.test(body.accountId)) errors.accountId = "Choose an eBay account";
      else value.accountId = body.accountId;
    }
    if (isBlank(body.sku)) {
      value.sku = generateSku();
    } else if (typeof body.sku !== "string" || !SKU_RE.test(body.sku.trim())) {
      errors.sku = "Use up to 50 letters, numbers, dots, dashes or underscores";
    } else {
      value.sku = body.sku.trim();
    }
  }

  const title = trimmed(body.title);
  if (isBlank(title) || typeof title !== "string") errors.title = "Title is required";
  else if (title.length > LIMITS.title) errors.title = `eBay titles can be at most ${LIMITS.title} characters`;
  else value.title = title;

  const description = trimmed(body.description);
  if (isBlank(description)) value.description = "";
  else if (typeof description !== "string" || description.length > LIMITS.description) errors.description = `At most ${LIMITS.description} characters`;
  else value.description = description;

  const price = typeof body.price === "number" ? String(body.price) : trimmed(body.price);
  if (isBlank(price)) errors.price = "Price is required";
  else if (typeof price !== "string" || !PRICE_RE.test(price) || Number(price) <= 0 || Number(price) > LIMITS.maxPrice) {
    errors.price = "Enter a price greater than 0 with up to 2 decimals";
  } else value.price = Number(price);

  const quantity = typeof body.quantity === "string" && /^\d+$/.test(body.quantity.trim()) ? Number(body.quantity) : body.quantity;
  if (isBlank(quantity)) value.quantity = 0;
  else if (!Number.isInteger(quantity) || quantity < 0 || quantity > LIMITS.maxQuantity) errors.quantity = "Enter a whole number of 0 or more";
  else value.quantity = quantity;

  const condition = isBlank(body.condition) ? "NEW" : String(body.condition).trim().toUpperCase();
  if (!CONDITIONS.includes(condition)) errors.condition = "Choose a condition";
  else value.condition = condition;

  const conditionDescription = trimmed(body.conditionDescription);
  if (!isBlank(conditionDescription)) {
    if (typeof conditionDescription !== "string" || conditionDescription.length > LIMITS.conditionDescription) {
      errors.conditionDescription = `At most ${LIMITS.conditionDescription} characters`;
    } else if (NEW_CONDITIONS.has(condition)) {
      // eBay ignores/rejects condition notes on new items.
      value.conditionDescription = "";
    } else {
      value.conditionDescription = conditionDescription;
    }
  } else value.conditionDescription = "";

  const categoryId = trimmed(body.categoryId);
  if (isBlank(categoryId)) value.categoryId = "";
  else if (typeof categoryId !== "string" || !CATEGORY_RE.test(categoryId)) errors.categoryId = "Choose an eBay category";
  else value.categoryId = categoryId;
  const categoryName = trimmed(body.categoryName);
  value.categoryName = typeof categoryName === "string" ? categoryName.slice(0, 300) : "";

  if (isBlank(body.aspects)) value.aspects = {};
  else {
    const aspects = aspectsValue(body.aspects, errors);
    if (aspects) value.aspects = aspects;
  }

  const images = isBlank(body.imageUrls) ? [] : body.imageUrls;
  if (!Array.isArray(images) || images.length > LIMITS.images || !images.every(validImageUrl)) {
    errors.imageUrls = `Up to ${LIMITS.images} public https:// image URLs`;
  } else value.imageUrls = [...new Set(images)];

  value.publish = body.publish === undefined ? true : body.publish === true;

  // Publishing needs what eBay requires for a live listing.
  if (value.publish) {
    if (!value.categoryId && !errors.categoryId) errors.categoryId = "Choose an eBay category to publish";
    if (!value.description && !errors.description) errors.description = "eBay requires a description to publish";
    if (value.imageUrls && !value.imageUrls.length) errors.imageUrls = "eBay requires at least one image to publish";
    if (value.quantity === 0) errors.quantity = "Quantity must be at least 1 to publish";
  }

  return { value, errors };
}
