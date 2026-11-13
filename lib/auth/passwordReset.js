import crypto from "node:crypto";

// Password reset tokens: 32 random bytes sent to the user's email; only a
// SHA-256 hash is stored, so a database leak does not expose usable links.
// Valid for 30 minutes and for one use.

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const TOKEN_RE = /^[a-f0-9]{64}$/;

export const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
export const isResetTokenFormat = (token) => typeof token === "string" && TOKEN_RE.test(token);

export function newResetToken(now = Date.now()) {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashResetToken(token), expiresAt: new Date(now + RESET_TOKEN_TTL_MS) };
}

// The site address used in reset links. Production uses APP_BASE_URL (never
// the request's Host header, which a client controls); local development
// falls back to the address the request came to.
export function appBaseUrl(req) {
  const configured = (process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return req.nextUrl.origin;
  return null;
}

export function resetEmail(link) {
  const minutes = RESET_TOKEN_TTL_MS / 60000;
  return {
    subject: "Reset your SmartSell password",
    text: `Someone asked to reset the password for your SmartSell account.\n\nReset it here (valid for ${minutes} minutes, one use):\n${link}\n\nIf this wasn't you, ignore this email; your password stays the same.`,
    html: `<p>Someone asked to reset the password for your SmartSell account.</p>
<p><a href="${link}">Reset your password</a> (valid for ${minutes} minutes, one use).</p>
<p>If this wasn't you, ignore this email; your password stays the same.</p>`,
  };
}
