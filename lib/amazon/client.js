import { AMAZON_USER_AGENT, allowedHost } from "@/lib/amazon/config";
import { getAccessToken, invalidateAccessToken } from "@/lib/amazon/lwa";
import { logError, logWarn } from "@/lib/observability/log";

// Minimal SP-API client.
//   - x-amz-access-token from LWA (no AWS signature: SP-API does not need it)
//   - User-Agent: SmartSell/1.0
//   - 401: drops the cached token, gets a new one and retries once
//   - 429 and temporary 5xx (500/502/503/504): bounded retries with
//     exponential backoff and jitter (Retry-After / x-amzn-RateLimit-Limit
//     when present)
//   - Environment isolation: a sandbox client only calls the sandbox host, a
//     production client only the production host
// Logs carry the operation name, status, Amazon's error code and request
// ID; never tokens, secrets, request bodies or response bodies.

export class AmazonApiError extends Error {
  constructor({ operation, status = null, code = "amazon_request_failed", requestId = null, issues = null }) {
    super(`Amazon ${operation} failed: ${code}${status ? ` (${status})` : ""}`);
    this.name = "AmazonApiError";
    this.operation = operation;
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.issues = issues;
  }
}

const MAX_DELAY_MS = 10_000;
const TEMPORARY = new Set([500, 502, 503, 504]);
const safeCode = (value) => (typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : null);
// Replaceable in tests so retry waits do not slow the suite.
export const clientDefaults = { sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

// random() in [0, 1): jitter scales the exponential delay to 50–100%.
export function backoffDelay(attempt, headers, baseDelayMs, random = Math.random) {
  const retryAfter = Number(headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, MAX_DELAY_MS);
  let delay = baseDelayMs * 2 ** attempt;
  const rate = Number(headers.get("x-amzn-ratelimit-limit"));
  if (Number.isFinite(rate) && rate > 0) delay = Math.max(delay, Math.ceil(1000 / rate));
  delay = Math.min(delay, MAX_DELAY_MS);
  return Math.round(delay * (0.5 + 0.5 * random()));
}

// credentials: { environment, apiBase, clientId, clientSecret, refreshToken }
export function createAmazonClient(
  credentials,
  { fetchImpl = fetch, sleep = clientDefaults.sleep, maxRetries = 3, baseDelayMs = 500, random = Math.random, onRateLimit } = {},
) {
  const base = new URL(credentials.apiBase);
  const expectedHost = allowedHost(credentials.environment);
  if (base.protocol !== "https:" || !expectedHost || base.host !== expectedHost) {
    throw new AmazonApiError({ operation: "client", code: "environment_mismatch" });
  }

  async function send(operation, method, path, { query, body } = {}) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined || v === null || (Array.isArray(v) && !v.length)) continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    if (url.host !== expectedHost) throw new AmazonApiError({ operation, code: "environment_mismatch" });

    let refreshed = false;
    let retries = 0;
    for (;;) {
      const token = await getAccessToken(credentials, { forceRefresh: refreshed, fetchImpl });
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            "x-amz-access-token": token,
            "User-Agent": AMAZON_USER_AGENT,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20000),
        });
      } catch (error) {
        logError(null, "amazon_request_failed", error, { message: false, operation, environment: credentials.environment });
        throw new AmazonApiError({ operation, code: "network_error" });
      }
      const rateLimit = Number(response.headers.get("x-amzn-ratelimit-limit"));
      if (onRateLimit && Number.isFinite(rateLimit) && rateLimit > 0) onRateLimit(operation, rateLimit);

      if (response.status === 401 && !refreshed) {
        invalidateAccessToken(credentials);
        refreshed = true;
        continue;
      }
      if ((response.status === 429 || TEMPORARY.has(response.status)) && retries < maxRetries) {
        const delay = backoffDelay(retries, response.headers, baseDelayMs, random);
        retries += 1;
        logWarn(null, response.status === 429 ? "amazon_throttled" : "amazon_temporary_error", null, {
          operation,
          status: response.status,
          attempt: retries,
          delayMs: delay,
          environment: credentials.environment,
        });
        await sleep(delay);
        continue;
      }

      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const error = new AmazonApiError({
          operation,
          status: response.status,
          code: safeCode(data?.errors?.[0]?.code) || (response.status === 429 ? "throttled" : TEMPORARY.has(response.status) ? "amazon_unavailable" : "amazon_rejected"),
          requestId: safeCode(response.headers.get("x-amzn-requestid")),
        });
        logError(null, "amazon_api_error", null, { operation, status: error.status, code: error.code, requestId: error.requestId, environment: credentials.environment });
        throw error;
      }
      return data;
    }
  }

  return {
    environment: credentials.environment,
    get: (operation, path, query) => send(operation, "GET", path, { query }),
    put: (operation, path, query, body) => send(operation, "PUT", path, { query, body }),
    patch: (operation, path, query, body) => send(operation, "PATCH", path, { query, body }),
    delete: (operation, path, query) => send(operation, "DELETE", path, { query }),
  };
}
