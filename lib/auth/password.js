import bcrypt from "bcryptjs";

// Cost for new hashes. Existing cost-10 hashes still verify and are
// upgraded on the next successful sign-in.
export const BCRYPT_COST = 12;

// bcrypt only reads the first 72 *bytes*; longer passwords (easy to reach
// with accented letters or emoji) would be silently truncated.
export const MAX_PASSWORD_BYTES = 72;

export function passwordTooLong(password) {
  return Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES;
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

// A valid cost-12 hash of a random value nobody knows. Comparing against it
// when an email has no password makes those attempts take as long as a real
// check, so response time does not reveal which emails are registered.
const DUMMY_HASH = "$2b$12$KM6MKGyMpLlgxswrj0xtRuXKnYy99mEy7QHKvuvaE/hB70QCA.pri";

// Returns { ok, needsRehash }. `hash` may be missing (unknown email or a
// Google/GitHub-only account); the comparison still runs.
export async function checkPassword(password, hash) {
  const ok = await bcrypt.compare(password, hash || DUMMY_HASH);
  if (!ok || !hash) return { ok: false, needsRehash: false };
  return { ok: true, needsRehash: bcrypt.getRounds(hash) < BCRYPT_COST };
}
