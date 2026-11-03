// Shopify releases a stable Admin API version every quarter (YYYY-01/04/07/10)
// and supports each for about a year. Keep this in sync with the app's
// configured version in the Shopify Dev Dashboard.
const DEFAULT_API_VERSION = "2026-07";
const API_VERSION_RE = /^\d{4}-(01|04|07|10)$/;

export function getShopifyApiVersion() {
  const version = (process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION).trim();
  if (!API_VERSION_RE.test(version)) {
    throw new Error(
      `SHOPIFY_API_VERSION must look like 2026-07 (got "${version}")`,
    );
  }
  return version;
}
