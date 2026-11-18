import { AmazonServiceError } from "@/lib/amazon/errors";

// Product Type Definitions API 2020-09-01: searchDefinitionsProductTypes and
// getDefinitionsProductType. The definition links to the product type's JSON
// Schema (hosted by Amazon); its top-level `required` list is what a listing
// must include for requirements=LISTING. Schemas are cached for an hour.

const SCHEMA_TTL_MS = 60 * 60 * 1000;
const MAX_SCHEMA_BYTES = 8 * 1024 * 1024;
const schemaCache = new Map(); // `${productType}:${marketplaceId}:${checksum}` -> { schema, expiresAt }

export function clearProductTypeCache() {
  schemaCache.clear();
}

// Only Amazon-hosted schema documents (S3 or amazon.com), over HTTPS.
export function isAllowedSchemaUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (u.hostname.endsWith(".amazonaws.com") || u.hostname === "amazon.com" || u.hostname.endsWith(".amazon.com"));
  } catch {
    return false;
  }
}

export async function searchProductTypes(client, { keywords, marketplaceId }) {
  const data = await client.get("searchDefinitionsProductTypes", "/definitions/2020-09-01/productTypes", {
    marketplaceIds: [marketplaceId],
    keywords: keywords ? [keywords] : undefined,
  });
  return (Array.isArray(data?.productTypes) ? data.productTypes : []).slice(0, 50).map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
  }));
}

async function loadSchema(link, { fetchImpl }) {
  if (link?.verb && link.verb !== "GET") throw new AmazonServiceError(502, "schema_unavailable", "Amazon returned an unsupported product type schema link.");
  if (!isAllowedSchemaUrl(link?.resource)) throw new AmazonServiceError(502, "schema_unavailable", "Amazon returned an unexpected product type schema location.");
  let response;
  try {
    response = await fetchImpl(link.resource, { signal: AbortSignal.timeout(20000) });
  } catch {
    throw new AmazonServiceError(502, "schema_unavailable", "The Amazon product type schema could not be downloaded.");
  }
  const length = Number(response.headers.get("content-length"));
  if (!response.ok || (Number.isFinite(length) && length > MAX_SCHEMA_BYTES)) {
    throw new AmazonServiceError(502, "schema_unavailable", "The Amazon product type schema could not be downloaded.");
  }
  const text = await response.text();
  if (text.length > MAX_SCHEMA_BYTES) throw new AmazonServiceError(502, "schema_unavailable", "The Amazon product type schema is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AmazonServiceError(502, "schema_unavailable", "The Amazon product type schema is not valid JSON.");
  }
}

// Requirements of a product type for listing in a marketplace:
// { productType, version, requiredAttributes, propertyGroups, attributes }.
export async function getProductTypeRequirements(client, { productType, marketplaceId, sellerId }, { fetchImpl = fetch, now = Date.now() } = {}) {
  const def = await client.get("getDefinitionsProductType", `/definitions/2020-09-01/productTypes/${encodeURIComponent(productType)}`, {
    marketplaceIds: [marketplaceId],
    sellerId,
    requirements: "LISTING",
    requirementsEnforced: "ENFORCED",
    locale: "en_US",
  });
  const key = `${productType}:${marketplaceId}:${def?.schema?.checksum || ""}`;
  let cached = schemaCache.get(key);
  if (!cached || cached.expiresAt <= now) {
    cached = { schema: await loadSchema(def?.schema?.link, { fetchImpl }), expiresAt: now + SCHEMA_TTL_MS };
    schemaCache.set(key, cached);
  }
  const properties = cached.schema?.properties || {};
  return {
    productType: def?.productType || productType,
    version: def?.productTypeVersion?.version || null,
    requiredAttributes: (Array.isArray(cached.schema?.required) ? cached.schema.required : []).filter((r) => typeof r === "string"),
    propertyGroups: Object.entries(def?.propertyGroups || {}).map(([id, g]) => ({ id, title: g?.title || id, propertyNames: g?.propertyNames || [] })),
    attributes: Object.entries(properties)
      .slice(0, 500)
      .map(([name, p]) => ({ name, title: typeof p?.title === "string" ? p.title : name, description: typeof p?.description === "string" ? p.description.slice(0, 300) : null })),
  };
}

// Attributes the schema requires that the listing does not include.
export function missingRequiredAttributes(requirements, attributes) {
  return requirements.requiredAttributes.filter((name) => !Array.isArray(attributes[name]) || !attributes[name].length);
}
