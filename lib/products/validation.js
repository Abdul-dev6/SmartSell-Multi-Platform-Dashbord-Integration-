// Server-side validation for SmartSell product writes. Only the fields listed
// here are ever sent to Shopify; everything else in a request is ignored.

// Shopify ProductStatus (2026-07). Status controls whether a product can be
// sold at all; where it appears is decided separately by its sales channels.
const STATUSES = { active: "ACTIVE", draft: "DRAFT", archived: "ARCHIVED", unlisted: "UNLISTED" };
const PRICE_RE = /^\d{1,9}(\.\d{1,2})?$/;
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const CATEGORY_ID_RE = /^gid:\/\/shopify\/TaxonomyCategory\/[A-Za-z0-9-]{1,64}$/;
const COLLECTION_ID_RE = /^gid:\/\/shopify\/Collection\/\d{1,20}$/;
const PUBLICATION_ID_RE = /^gid:\/\/shopify\/Publication\/\d{1,20}$/;
const WEIGHT_RE = /^\d{1,7}(\.\d{1,3})?$/;
const HS_CODE_RE = /^\d{6,13}$/;
const WEIGHT_UNITS = ["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"];
const MAX_COLLECTIONS = 250;
const MAX_PUBLICATIONS = 100;
const MAX_LOCATIONS = 50;
// Shopify's accepted range for an available quantity.
const MIN_QUANTITY = -1_000_000_000;
const MAX_QUANTITY = 1_000_000_000;
const LOCATION_ID_RE = /^(?:gid:\/\/shopify\/Location\/)?(\d{1,20})$/;
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

// Form fields SmartSell accepts but does not send to Shopify. Package
// dimensions belong to Shopify shipping packages, which this integration
// does not manage. (Images are uploaded separately.)
const NOT_SENT_FIELDS = {
  length: "package dimensions",
  width: "package dimensions",
  height: "package dimensions",
};

// A list of Shopify IDs of one type: unique, at most `max`.
function idList(value, re, field, errors, max) {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !re.test(id))) {
    errors[field] = "Contains an invalid selection";
    return undefined;
  }
  const unique = [...new Set(value)];
  if (unique.length > max) {
    errors[field] = `Select at most ${max}`;
    return undefined;
  }
  return unique;
}

const isBlank = (v) => v === undefined || v === null || v === "";

const isQuantity = (n) => Number.isInteger(n) && n >= MIN_QUANTITY && n <= MAX_QUANTITY;
const toInt = (v) => (typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN);

// Available stock per location: [{ locationId, available, expected }].
// `expected` is the stock the user saw (null when not stocked there yet);
// SmartSell refuses the change if Shopify's stock has moved since.
function inventoryList(value, errors) {
  if (!Array.isArray(value) || value.length > MAX_LOCATIONS) {
    errors.inventory = `Must be a list of at most ${MAX_LOCATIONS} locations`;
    return undefined;
  }
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    const match = typeof entry?.locationId === "string" || typeof entry?.locationId === "number"
      ? LOCATION_ID_RE.exec(String(entry.locationId))
      : null;
    const available = toInt(entry?.available);
    const expected = entry?.expected === null || entry?.expected === undefined ? null : toInt(entry.expected);
    if (!match || seen.has(match[1])) {
      errors.inventory = "Contains an invalid or repeated location";
      return undefined;
    }
    if (!isQuantity(available) || (expected !== null && !isQuantity(expected))) {
      errors.inventory = "Quantities must be whole numbers";
      return undefined;
    }
    seen.add(match[1]);
    result.push({ locationId: match[1], available, expected });
  }
  return result;
}

