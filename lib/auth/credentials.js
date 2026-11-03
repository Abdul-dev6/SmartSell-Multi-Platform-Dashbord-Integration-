const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes of a password.
export const MAX_PASSWORD_LENGTH = 72;

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email) {
  return email.length <= 254 && EMAIL_RE.test(email);
}

// Emails are stored trimmed and lowercased (normalizeEmail), so lookups use
// an exact match on the normalized value, which the unique email index
// serves. (A case-insensitive collation query cannot use that index and
// scanned every user; all stored emails were verified lowercase before the
// collation was removed.)

export async function readJsonBody(req) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}
