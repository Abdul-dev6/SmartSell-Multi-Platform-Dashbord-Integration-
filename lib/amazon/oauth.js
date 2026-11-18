import crypto from "node:crypto";
import { NextResponse } from "next/server";
import AmazonOAuthState, { OAUTH_STATE_TTL_MS } from "@/models/AmazonOAuthState";

// Amazon SP-API website authorization workflow (developer-docs.amazon.com,
// "Website authorization workflow"):
//   3  /api/amazon/connect   → Seller Central consent URL (application_id, state, version=beta)
//   5  Amazon → log-in URI /api/amazon/login (amazon_callback_uri, amazon_state, selling_partner_id)
//   8  log-in URI → amazon_callback_uri (amazon_state, state, redirect_uri, version=beta)
//   10 Amazon → redirect URI /api/amazon/callback (state, selling_partner_id, spapi_oauth_code)
//   12 code → refresh token at https://api.amazon.com/auth/o2/token
// State values are random 256-bit tokens, stored server-side only as hashes,
// bound to the SmartSell user, single use and valid for ten minutes.

const STATE_RE = /^[A-Za-z0-9_-]{43}$/;
export const SELLING_PARTNER_RE = /^[A-Z0-9]{5,32}$/;
const hashState = (state) => crypto.createHash("sha256").update(state).digest("hex");

export async function createOAuthState(userId, purpose, { sellingPartnerId, now = Date.now() } = {}) {
  const state = crypto.randomBytes(32).toString("base64url");
  await AmazonOAuthState.create({ stateHash: hashState(state), user: userId, purpose, sellingPartnerId, expiresAt: new Date(now + OAUTH_STATE_TTL_MS) });
  return state;
}

// Atomically consumes a state for this user and purpose. Returns the stored
// record, or null when it is unknown, tampered, expired, already used or
// belongs to another user.
export async function consumeOAuthState(state, userId, purpose, { now = Date.now() } = {}) {
  if (typeof state !== "string" || !STATE_RE.test(state)) return null;
  return AmazonOAuthState.findOneAndDelete({ stateHash: hashState(state), user: userId, purpose, expiresAt: { $gt: new Date(now) } }).lean();
}

export function buildConsentUrl(config, state) {
  const url = new URL("/apps/authorize/consent", config.sellerCentral);
  url.searchParams.set("application_id", config.appId);
  url.searchParams.set("state", state);
  if (config.beta) url.searchParams.set("version", "beta");
  return url.toString();
}

// amazon_callback_uri must be an Amazon (NA) authorization confirm URL, so the
// log-in URI can never be used as an open redirect.
export function isAmazonCallbackUri(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && (host === "amazon.com" || host.endsWith(".amazon.com")) && u.pathname.startsWith("/apps/authorize/confirm");
  } catch {
    return false;
  }
}

export function buildAmazonCallbackRedirect(amazonCallbackUri, { amazonState, state, redirectUri, beta }) {
  const url = new URL(amazonCallbackUri);
  url.searchParams.set("amazon_state", amazonState);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  if (beta) url.searchParams.set("version", "beta");
  return url.toString();
}

// Every authorization response: no Referer (Amazon's requirement) and no cache.
export function noReferrer(response) {
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function redirectToIntegration(req, params) {
  const url = new URL("/Panel/Ecommerce/Integration", req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return noReferrer(NextResponse.redirect(url));
}
