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

// Matches emails stored before normalization ("Name@Example.com").
export const EMAIL_COLLATION = { locale: "en", strength: 2 };

export async function readJsonBody(req) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}
