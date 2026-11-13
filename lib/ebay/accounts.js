import mongoose from "mongoose";
import EbayAccount from "@/models/EbayAccount";
import { encryptSecret } from "@/lib/ebay/crypto";

export class EbayAccountOwnershipError extends Error {
  constructor() {
    super("This eBay account is linked to another SmartSell account");
    this.name = "EbayAccountOwnershipError";
  }
}

const SAFE_FIELDS =
  "_id environment ebayUserId username marketplaceId scopes status connectedAt disconnectedAt lastError setup lastSyncAt lastSyncStatus lastSyncError lastSyncCounts syncLockedUntil refreshTokenExpiresAt createdAt";

// An account the user can use for API calls (active, or awaiting reauth when
// `includeReauth`). Pass withTokens for server-side token access.
export async function getEbayAccountForUser(userId, { accountId, withTokens = false, includeReauth = false } = {}) {
  const filter = {
    user: userId,
    status: includeReauth ? { $in: ["active", "reauth_required"] } : "active",
  };
  if (accountId !== undefined) {
    if (!mongoose.isValidObjectId(accountId)) return null;
    filter._id = accountId;
  }
  const query = EbayAccount.findOne(filter).sort({ createdAt: 1 });
  return withTokens ? query.select("+refreshTokenEnc +accessTokenEnc") : query;
}

// Every non-disconnected account, for catalog and status views.
export async function getConnectedEbayAccounts(userId) {
  return EbayAccount.find({ user: userId, status: { $ne: "disconnected" } })
    .select(SAFE_FIELDS)
    .sort({ createdAt: 1 })
    .lean();
}

export async function listEbayAccounts(userId) {
  return EbayAccount.find({ user: userId }).select(SAFE_FIELDS).sort({ createdAt: 1 }).lean();
}

// Links (or re-links) an eBay account after a successful OAuth exchange.
// An account owned by a different SmartSell user is never reassigned.
export async function linkEbayAccount({ userId, environment, marketplaceId, identity, tokens, scopes }) {
  const existing = await EbayAccount.findOne({ environment, ebayUserId: identity.ebayUserId }).select("user");
  if (existing && !existing.user.equals(userId)) {
    throw new EbayAccountOwnershipError();
  }

  try {
    return await EbayAccount.findOneAndUpdate(
      { environment, ebayUserId: identity.ebayUserId, user: userId },
      {
        $set: {
          username: identity.username,
          marketplaceId,
          refreshTokenEnc: encryptSecret(tokens.refreshToken),
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
          accessTokenEnc: encryptSecret(tokens.accessToken),
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
          scopes,
          status: "active",
          connectedAt: new Date(),
        },
        $unset: { disconnectedAt: 1, lastError: 1 },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
  } catch (error) {
    // Unique index: another user linked the same eBay account concurrently.
    if (error?.code === 11000) throw new EbayAccountOwnershipError();
    throw error;
  }
}

// eBay has no API to revoke a user token, so SmartSell deletes its copy of
// the tokens; the seller can also remove the app under eBay → Account →
// Third-party app access. The record is kept so products keep their reference.
export async function disconnectEbayAccount(userId, accountId) {
  if (!mongoose.isValidObjectId(accountId)) return null;
  const account = await EbayAccount.findOneAndUpdate(
    { _id: accountId, user: userId, status: { $ne: "disconnected" } },
    {
      $set: { status: "disconnected", disconnectedAt: new Date() },
      $unset: { refreshTokenEnc: 1, accessTokenEnc: 1, accessTokenExpiresAt: 1 },
    },
    { returnDocument: "after" },
  );
  return account ? { username: account.username, ebayUserId: account.ebayUserId } : null;
}

export function toClientAccount(account) {
  return {
    id: String(account._id),
    environment: account.environment,
    username: account.username || account.ebayUserId,
    marketplaceId: account.marketplaceId,
    status: account.status,
    connectedAt: account.connectedAt || null,
    disconnectedAt: account.disconnectedAt || null,
    lastError: account.lastError || null,
    // When the seller must authorize SmartSell again (refresh token expiry).
    authorizationExpiresAt: account.refreshTokenExpiresAt || null,
    setup: account.setup
      ? {
          ready: Boolean(account.setup.ready),
          checkedAt: account.setup.checkedAt || null,
          merchantLocationKey: account.setup.merchantLocationKey || null,
          fulfillmentPolicyId: account.setup.fulfillmentPolicyId || null,
          paymentPolicyId: account.setup.paymentPolicyId || null,
          returnPolicyId: account.setup.returnPolicyId || null,
          policyNames: account.setup.policyNames || {},
          issues: account.setup.issues || [],
        }
      : { ready: false, checkedAt: null, issues: [] },
    sync: {
      lastSyncAt: account.lastSyncAt || null,
      lastSyncStatus: account.lastSyncStatus || null,
      lastSyncError: account.lastSyncError || null,
      counts: account.lastSyncCounts || null,
      syncing: Boolean(account.syncLockedUntil && account.syncLockedUntil > new Date()),
    },
  };
}
