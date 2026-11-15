import { ebayEndpoints } from "@/lib/ebay/config";

// Configuration for eBay Marketplace Account Deletion notifications.
//
// Kept separate from EBAY_ENVIRONMENT: the app can keep making Sandbox API
// requests while this endpoint receives Production notifications (eBay
// requires the endpoint before it activates a Production keyset).
//
//   EBAY_NOTIFICATION_ENDPOINT            the exact HTTPS URL registered in the
//                                         eBay Developer Portal (hashed in the
//                                         challenge response, so it must match)
//   EBAY_NOTIFICATION_VERIFICATION_TOKEN  32–80 characters: A–Z a–z 0–9 _ -
//   EBAY_NOTIFICATION_ENVIRONMENT         "production" (default) or "sandbox";
//                                         selects which keyset fetches eBay's
//                                         public keys (EBAY_PRODUCTION_* /
//                                         EBAY_SANDBOX_* client ID and secret)

const TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;
const PREFIX = { production: "EBAY_PRODUCTION_", sandbox: "EBAY_SANDBOX_" };

export function getNotificationEnvironment() {
  const value = (process.env.EBAY_NOTIFICATION_ENVIRONMENT || "production").trim().toLowerCase();
  return PREFIX[value] ? value : null;
}

// The registered endpoint, or null when unset or not an acceptable public
// HTTPS URL (eBay rejects http, localhost and internal addresses).
export function getNotificationEndpoint() {
  const raw = (process.env.EBAY_NOTIFICATION_ENDPOINT || "").trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const internal =
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" ||
    host === "[::1]";
  if (url.protocol !== "https:" || internal || url.search || url.hash) return null;
  // Exactly as configured: eBay hashes the registered string.
  return raw;
}

export function getVerificationToken() {
  const token = (process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN || "").trim();
  return TOKEN_RE.test(token) ? token : null;
}

// Credentials and endpoints used to fetch eBay's notification public keys.
export function getNotificationKeysetConfig() {
  const environment = getNotificationEnvironment();
  if (!environment) return null;
  const clientId = process.env[`${PREFIX[environment]}CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${PREFIX[environment]}CLIENT_SECRET`]?.trim();
  if (!clientId || !clientSecret) return null;
  return { environment, clientId, clientSecret, ...ebayEndpoints(environment) };
}

// What is missing, as names only (for logs and the health of the endpoint).
export function missingNotificationSettings() {
  const missing = [];
  if (!getNotificationEndpoint()) missing.push("EBAY_NOTIFICATION_ENDPOINT");
  if (!getVerificationToken()) missing.push("EBAY_NOTIFICATION_VERIFICATION_TOKEN");
  if (!getNotificationEnvironment()) missing.push("EBAY_NOTIFICATION_ENVIRONMENT");
  else if (!getNotificationKeysetConfig()) {
    const prefix = PREFIX[getNotificationEnvironment()];
    missing.push(`${prefix}CLIENT_ID`, `${prefix}CLIENT_SECRET`);
  }
  return missing;
}
