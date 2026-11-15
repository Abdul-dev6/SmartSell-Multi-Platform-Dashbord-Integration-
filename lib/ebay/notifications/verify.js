import crypto from "node:crypto";
import { getApplicationToken } from "@/lib/ebay/oauth";

// Challenge and signature verification for eBay event notifications.
//
// This follows eBay's official Node SDK (event-notification-nodejs-sdk
// 1.0.3, lib/validator.js, lib/client.js, lib/constants.js) step for step:
//   - challenge: SHA-256 over challengeCode + verificationToken + endpoint,
//     hex encoded, returned as { "challengeResponse": "<hex>" }
//   - X-EBAY-SIGNATURE: base64 → ASCII → JSON with `kid` and `signature`
//   - public key: GET {api}/commerce/notification/v1/public_key/{kid} with an
//     application (client credentials) token; cached (eBay recommends ~1 hour)
//   - verify: crypto.createVerify("ssl3-sha1") over JSON.stringify(message),
//     key wrapped as PEM, signature base64
// The SDK itself is not installed: it depends on axios 0.21.x (open
// high-severity advisories) and Express, logs the user's eBay ID and
// username in its default processor, and can log OAuth request errors.

export const SIGNATURE_ALGORITHM = "ssl3-sha1"; // SDK constants.ALGORITHM
const KEY_START = "-----BEGIN PUBLIC KEY-----";
const KEY_END = "-----END PUBLIC KEY-----";
const KEY_TTL_MS = 60 * 60 * 1000;
const KID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_HEADER_LENGTH = 4096;

export class SignatureError extends Error {
  // reason: "missing" | "malformed" | "invalid" → reject (412);
  // "key_unavailable" → eBay or our keyset failed; let eBay retry (500).
  // detail (key_unavailable only, safe to log): { stage: "token" | "key_fetch"
  // | "key_format", status?: eBay's HTTP status }.
  constructor(reason, detail = null) {
    super(`eBay signature ${reason}`);
    this.name = "SignatureError";
    this.reason = reason;
    this.detail = detail;
  }
}

export function challengeResponse(challengeCode, verificationToken, endpoint) {
  return crypto.createHash("sha256").update(challengeCode).update(verificationToken).update(endpoint).digest("hex");
}

// { kid, signature } from the X-EBAY-SIGNATURE header.
export function decodeSignatureHeader(header) {
  if (!header) throw new SignatureError("missing");
  if (header.length > MAX_HEADER_LENGTH) throw new SignatureError("malformed");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(header, "base64").toString("ascii"));
  } catch {
    throw new SignatureError("malformed");
  }
  if (!parsed || typeof parsed.kid !== "string" || !KID_RE.test(parsed.kid) || typeof parsed.signature !== "string" || !parsed.signature) {
    throw new SignatureError("malformed");
  }
  return { kid: parsed.kid, signature: parsed.signature };
}

// SDK formatKey(): eBay returns the PEM without line breaks after the header
// and before the footer.
export function formatKey(key) {
  return key.replace(KEY_START, `${KEY_START}\n`).replace(KEY_END, `\n${KEY_END}`);
}

const keyCache = new Map(); // `${environment}:${kid}` -> { key, expiresAt }

export function clearPublicKeyCache() {
  keyCache.clear();
}

export async function fetchPublicKey(kid, keyset, { now = Date.now(), fetchImpl = fetch, getToken = getApplicationToken } = {}) {
  const cacheKey = `${keyset.environment}:${kid}`;
  const cached = keyCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.key;

  // Application token first (fails when the client ID/secret are wrong or
  // the keyset is not active), then the key. Only the stage and eBay's HTTP
  // status are reported, never the token or the response body.
  let token;
  try {
    token = await getToken(keyset);
  } catch {
    throw new SignatureError("key_unavailable", { stage: "token" });
  }
  let data;
  try {
    const response = await fetchImpl(`${keyset.apiBase}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new SignatureError("key_unavailable", { stage: "key_fetch", status: response.status });
    data = await response.json();
  } catch (error) {
    if (error instanceof SignatureError) throw error;
    throw new SignatureError("key_unavailable", { stage: "key_fetch" });
  }
  if (!data || typeof data.key !== "string" || !data.key.includes(KEY_START)) {
    throw new SignatureError("key_unavailable", { stage: "key_format" });
  }
  keyCache.set(cacheKey, { key: data.key, expiresAt: now + KEY_TTL_MS });
  return data.key;
}

// Verifies a notification. `message` is the parsed body (the SDK signs
// JSON.stringify(message)); `rawBody` is also accepted as signed input in
// case eBay's serialization differs from Node's. Either way the signature
// must be valid for eBay's key. Throws SignatureError when not verified.
export async function verifyNotificationSignature({ message, rawBody, header, keyset, ...options }) {
  const { kid, signature } = decodeSignatureHeader(header);
  const key = formatKey(await fetchPublicKey(kid, keyset, options));
  const candidates = [JSON.stringify(message)];
  if (typeof rawBody === "string" && rawBody !== candidates[0]) candidates.push(rawBody);
  for (const data of candidates) {
    let valid = false;
    try {
      valid = crypto.createVerify(SIGNATURE_ALGORITHM).update(data).verify(key, signature, "base64");
    } catch {
      valid = false;
    }
    if (valid) return { kid };
  }
  throw new SignatureError("invalid");
}
