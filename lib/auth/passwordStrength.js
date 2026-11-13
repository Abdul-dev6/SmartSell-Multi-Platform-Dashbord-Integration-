// Rough strength for a new password: 0 (empty) to 4. Shown as guidance only;
// the server enforces the real rules (8–72 characters).
export function passwordStrength(password = "") {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(4, Math.max(1, score));
}
