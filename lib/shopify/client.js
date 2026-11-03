import axios from "axios";
import { getShopifyApiVersion } from "@/lib/shopify/config";
import { logWarn } from "@/lib/observability/log";

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Shopify silently serves the oldest supported version when the requested
// one is retired; warn once per requested/served pair so it gets noticed.
const warnedVersions = new Set();
function checkServedVersion(requested, response) {
  const served = response?.headers?.["x-shopify-api-version"];
  const key = `${requested}->${served}`;
  if (served && served !== requested && !warnedVersions.has(key)) {
    warnedVersions.add(key);
    logWarn(null, "shopify_api_version_mismatch", null, {
      requested,
      served,
      hint: `${requested} is probably retired; update SHOPIFY_API_VERSION.`,
    });
  }
}

// Retry-After from Shopify is in seconds (may be fractional).
function retryAfterMs(response) {
  const header = Number(response?.headers?.["retry-after"]);
  return Number.isFinite(header) && header > 0 ? header * 1000 : null;
}

export function backoffDelay(attempt, response) {
  const fromHeader = retryAfterMs(response);
  if (fromHeader !== null) {
    return Math.min(fromHeader, MAX_DELAY_MS);
  }
  const exponential = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  // Full jitter: spread out retries from concurrent requests.
  return Math.round(exponential / 2 + Math.random() * (exponential / 2));
}

// Only requests that are safe to repeat are retried: GETs, or calls that
// explicitly set `shopifyRetry: true` (e.g. GraphQL queries). A failed POST
// may already have been applied by Shopify, so it is never retried blindly.
function shouldRetry(error) {
  const config = error.config;
  if (!config) {
    return false;
  }

  const method = (config.method || "get").toLowerCase();
  const idempotent = config.shopifyRetry ?? method === "get";
  if (!idempotent || (config.__retryCount || 0) >= MAX_RETRIES) {
    return false;
  }

  if (error.response) {
    return RETRYABLE_STATUS.has(error.response.status);
  }
  // Network error or timeout: no response received.
  return true;
}

export function createClient(storeName, accessToken) {
  const normalizedStoreName = storeName
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.myshopify\.com$/, "");

  const apiVersion = getShopifyApiVersion();
  const origin = `https://${normalizedStoreName}.myshopify.com`;
  const client = axios.create({
    baseURL: `${origin}/admin/api/${apiVersion}`,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  // Absolute URLs (pagination links) must point at this store; the access
  // token header is attached to every request this client makes.
  client.interceptors.request.use((config) => {
    if (/^https?:\/\//i.test(config.url || "") && !config.url.startsWith(`${origin}/`)) {
      throw new Error("Refusing to send the Shopify access token to another host");
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      checkServedVersion(apiVersion, response);
      return response;
    },
    undefined,
  );

  client.interceptors.response.use(undefined, async (error) => {
    if (!shouldRetry(error)) {
      throw error;
    }
    const config = error.config;
    const attempt = config.__retryCount || 0;
    config.__retryCount = attempt + 1;
    await sleep(backoffDelay(attempt, error.response));
    return client.request(config);
  });

  return client;
}
