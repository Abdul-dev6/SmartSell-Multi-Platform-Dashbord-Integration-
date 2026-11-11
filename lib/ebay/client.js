import EbayAccount from "@/models/EbayAccount";
import { getEbayConfig, marketplaceInfo } from "@/lib/ebay/config";
import { decryptSecret, encryptSecret } from "@/lib/ebay/crypto";
import { EbayOAuthError, refreshUserAccessToken } from "@/lib/ebay/oauth";

// Authenticated calls to eBay's REST Sell APIs for one seller account.
// The user access token is refreshed automatically; tokens and response
// bodies are never logged.

const TOKEN_SKEW_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 20000;
const MAX_READ_RETRIES = 2;

export class EbayApiError extends Error {
  // outcome: "rejected" = eBay refused the request (safe to resubmit after a
  // fix); "unknown" = it may have been applied (timeout, 5xx).
  constructor({ code, status = null, message, errors = [], outcome = "rejected" }) {
    super(message || `eBay request failed: ${code}`);
    this.name = "EbayApiError";
    this.code = code;
    this.status = status;
    this.errors = errors;
    this.outcome = outcome;
  }
}

export function requireEbayConfig() {
  const config = getEbayConfig();
  if (!config) {
    throw new EbayApiError({ code: "ebay_not_configured", message: "eBay is not configured on this server." });
  }
  return config;
}

// eBay error bodies: { errors: [{ errorId, domain, category, message, longMessage, parameters }] }.
// Only IDs and messages are kept: they describe the problem without echoing data.
function parseErrors(body) {
  return (Array.isArray(body?.errors) ? body.errors : Array.isArray(body?.warnings) ? body.warnings : [])
    .slice(0, 10)
    .map((e) => ({
      errorId: e.errorId ?? null,
      message: String(e.longMessage || e.message || "eBay rejected the request").slice(0, 500),
      parameters: Array.isArray(e.parameters) ? e.parameters.slice(0, 5).map((p) => ({ name: p.name, value: String(p.value ?? "").slice(0, 200) })) : [],
    }));
}

async function markReauthRequired(accountId) {
  await EbayAccount.updateOne(
    { _id: accountId },
    {
      $set: { status: "reauth_required", lastError: "eBay authorization expired or was revoked. Connect eBay again." },
      $unset: { accessTokenEnc: 1, accessTokenExpiresAt: 1 },
    },
  );
}

// Returns a valid user access token, refreshing it when it is about to expire.
export async function getUserAccessToken(account, { forceRefresh = false, now = Date.now() } = {}) {
  const config = requireEbayConfig();
  let doc = account;
  if (doc.refreshTokenEnc === undefined) {
    doc = await EbayAccount.findById(account._id).select("+refreshTokenEnc +accessTokenEnc");
  }
  if (!doc || doc.status !== "active" || !doc.refreshTokenEnc) {
    throw new EbayApiError({ code: "reauth_required", status: 401, message: "Connect your eBay account again." });
  }

  if (!forceRefresh && doc.accessTokenEnc && doc.accessTokenExpiresAt && doc.accessTokenExpiresAt.getTime() - TOKEN_SKEW_MS > now) {
    try {
      return decryptSecret(doc.accessTokenEnc);
    } catch {
      // Fall through to a refresh (e.g. key rotated).
    }
  }

  let refreshToken;
  try {
    refreshToken = decryptSecret(doc.refreshTokenEnc);
  } catch {
    await markReauthRequired(doc._id);
    throw new EbayApiError({ code: "reauth_required", status: 401, message: "Connect your eBay account again." });
  }

  let fresh;
  try {
    fresh = await refreshUserAccessToken(refreshToken, doc.scopes?.length ? doc.scopes : config.scopes, config);
  } catch (error) {
    if (error instanceof EbayOAuthError && error.code === "invalid_grant") {
      await markReauthRequired(doc._id);
      throw new EbayApiError({ code: "reauth_required", status: 401, message: "Connect your eBay account again." });
    }
    throw new EbayApiError({ code: "token_refresh_failed", message: "Could not reach eBay. Please try again.", outcome: "rejected" });
  }

  await EbayAccount.updateOne(
    { _id: doc._id, status: "active" },
    { $set: { accessTokenEnc: encryptSecret(fresh.accessToken), accessTokenExpiresAt: fresh.accessTokenExpiresAt } },
  );
  doc.accessTokenEnc = encryptSecret(fresh.accessToken);
  doc.accessTokenExpiresAt = fresh.accessTokenExpiresAt;
  return fresh.accessToken;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Creates a client bound to one account. `request` returns the parsed JSON
// body (or null for 204) and throws EbayApiError on failure.
export function createEbayClient(account, { retryDelayMs = 500 } = {}) {
  const config = requireEbayConfig();
  const market = marketplaceInfo(account.marketplaceId);

  async function request(method, path, { query, body, headers = {}, base = "api" } = {}) {
    const url = new URL(`${base === "apiz" ? config.apizBase : config.apiBase}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const isRead = method === "GET";

    let refreshed = false;
    let forceRefresh = false;
    for (let attempt = 0; ; attempt += 1) {
      const token = await getUserAccessToken(account, { forceRefresh });
      forceRefresh = false;
      let response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Accept-Language": market.contentLanguage,
            "Content-Language": market.contentLanguage,
            "X-EBAY-C-MARKETPLACE-ID": account.marketplaceId,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        if (isRead && attempt < MAX_READ_RETRIES) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw new EbayApiError({
          code: "network_error",
          message: "eBay did not respond in time. Please try again.",
          outcome: isRead ? "rejected" : "unknown",
        });
      }

      // An access token can be revoked before it expires: refresh once.
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        forceRefresh = true;
        continue;
      }

      if (response.ok) {
        if (response.status === 204) return null;
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      }

      const parsed = await response.json().catch(() => null);
      const errors = parseErrors(parsed);
      const retriable = response.status === 429 || response.status >= 500;
      if (retriable && isRead && attempt < MAX_READ_RETRIES) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      if (response.status === 401) {
        throw new EbayApiError({ code: "unauthorized", status: 401, message: "eBay refused SmartSell's authorization. Connect eBay again.", errors });
      }
      throw new EbayApiError({
        code: response.status === 404 ? "not_found" : response.status === 429 ? "rate_limited" : retriable ? "ebay_unavailable" : "ebay_rejected",
        status: response.status,
        message: errors[0]?.message || (retriable ? "eBay is temporarily unavailable. Please try again." : "eBay rejected the request."),
        errors,
        outcome: retriable && !isRead ? "unknown" : "rejected",
      });
    }
  }

  return {
    account,
    marketplace: { id: account.marketplaceId, ...market },
    request,
    get: (path, options) => request("GET", path, options),
    post: (path, body, options = {}) => request("POST", path, { ...options, body }),
    put: (path, body, options = {}) => request("PUT", path, { ...options, body }),
    delete: (path, options) => request("DELETE", path, options),
  };
}