// Shipping fields, applied to the product's (single) variant inventory item.
function shippingFields(input, errors) {
  const shipping = {};

  const requires = input.requiresShipping ?? input.physicalProduct;
  if (requires !== undefined) {
    if (typeof requires !== "boolean") errors.requiresShipping = "Must be yes or no";
    else shipping.requiresShipping = requires;
  }

  if (!isBlank(input.weight)) {
    const raw = typeof input.weight === "number" ? String(input.weight) : input.weight;
    const unit = typeof input.weightUnit === "string" ? input.weightUnit.toUpperCase() : null;
    if (typeof raw !== "string" || !WEIGHT_RE.test(raw.trim())) {
      errors.weight = "Must be a non-negative number with up to 3 decimals";
    } else if (!WEIGHT_UNITS.includes(unit)) {
      errors.weightUnit = "Choose kg, g, lb or oz";
    } else {
      shipping.weight = { value: Number(raw), unit };
    }
  } else if (!isBlank(input.weightUnit) && !WEIGHT_UNITS.includes(String(input.weightUnit).toUpperCase())) {
    errors.weightUnit = "Choose kg, g, lb or oz";
  }

  if (!isBlank(input.hsCode)) {
    const code = typeof input.hsCode === "string" ? input.hsCode.replace(/[.\s]/g, "") : "";
    if (!HS_CODE_RE.test(code)) errors.hsCode = "Must be 6 to 13 digits";
    else shipping.harmonizedSystemCode = code;
  }

  if (!isBlank(input.countryOfOrigin)) {
    const code = typeof input.countryOfOrigin === "string" ? input.countryOfOrigin.trim().toUpperCase() : "";
    // A real ISO 3166 region has a proper display name (unknown ones come
    // back as the code itself or "Unknown Region").
    const name = /^[A-Z]{2}$/.test(code) ? regionNames.of(code) : null;
    if (!name || name === code || name === "Unknown Region") {
      errors.countryOfOrigin = "Choose a country";
    } else {
      shipping.countryCodeOfOrigin = code;
    }
  }

  return shipping;
}

function text(value, field, errors, { required = false, max = 255 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) errors[field] = "Required";
    return undefined;
  }
  if (typeof value !== "string") {
    errors[field] = "Must be text";
    return undefined;
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    errors[field] = "Required";
    return undefined;
  }
  if (trimmed.length > max) {
    errors[field] = `Must be at most ${max} characters`;
    return undefined;
  }
  return trimmed;
}

function price(value, field, errors) {
  if (value === undefined || value === null || value === "") return undefined;
  const str = typeof value === "number" ? String(value) : value;
  if (typeof str !== "string" || !PRICE_RE.test(str.trim())) {
    errors[field] = "Must be a non-negative amount with up to 2 decimals";
    return undefined;
  }
  return Number(str).toFixed(2);
}

function tags(value, errors) {
  if (value === undefined || value === null || value === "") return undefined;
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null;
  if (!list || list.some((t) => typeof t !== "string")) {
    errors.tags = "Must be a comma-separated list";
    return undefined;
  }
  const cleaned = [...new Set(list.map((t) => t.trim()).filter(Boolean))];
  if (cleaned.length > 250 || cleaned.some((t) => t.length > 255)) {
    errors.tags = "At most 250 tags of up to 255 characters";
    return undefined;
  }
  return cleaned;
}

