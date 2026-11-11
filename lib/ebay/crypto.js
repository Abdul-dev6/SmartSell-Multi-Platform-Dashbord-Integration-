import crypto from "node:crypto";

// AES-256-GCM encryption for eBay OAuth tokens at rest. eBay refresh tokens
// stay valid for about 18 months, so they are never stored in plain text.
//
// TOKEN_ENCRYPTION_KEY: 32 random bytes, base64 (e.g. `openssl rand -base64 32`)
// or 64 hex characters. Changing it makes stored tokens unreadable, and
// sellers must reconnect eBay.

const VERSION = "v1";

function getKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  }
  let key;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex characters)");
  }
  return key;
}

export function isEncryptionConfigured() {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext) {
  if (typeof plaintext !== "string" || !plaintext) {
    throw new Error("Nothing to encrypt");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

// Throws when the value was tampered with or encrypted with another key.
export function decryptSecret(value) {
  const parts = typeof value === "string" ? value.split(":") : [];
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized encrypted value");
  }
  const [, iv, tag, ciphertext] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
