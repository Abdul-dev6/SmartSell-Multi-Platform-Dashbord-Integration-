import crypto from "node:crypto";

// Shopify signs the exact request bytes: base64(HMAC-SHA256(app secret, body)).
// `rawBody` must be the unparsed body (Buffer); re-serialized JSON will not match.
export function verifyWebhookHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret || !Buffer.isBuffer(rawBody)) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  let received;
  try {
    received = Buffer.from(hmacHeader, "base64");
  } catch {
    return false;
  }

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