// Validates a create (all core fields) or update (only fields present) request.
// Returns { value, errors, notSent }.
export function validateProductInput(body, { mode }) {
  const errors = {};
  const isCreate = mode === "create";
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const has = (key) => isCreate || Object.prototype.hasOwnProperty.call(input, key);
  const value = {};

  if (isCreate) {
    const key = input.idempotencyKey;
    if (typeof key !== "string" || !IDEMPOTENCY_KEY_RE.test(key)) {
      errors.idempotencyKey = "Missing or invalid request key";
    } else {
      value.idempotencyKey = key;
    }
  }

  if (has("title")) value.title = text(input.title, "title", errors, { required: true });
  if (has("description")) value.descriptionHtml = text(input.description, "description", errors, { max: 65535 }) ?? "";
  if (has("vendor")) value.vendor = text(input.vendor, "vendor", errors) ?? "";
  if (has("productType")) value.productType = text(input.productType, "productType", errors) ?? "";
  if (has("tags")) value.tags = tags(input.tags, errors) ?? [];

  if (has("status")) {
    const status = STATUSES[String(input.status ?? "draft").toLowerCase()];
    if (!status) errors.status = "Must be active, draft, archived or unlisted";
    else value.status = status;
  }

  if (input.handle !== undefined && input.handle !== "") {
    const handle = text(input.handle, "handle", errors);
    if (handle !== undefined && !HANDLE_RE.test(handle)) {
      errors.handle = "Use lowercase letters, numbers and hyphens";
    } else if (handle !== undefined) {
      value.handle = handle;
    }
  }

  const seoTitle = has("seoTitle") ? text(input.seoTitle, "seoTitle", errors, { max: 255 }) : undefined;
  const seoDescription = has("seoDescription")
    ? text(input.seoDescription, "seoDescription", errors, { max: 320 })
    : undefined;
  if (seoTitle !== undefined || seoDescription !== undefined) {
    value.seo = {
      ...(seoTitle !== undefined ? { title: seoTitle } : {}),
      ...(seoDescription !== undefined ? { description: seoDescription } : {}),
    };
  }

  // Variant-level fields (the single default variant).
  const variant = {};
  if (has("price")) {
    const p = price(input.price, "price", errors);
    if (p === undefined && isCreate && !errors.price) errors.price = "Required";
    if (p !== undefined) variant.price = p;
  }
  // Cost per item (the variant's inventory item); used for product cost.
  if (!isBlank(input.cost)) {
    const c = price(input.cost, "cost", errors);
    if (c !== undefined) value.cost = c;
  }
  if (input.comparePrice !== undefined) {
    const c = price(input.comparePrice, "comparePrice", errors);
    variant.compareAtPrice = c ?? null;
  }
  if (input.sku !== undefined) variant.sku = text(input.sku, "sku", errors) ?? "";
  if (input.barcode !== undefined) variant.barcode = text(input.barcode, "barcode", errors) ?? "";
  if (input.continueSelling !== undefined) {
    variant.inventoryPolicy = input.continueSelling === true ? "CONTINUE" : "DENY";
  }
  if (Object.keys(variant).length) value.variant = variant;

  // Organization: taxonomy category, collections, sales channels.
  if (input.category !== undefined) {
    if (isBlank(input.category)) {
      if (!isCreate) value.category = null; // clears the category
    } else if (typeof input.category !== "string" || !CATEGORY_ID_RE.test(input.category)) {
      errors.category = "Choose a category from the list";
    } else {
      value.category = input.category;
    }
  }
  if (input.collections !== undefined) {
    const ids = idList(input.collections, COLLECTION_ID_RE, "collections", errors, MAX_COLLECTIONS);
    if (ids) value.collections = ids;
  }
  if (input.publications !== undefined) {
    const ids = idList(input.publications, PUBLICATION_ID_RE, "publications", errors, MAX_PUBLICATIONS);
    if (ids) value.publications = ids;
  }

  // Stock (needs write_inventory; checked against the store in the service).
  if (input.inventory !== undefined) {
    const levels = inventoryList(input.inventory, errors);
    if (levels) value.inventory = levels;
  }
  if (input.trackInventory !== undefined) {
    if (typeof input.trackInventory !== "boolean") errors.trackInventory = "Must be yes or no";
    else value.trackInventory = input.trackInventory;
  }

  const shipping = shippingFields(input, errors);
  if (Object.keys(shipping).length) value.shipping = shipping;

  if (input.storeId !== undefined) value.storeId = String(input.storeId);

  const notSent = [
    ...new Set(
      Object.entries(NOT_SENT_FIELDS)
        .filter(([key]) => {
          const v = input[key];
          return v !== undefined && v !== null && v !== "" && v !== false && !(Array.isArray(v) && !v.length);
        })
        .map(([, label]) => label),
    ),
  ];

  return { value, errors, notSent };
}
