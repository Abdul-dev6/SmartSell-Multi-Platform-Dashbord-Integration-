import { DEFAULT_MARKETPLACE_IDS, getAmazonConfig, getAmazonEnvironment, missingAmazonSettings } from "@/lib/amazon/config";
import { isEncryptionConfigured } from "@/lib/security/secrets";
import { clientForAccount, getAmazonAccountForUser, linkAmazonAccount, toClientAccount } from "@/lib/amazon/accounts";
import { AmazonApiError } from "@/lib/amazon/client";
import { AmazonAuthError } from "@/lib/amazon/lwa";
import { fetchMarketplaceParticipations } from "@/lib/amazon/sellers";
import { fetchListingsItem, syncListingsItem } from "@/lib/amazon/listings";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import { redactBuyerFields } from "@/lib/amazon/redact";

// Amazon Sandbox Data Viewer: shows what the SP-API STATIC SANDBOX returns,
// through the same owner-scoped account → client path a real account will
// use. Everything it returns is Amazon's sample/mock data, never a real
// seller listing. Nothing is stored except the user's sandbox account link.

export const SANDBOX_SAMPLE_SKU = "GM-ZDPI-9B4E"; // SKU of Amazon's static example
const DEFAULT_SANDBOX_SELLER_ID = "SANDBOX_SELLER"; // the static sandbox accepts any ID
const SKU_RE = /^[A-Za-z0-9._-]{1,40}$/;

export class SandboxViewerError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = "SandboxViewerError";
    this.code = code;
    this.status = status;
  }
}

// On in development and tests; in a production build only with
// AMAZON_SANDBOX_VIEWER=true. Always sandbox only.
export function isSandboxViewerEnabled() {
  let environment;
  try {
    environment = getAmazonEnvironment();
  } catch {
    return false;
  }
  return environment === "sandbox" && (process.env.NODE_ENV !== "production" || process.env.AMAZON_SANDBOX_VIEWER === "true");
}

export const isValidSampleSku = (sku) => typeof sku === "string" && SKU_RE.test(sku);

// Links the developer sandbox self-authorization (from .env) to the signed-in
// user as their sandbox account. The refresh token is encrypted by
// linkAmazonAccount and never returned.
const encryptionMissing = () =>
  new SandboxViewerError(
    "encryption_not_configured",
    503,
    "TOKEN_ENCRYPTION_KEY is not set, so the Amazon refresh token cannot be stored encrypted. Add it to .env and restart the server.",
  );

export async function connectSandboxAccount(userId) {
  const config = getAmazonConfig();
  if (!config?.refreshToken) {
    const missing = missingAmazonSettings();
    throw new SandboxViewerError("not_configured", 503, `Amazon Sandbox credentials are not configured${missing.length ? ` (missing: ${missing.join(", ")})` : ""}.`);
  }
  if (!isEncryptionConfigured()) throw encryptionMissing();
  return linkAmazonAccount({
    userId,
    environment: config.environment,
    sellingPartnerId: config.sellingPartnerId || DEFAULT_SANDBOX_SELLER_ID,
    marketplaceIds: config.marketplaceIds,
    refreshToken: config.refreshToken,
  });
}

// Safe description of a failed SP-API / LWA call (no messages, no bodies).
export function describeFailure(error) {
  if (error instanceof AmazonApiError) {
    return { code: error.code, status: error.status, message: `Amazon Sandbox request failed (${error.code}${error.status ? `, HTTP ${error.status}` : ""}).` };
  }
  if (error instanceof AmazonAuthError) {
    return { code: error.oauthError || error.code, status: error.status, message: `Amazon sign-in (LWA) failed (${error.oauthError || error.code}).` };
  }
  return { code: "unexpected", status: null, message: "The Amazon Sandbox request could not be completed." };
}

// The signed-in user's sandbox account and fresh responses from the static
// sandbox. Returns { connected: false } when the user has no account.
export async function loadSandboxSample(userId, { accountId, sku = SANDBOX_SAMPLE_SKU } = {}) {
  const account = await getAmazonAccountForUser(userId, { accountId, withToken: true });
  if (!account) return { connected: false };
  if (account.environment !== "sandbox") {
    throw new SandboxViewerError("not_sandbox", 409, "This viewer only reads Amazon Sandbox accounts.");
  }
  if (!isEncryptionConfigured()) throw encryptionMissing();

  const client = clientForAccount(account);
  const marketplaceId = account.marketplaceIds?.[0] || DEFAULT_MARKETPLACE_IDS[0];
  const [participations, listing] = await Promise.allSettled([
    fetchMarketplaceParticipations(client),
    fetchListingsItem(client, { sellerId: account.sellingPartnerId, sku, marketplaceId }),
  ]);

  const section = (result, pick) =>
    result.status === "fulfilled"
      ? { ok: true, data: pick(result.value), raw: redactBuyerFields(result.value.raw) }
      : { ok: false, error: describeFailure(result.reason), data: null, raw: null };

  return {
    connected: true,
    environment: "sandbox",
    sampleData: true,
    fetchedAt: new Date().toISOString(),
    account: toClientAccount(account),
    request: { sku, marketplaceId },
    participations: section(participations, (v) => v.participations),
    listing: section(listing, (v) => v.listing),
  };
}

// Imports Amazon's sandbox sample listing into the user's Products (stored
// as an AmazonListing for their own sandbox account, environment
// "sandbox"). Read-only sample data: it is never sent anywhere.
export async function importSandboxListing(userId, { accountId, sku = SANDBOX_SAMPLE_SKU } = {}) {
  const account = await getAmazonAccountForUser(userId, { accountId, withToken: true });
  if (!account) {
    throw new SandboxViewerError("not_connected", 409, "Connect the Amazon Sandbox account first (Amazon Sandbox Data Viewer).");
  }
  if (account.environment !== "sandbox") {
    throw new SandboxViewerError("not_sandbox", 409, "Only Amazon Sandbox sample listings can be imported.");
  }
  if (!isEncryptionConfigured()) throw encryptionMissing();

  const marketplaceId = account.marketplaceIds?.[0] || DEFAULT_MARKETPLACE_IDS[0];
  let saved;
  try {
    saved = await syncListingsItem(account, clientForAccount(account), { sku, marketplaceId });
  } catch (error) {
    if (error instanceof AmazonApiError || error instanceof AmazonAuthError) {
      const failure = describeFailure(error);
      throw new SandboxViewerError(failure.code, 502, failure.message);
    }
    throw error;
  }
  if (!saved) throw new SandboxViewerError("no_listing", 502, `Amazon Sandbox returned no listing for SKU ${sku}.`);

  // Disconnected while the request was running: do not leave a listing behind.
  if (!(await AmazonAccount.exists({ _id: account._id, user: userId }))) {
    await AmazonListing.deleteOne({ _id: saved._id, user: userId });
    throw new SandboxViewerError("not_connected", 409, "The Amazon Sandbox account was disconnected.");
  }
  return saved;
}
