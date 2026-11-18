import crypto from "node:crypto";
import { LWA_TOKEN_URL } from "@/lib/amazon/config";

// Login with Amazon (LWA): refresh token → SP-API access token.
// Request format as in Amazon's official SP-API SDK (LwaAuthClient):
//   POST https://api.amazon.com/auth/o2/token
//   application/x-www-form-urlencoded:
//   grant_type=refresh_token&refresh_token&client_id&client_secret
// Access tokens last `expires_in` seconds (one hour); they are cached per
// app + refresh token and renewed five minutes early. Concurrent callers share
// one request. Tokens, secrets, codes and response bodies never appear in
// errors or logs. An "invalid_grant" error means the seller's authorization
// is no longer valid (revoked or expired): see lib/amazon/accounts.js.

export const EARLY_RENEWAL_MS = 5 * 60_000;
const DEFAULT_TTL_S = 3600;

export class AmazonAuthError extends Error {
  // code: "token_request_failed" | "token_rejected" | "token_missing"
  // oauthError: LWA's error code (e.g. "invalid_grant"), plain codes only.
  constructor(code, { status = null, oauthError = null } = {}) {
    super(`Amazon LWA ${code}`);
    this.name = "AmazonAuthError";
    this.code = code;
    this.status = status;
    this.oauthError = oauthError;
  }
}

const cache = new Map(); // key -> { token, expiresAt }
const inFlight = new Map(); // key -> Promise<token>

// The refresh token itself is not used as a map key.
const cacheKey = ({ environment, clientId, refreshToken }) =>
  `${environment}:${clientId}:${crypto.createHash("sha256").update(refreshToken).digest("hex").slice(0, 32)}`;

export function clearLwaCache() {
  cache.clear();
  inFlight.clear();
}

async function postToken(params, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AmazonAuthError("token_request_failed");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const oauthError = typeof data?.error === "string" && /^[a-z_]{1,64}$/.test(data.error) ? data.error : null;
    throw new AmazonAuthError("token_rejected", { status: response.status, oauthError });
  }
  if (typeof data?.access_token !== "string" || !data.access_token) {
    throw new AmazonAuthError("token_missing", { status: response.status });
  }
  const ttl = Number(data.expires_in);
  return { data, token: data.access_token, ttlMs: (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_S) * 1000 };
}

const requestToken = ({ clientId, clientSecret, refreshToken }, fetchImpl) =>
  postToken({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }, fetchImpl);

// OAuth website workflow, step 12: spapi_oauth_code → refresh token (and a
// first access token). The code is valid for five minutes and single use.
// redirectUri must be exactly the registered redirect URI.
export async function exchangeAuthorizationCode({ clientId, clientSecret, redirectUri, code }, { fetchImpl = fetch } = {}) {
  if (!clientId || !clientSecret || !redirectUri || typeof code !== "string" || !code) {
    throw new AmazonAuthError("token_request_failed");
  }
  const { data } = await postToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }, fetchImpl);
  if (typeof data.refresh_token !== "string" || !data.refresh_token) throw new AmazonAuthError("token_missing");
  return { refreshToken: data.refresh_token };
}

// credentials: { environment, clientId, clientSecret, refreshToken }
export async function getAccessToken(credentials, { forceRefresh = false, now = Date.now, fetchImpl = fetch } = {}) {
  if (!credentials?.clientId || !credentials?.clientSecret || !credentials?.refreshToken) {
    throw new AmazonAuthError("token_request_failed");
  }
  const key = cacheKey(credentials);
  const cached = cache.get(key);
  if (!forceRefresh && cached && cached.expiresAt - EARLY_RENEWAL_MS > now()) return cached.token;

  // Concurrent callers (including several forced refreshes after a 401) share
  // one token request.
  if (inFlight.has(key)) return inFlight.get(key);
  const pending = requestToken(credentials, fetchImpl)
    .then(({ token, ttlMs }) => {
      cache.set(key, { token, expiresAt: now() + ttlMs });
      return token;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

// Drops a token SP-API rejected (401), so the next call fetches a new one.
export function invalidateAccessToken(credentials) {
  if (credentials?.refreshToken) cache.delete(cacheKey(credentials));
}
