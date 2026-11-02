import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/jwt";

export const OAUTH_STATE_COOKIE = "shopify_oauth_state";
const OAUTH_STATE_AUDIENCE = "shopify-oauth-state";
const OAUTH_STATE_MAX_AGE = 60 * 10; // 10 minutes
const CALLBACK_PATH = "/api/shopify/callback";

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

// Strict check for values Shopify sends us (callback, webhooks).
export function isValidShopDomain(shop) {
  return typeof shop === "string" && SHOP_DOMAIN_RE.test(shop);
}

// Lenient parsing for what a user types ("my-store", "https://my-store.myshopify.com/").
// Returns a canonical "<name>.myshopify.com" or null.
export function normalizeShopDomain(input) {
  if (typeof input !== "string") {
    return null;
  }

  let shop = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "");

  if (!shop) {
    return null;
  }

  if (!shop.endsWith(".myshopify.com")) {
    shop = `${shop}.myshopify.com`;
  }

  return isValidShopDomain(shop) ? shop : null;
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Verifies the `hmac` Shopify adds to OAuth redirects: all other query
// parameters, sorted by key and URL-encoded, signed with the app secret.
export function verifyOAuthQueryHmac(searchParams, secret) {
  const hmac = searchParams.get("hmac");
  if (!hmac || !secret) {
    return false;
  }

  const entries = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const message = new URLSearchParams(entries).toString();
  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return safeEqual(digest, hmac.toLowerCase());
}

export function getShopifyOAuthConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  const scopes = (process.env.SHOPIFY_SCOPES || "read_products")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(",");

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri, scopes };
}

// The state nonce is sent to Shopify; a signed copy bound to the shop and
// the SmartSell user lives in an httpOnly cookie until the callback.
export function createOAuthState({ shop, userId }) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const cookieValue = jwt.sign(
    { nonce, shop, uid: String(userId) },
    getJwtSecret(),
    {
      algorithm: "HS256",
      audience: OAUTH_STATE_AUDIENCE,
      expiresIn: OAUTH_STATE_MAX_AGE,
    },
  );
  return { nonce, cookieValue };
}

export function readOAuthState(cookieValue) {
  if (!cookieValue) {
    return null;
  }
  try {
    return jwt.verify(cookieValue, getJwtSecret(), {
      algorithms: ["HS256"],
      audience: OAUTH_STATE_AUDIENCE,
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
    path: CALLBACK_PATH,
    maxAge,
  };
}

export function setOAuthStateCookie(response, cookieValue) {
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    cookieValue,
    stateCookieOptions(OAUTH_STATE_MAX_AGE),
  );
  return response;
}

export function clearOAuthStateCookie(response) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", stateCookieOptions(0));
  return response;
}

export class ShopifyOAuthError extends Error {
  constructor(code, status) {
    super(`Shopify OAuth failed: ${code}`);
    this.name = "ShopifyOAuthError";
    this.code = code;
    this.status = status;
  }
}

// Exchanges an authorization code for an offline access token.
// `shop` must already be validated with isValidShopDomain.
export async function exchangeCodeForToken(shop, code, config) {
  if (!isValidShopDomain(shop)) {
    throw new ShopifyOAuthError("invalid_shop");
  }

  let response;
  try {
    response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ShopifyOAuthError("token_request_failed");
  }

  if (!response.ok) {
    throw new ShopifyOAuthError("token_exchange_rejected", response.status);
  }

  const data = await response.json().catch(() => null);
  if (!data?.access_token) {
    throw new ShopifyOAuthError("token_missing");
  }

  return { accessToken: data.access_token, scope: data.scope || "" };
}
