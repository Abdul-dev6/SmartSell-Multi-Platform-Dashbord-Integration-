// Amazon Selling Partner API (SP-API) configuration.
//
// AMAZON_ENVIRONMENT: "sandbox" (default) or "production". The two never mix:
// each has its own LWA credentials (AMAZON_SANDBOX_* / AMAZON_PRODUCTION_*)
// and its own SP-API host, and the client refuses a host that does not match
// the credentials' environment.
//
// Regions: North America only for now. REGIONS is keyed by region so EU and
// Far East can be added later (endpoints and Seller Central URLs differ).
//
// Production seller connection (OAuth website workflow):
//   AMAZON_APP_ID           application ID (amzn1.sellerapps.app.…), not the
//                           LWA client ID
//   AMAZON_REDIRECT_URI     exactly the OAuth Redirect URI registered in the
//                           Developer Console (…/api/amazon/callback)
//   AMAZON_AUTH_BETA        "true" adds version=beta (app in Draft state)
//   AMAZON_CONNECT_ENABLED  "true" to allow new production connections and
//                           production writes; false by default
//   AMAZON_REGION           NA

export const AMAZON_USER_AGENT = "SmartSell/1.0";
export const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
export const DEFAULT_MARKETPLACE_IDS = ["ATVPDKIKX0DER"]; // Amazon.com (US)

export const REGIONS = {
  NA: {
    code: "na",
    sellerCentral: "https://sellercentral.amazon.com",
    endpoints: {
      sandbox: "https://sandbox.sellingpartnerapi-na.amazon.com",
      production: "https://sellingpartnerapi-na.amazon.com",
    },
    // Marketplaces served by the NA endpoint.
    marketplaces: {
      ATVPDKIKX0DER: { country: "US", currency: "USD" },
      A2EUQ1WTGCTBG2: { country: "CA", currency: "CAD" },
      A1AM78C64UM0Y8: { country: "MX", currency: "MXN" },
      A2Q3Y263D00KWC: { country: "BR", currency: "BRL" },
    },
  },
  // EU: { code: "eu", sellerCentral: "https://sellercentral-europe.amazon.com", endpoints: { … } },
  // FE: { code: "fe", sellerCentral: "https://sellercentral.amazon.co.jp", endpoints: { … } },
};

const ENVIRONMENTS = {
  sandbox: { label: "Sandbox", prefix: "AMAZON_SANDBOX_" },
  production: { label: "Production", prefix: "AMAZON_PRODUCTION_" },
};

export const SANDBOX_HOST = new URL(REGIONS.NA.endpoints.sandbox).host;
export const PRODUCTION_HOST = new URL(REGIONS.NA.endpoints.production).host;

export class AmazonConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "AmazonConfigError";
  }
}

export function getAmazonEnvironment() {
  const value = (process.env.AMAZON_ENVIRONMENT || "sandbox").trim().toLowerCase();
  if (!ENVIRONMENTS[value]) {
    throw new AmazonConfigError(`AMAZON_ENVIRONMENT must be "sandbox" or "production" (got "${value}").`);
  }
  return value;
}

export function getAmazonRegion() {
  const value = (process.env.AMAZON_REGION || "NA").trim().toUpperCase();
  if (!REGIONS[value]) throw new AmazonConfigError(`AMAZON_REGION must be one of ${Object.keys(REGIONS).join(", ")} (got "${value}").`);
  return value;
}

export function amazonEndpoints(environment = getAmazonEnvironment(), region = getAmazonRegion()) {
  const env = ENVIRONMENTS[environment];
  const r = REGIONS[region];
  if (!env || !r) throw new AmazonConfigError(`Unknown Amazon environment "${environment}" or region "${region}"`);
  return { environment, label: env.label, region: r.code, apiBase: r.endpoints[environment] };
}

// The SP-API host an environment may call (used by the client).
export function allowedHost(environment, region = "NA") {
  const base = REGIONS[region]?.endpoints?.[environment];
  return base ? new URL(base).host : null;
}

export function isRegionMarketplace(marketplaceId, region = getAmazonRegion()) {
  return Boolean(REGIONS[region]?.marketplaces?.[marketplaceId]);
}

export function marketplaceCurrency(marketplaceId, region = getAmazonRegion()) {
  return REGIONS[region]?.marketplaces?.[marketplaceId]?.currency || null;
}

export function parseMarketplaceIds(value) {
  const ids = (value || "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9]{10,16}$/.test(s));
  return ids.length ? [...new Set(ids)] : DEFAULT_MARKETPLACE_IDS;
}

// LWA app credentials for an environment, or null when one is missing. For
// sandbox the refresh token is the developer's self-authorization; production
// refresh tokens belong to sellers and live encrypted on their AmazonAccount.
export function getAmazonConfig(environment = getAmazonEnvironment()) {
  const env = ENVIRONMENTS[environment];
  if (!env) throw new AmazonConfigError(`Unknown Amazon environment "${environment}"`);
  const read = (name) => process.env[`${env.prefix}${name}`]?.trim() || null;
  const clientId = read("CLIENT_ID");
  const clientSecret = read("CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return {
    ...amazonEndpoints(environment),
    clientId,
    clientSecret,
    refreshToken: environment === "sandbox" ? read("REFRESH_TOKEN") : null,
    sellingPartnerId: environment === "sandbox" ? read("SELLING_PARTNER_ID") : null,
    marketplaceIds: parseMarketplaceIds(process.env.AMAZON_MARKETPLACE_IDS),
  };
}

// OAuth website-workflow settings (production only), or null if incomplete.
export function getAmazonOAuthConfig() {
  if (getAmazonEnvironment() !== "production") return null;
  const app = getAmazonConfig("production");
  const appId = process.env.AMAZON_APP_ID?.trim();
  const redirectUri = process.env.AMAZON_REDIRECT_URI?.trim();
  if (!app || !appId || !redirectUri) return null;
  let redirect;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return null;
  }
  if (redirect.protocol !== "https:" || redirect.search || redirect.hash) return null;
  const region = REGIONS[getAmazonRegion()];
  return {
    ...app,
    appId,
    redirectUri,
    beta: (process.env.AMAZON_AUTH_BETA || "").trim().toLowerCase() === "true",
    sellerCentral: region.sellerCentral,
  };
}

// New production connections and production writes are allowed only when the
// flag is on AND the OAuth settings are complete.
export function isAmazonConnectEnabled() {
  try {
    return (process.env.AMAZON_CONNECT_ENABLED || "").trim().toLowerCase() === "true" && Boolean(getAmazonOAuthConfig());
  } catch {
    return false;
  }
}

// Names only, for logs and the status endpoint.
export function missingAmazonSettings(environment) {
  let env;
  try {
    env = environment || getAmazonEnvironment();
  } catch {
    return ["AMAZON_ENVIRONMENT"];
  }
  const { prefix } = ENVIRONMENTS[env];
  const names = env === "sandbox" ? ["CLIENT_ID", "CLIENT_SECRET", "REFRESH_TOKEN"] : ["CLIENT_ID", "CLIENT_SECRET"];
  const missing = names.map((n) => `${prefix}${n}`).filter((n) => !process.env[n]?.trim());
  if (env === "production") for (const n of ["AMAZON_APP_ID", "AMAZON_REDIRECT_URI"]) if (!process.env[n]?.trim()) missing.push(n);
  return missing;
}
