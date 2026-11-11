import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/jwt";

// eBay OAuth (authorization code grant) for seller accounts, plus the
// application token (client credentials grant) used for public APIs such as
// Taxonomy. Tokens, codes and response bodies are never logged.

export const EBAY_OAUTH_STATE_COOKIE = "ebay_oauth_state";
const STATE_AUDIENCE = "ebay-oauth-state";
const STATE_MAX_AGE = 60 * 10; // 10 minutes
export const EBAY_CALLBACK_PATH = "/api/ebay/callback";

export class EbayOAuthError extends Error {
  constructor(code, status) {
    super(`eBay OAuth failed: ${code}`);
    this.name = "EbayOAuthError";
    this.code = code;
    this.status = status;
  }
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// The state nonce goes to eBay; a signed copy bound to the SmartSell user
// lives in an httpOnly cookie scoped to the callback path.
export function createEbayOAuthState({ userId, environment }) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const cookieValue = jwt.sign({ nonce, uid: String(userId), env: environment }, getJwtSecret(), {
    algorithm: "HS256",
    audience: STATE_AUDIENCE,
    expiresIn: STATE_MAX_AGE,
  });
  return { nonce, cookieValue };
}

export function readEbayOAuthState(cookieValue) {
  if (!cookieValue) return null;
  try {
    return jwt.verify(cookieValue, getJwtSecret(), {
      algorithms: ["HS256"],
      audience: STATE_AUDIENCE,
    });
  } catch {
    return null;
  }
}

function stateCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: EBAY_CALLBACK_PATH,
    maxAge,
  };
}

export function setEbayOAuthStateCookie(response, cookieValue) {
  response.cookies.set(EBAY_OAUTH_STATE_COOKIE, cookieValue, stateCookieOptions(STATE_MAX_AGE));
  return response;
}

export function clearEbayOAuthStateCookie(response) {
  response.cookies.set(EBAY_OAUTH_STATE_COOKIE, "", stateCookieOptions(0));
  return response;
}

// eBay's consent page. redirect_uri is the RuName, not a URL; the RuName's
// "auth accepted URL" in the developer portal points at /api/ebay/callback.
export function buildAuthorizeUrl(config, state) {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  // Always show the sign-in page so a seller can pick the right account.
  url.searchParams.set("prompt", "login");
  return url.toString();
}

function basicAuth(config) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

async function tokenRequest(config, params) {
  let response;
  try {
    response = await fetch(`${config.apiBase}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(config),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EbayOAuthError("token_request_failed");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // invalid_grant = code/refresh token expired, used or revoked.
    const code = data?.error === "invalid_grant" ? "invalid_grant" : "token_rejected";
    throw new EbayOAuthError(code, response.status);
  }
  if (!data?.access_token) {
    throw new EbayOAuthError("token_missing");
  }
  return data;
}

function expiresAt(seconds, now = Date.now()) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(now + value * 1000) : null;
}

// Authorization code → user access token (≈2 h) + refresh token (≈18 months).
export async function exchangeCodeForTokens(code, config) {
  const data = await tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.ruName,
  });
  if (!data.refresh_token) {
    throw new EbayOAuthError("token_missing");
  }
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: expiresAt(data.expires_in),
    refreshToken: data.refresh_token,
    refreshTokenExpiresAt: expiresAt(data.refresh_token_expires_in),
  };
}

// Refresh token → new user access token. eBay keeps the same refresh token.
export async function refreshUserAccessToken(refreshToken, scopes, config) {
  const data = await tokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  });
  return { accessToken: data.access_token, accessTokenExpiresAt: expiresAt(data.expires_in) };
}

// Application token for public data (Taxonomy). Cached per process until a
// minute before it expires.
const appTokenCache = new Map();

export async function getApplicationToken(config, { now = Date.now() } = {}) {
  const key = `${config.environment}:${config.clientId}`;
  const cached = appTokenCache.get(key);
  if (cached && cached.expiresAt - 60_000 > now) {
    return cached.token;
  }
  const data = await tokenRequest(config, {
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });
  appTokenCache.set(key, {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 7200) * 1000,
  });
  return data.access_token;
}

export function clearApplicationTokenCache() {
  appTokenCache.clear();
}

// The seller's immutable eBay user ID and username.
export async function fetchEbayIdentity(accessToken, config) {
  let response;
  try {
    response = await fetch(`${config.apizBase}/commerce/identity/v1/user/`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EbayOAuthError("identity_request_failed");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.userId) {
    throw new EbayOAuthError("identity_rejected", response.status);
  }
  return { ebayUserId: String(data.userId), username: data.username || null };
}
