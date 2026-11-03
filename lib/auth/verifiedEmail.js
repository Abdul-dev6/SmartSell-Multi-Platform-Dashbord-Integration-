import { normalizeEmail } from "@/lib/auth/credentials";

// Social sign-in links to an existing SmartSell account by email, so the
// provider must have proven the person owns that address. Without this,
// anyone could register a provider account with someone else's (unverified)
// email and be signed in as them.

const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

// GitHub: the email Auth.js chose (public, or the primary one) must appear
// as verified in /user/emails. Needs the user:email scope.
async function githubEmailVerified(email, accessToken, fetchImpl) {
  if (!accessToken) return false;
  let response;
  try {
    response = await fetchImpl(GITHUB_EMAILS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "SmartSell",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const emails = await response.json().catch(() => null);
  if (!Array.isArray(emails)) return false;
  return emails.some((e) => e?.verified === true && normalizeEmail(e.email) === email);
}

// Returns true only when the provider vouches that the sign-in email is
// verified. Unknown providers are refused.
export async function isSocialEmailVerified({ provider, email, profile, accessToken, fetchImpl = fetch }) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  if (provider === "google") {
    return profile?.email_verified === true && normalizeEmail(profile.email) === normalized;
  }
  if (provider === "github") {
    return githubEmailVerified(normalized, accessToken, fetchImpl);
  }
  return false;
}

// Where to send someone whose provider email is not verified.
export const unverifiedEmailRedirect = (provider) => `/Login?error=${provider}_email_unverified`;
