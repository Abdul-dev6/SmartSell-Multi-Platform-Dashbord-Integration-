// Server-side validation for SmartSell product writes. Only the fields listed
// here are ever sent to Shopify; everything else in a request is ignored.

const STATUSES = { active: "ACTIVE", draft: "DRAFT", archived: "ARCHIVED" };
const PRICE_RE = /^\d{1,9}(\.\d{1,2})?$/;
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

// Form fields SmartSell accepts but does not send to Shopify yet.
// Inventory quantity is read-only by design; the rest need inventory-item or
// media APIs that are not implemented.
const NOT_SENT_FIELDS = {
  quantity: "inventory quantity (read-only in SmartSell)",
  cost: "cost per item",
  trackInventory: "inventory tracking",
  weight: "weight",
  length: "dimensions",
  width: "dimensions",
  height: "dimensions",
  hsCode: "HS code",
  images: "images",
  collection: "collection",
  category: "category",
};

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
    if (!status) errors.status = "Must be active, draft or archived";
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
