// eBay environment, credentials and endpoints.
//
// EBAY_ENVIRONMENT selects "sandbox" (default) or "production". Credentials
// are read from EBAY_SANDBOX_* or EBAY_PRODUCTION_* so both keysets can live
// side by side and switching is a single variable.

const ENVIRONMENTS = {
  sandbox: {
    authorizeUrl: "https://auth.sandbox.ebay.com/oauth2/authorize",
    apiBase: "https://api.sandbox.ebay.com",
    // The Identity API is served from the "apiz" host.
    apizBase: "https://apiz.sandbox.ebay.com",
    prefix: "EBAY_SANDBOX_",
  },
  production: {
    authorizeUrl: "https://auth.ebay.com/oauth2/authorize",
    apiBase: "https://api.ebay.com",
    apizBase: "https://apiz.ebay.com",
    prefix: "EBAY_PRODUCTION_",
  },
};

// Scope URIs use api.ebay.com in both environments.
const SCOPE_BASE = "https://api.ebay.com/oauth/api_scope";
export const DEFAULT_SCOPES = [
  SCOPE_BASE,
  `${SCOPE_BASE}/sell.inventory`,
  `${SCOPE_BASE}/sell.account`,
  `${SCOPE_BASE}/sell.fulfillment`,
  `${SCOPE_BASE}/commerce.identity.readonly`,
];

// Marketplaces SmartSell supports: currency and the Content-Language eBay
// expects for listing content on that site.
export const MARKETPLACES = {
  EBAY_US: { currency: "USD", contentLanguage: "en-US", country: "US" },
  EBAY_GB: { currency: "GBP", contentLanguage: "en-GB", country: "GB" },
  EBAY_DE: { currency: "EUR", contentLanguage: "de-DE", country: "DE" },
  EBAY_AU: { currency: "AUD", contentLanguage: "en-AU", country: "AU" },
  EBAY_CA: { currency: "CAD", contentLanguage: "en-CA", country: "CA" },
};

export function getEbayEnvironment() {
  const value = (process.env.EBAY_ENVIRONMENT || "sandbox").trim().toLowerCase();
  if (!ENVIRONMENTS[value]) {
    throw new Error(`EBAY_ENVIRONMENT must be "sandbox" or "production" (got "${value}")`);
  }
  return value;
}

export function getMarketplaceId() {
  const id = (process.env.EBAY_MARKETPLACE_ID || "EBAY_US").trim().toUpperCase();
  if (!MARKETPLACES[id]) {
    throw new Error(`EBAY_MARKETPLACE_ID must be one of ${Object.keys(MARKETPLACES).join(", ")} (got "${id}")`);
  }
  return id;
}

export function marketplaceInfo(marketplaceId) {
  return MARKETPLACES[marketplaceId] || MARKETPLACES.EBAY_US;
}

function parseScopes(value) {
  const scopes = (value || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.length ? [...new Set(scopes)] : DEFAULT_SCOPES;
}

// Endpoints for an environment, available even without credentials.
export function ebayEndpoints(environment = getEbayEnvironment()) {
  const env = ENVIRONMENTS[environment];
  if (!env) throw new Error(`Unknown eBay environment "${environment}"`);
  return { authorizeUrl: env.authorizeUrl, apiBase: env.apiBase, apizBase: env.apizBase };
}

// Full configuration, or null when a required credential is missing.
export function getEbayConfig() {
  const environment = getEbayEnvironment();
  const env = ENVIRONMENTS[environment];
  const clientId = process.env[`${env.prefix}CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${env.prefix}CLIENT_SECRET`]?.trim();
  const ruName = process.env[`${env.prefix}RU_NAME`]?.trim();

  if (!clientId || !clientSecret || !ruName) {
    return null;
  }

  return {
    environment,
    clientId,
    clientSecret,
    ruName,
    scopes: parseScopes(process.env.EBAY_SCOPES),
    marketplaceId: getMarketplaceId(),
    ...ebayEndpoints(environment),
  };
}
