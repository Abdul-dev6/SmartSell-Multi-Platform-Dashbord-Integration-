import mongoose from "mongoose";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import AmazonOrder from "@/models/AmazonOrder";
import AmazonInventory from "@/models/AmazonInventory";
import AmazonFinancialEvent from "@/models/AmazonFinancialEvent";
import AmazonSyncJob from "@/models/AmazonSyncJob";
import AmazonSyncCheckpoint from "@/models/AmazonSyncCheckpoint";
import { amazonEndpoints, getAmazonConfig, getAmazonEnvironment } from "@/lib/amazon/config";
import { AmazonServiceError } from "@/lib/amazon/errors";
import { createAmazonClient } from "@/lib/amazon/client";
import { AmazonAuthError } from "@/lib/amazon/lwa";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import { notify } from "@/lib/notifications";
import { logWarn } from "@/lib/observability/log";

// Amazon accounts, always looked up for their SmartSell owner. Mirrors
// lib/ebay/accounts.js. Linking is a plain function the OAuth callback (and
// the sandbox viewer) call.

const SAFE_FIELDS =
  "_id user environment sellingPartnerId region marketplaceIds marketplaces status connectedAt reconnectRequiredAt lastSyncAt lastSuccessfulSyncAt lastError createdAt";

// Every Amazon model with per-account data, deleted on disconnect.
const ACCOUNT_DATA_MODELS = [AmazonSyncJob, AmazonSyncCheckpoint, AmazonListing, AmazonOrder, AmazonInventory, AmazonFinancialEvent];

export class AmazonAccountOwnershipError extends Error {
  constructor() {
    super("This Amazon seller account is linked to another SmartSell account");
    this.name = "AmazonAccountOwnershipError";
  }
}

export class AmazonReconnectRequiredError extends Error {
  constructor() {
    super("Amazon authorization is no longer valid; reconnect the account");
    this.name = "AmazonReconnectRequiredError";
    this.code = "reconnect_required";
  }
}

export async function getAmazonAccountForUser(userId, { accountId, withToken = false, environment } = {}) {
  // An account being disconnected is no longer usable.
  const filter = { user: userId, status: { $ne: "disconnecting" } };
  if (accountId !== undefined) {
    if (!mongoose.isValidObjectId(accountId)) return null;
    filter._id = accountId;
  }
  if (environment) filter.environment = environment;
  const query = AmazonAccount.findOne(filter).sort({ createdAt: 1 });
  return withToken ? query.select("+refreshTokenEnc") : query.select(SAFE_FIELDS);
}

export async function listAmazonAccounts(userId) {
  return AmazonAccount.find({ user: userId }).select(SAFE_FIELDS).sort({ createdAt: 1 }).lean();
}

// Links (or re-links) a seller account to a user. Never reassigns an account
// another SmartSell user owns. Reconnecting the same seller updates the record
// and clears reconnect_required.
export async function linkAmazonAccount({ userId, environment, sellingPartnerId, marketplaceIds, marketplaces, refreshToken }) {
  if (typeof sellingPartnerId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(sellingPartnerId)) {
    throw new Error("Invalid selling partner ID");
  }
  const { region } = amazonEndpoints(environment);
  const existing = await AmazonAccount.findOne({ environment, sellingPartnerId }).select("user").lean();
  if (existing && String(existing.user) !== String(userId)) throw new AmazonAccountOwnershipError();
  const ids = marketplaces?.length ? marketplaces.filter((m) => m.isParticipating !== false).map((m) => m.id) : marketplaceIds || [];
  try {
    return await AmazonAccount.findOneAndUpdate(
      { environment, sellingPartnerId, user: userId },
      {
        $set: {
          region,
          marketplaceIds: ids,
          ...(marketplaces ? { marketplaces } : {}),
          refreshTokenEnc: encryptSecret(refreshToken),
          status: "active",
          connectedAt: new Date(),
        },
        $unset: { lastError: 1, reconnectRequiredAt: 1 },
      },
      { upsert: true, returnDocument: "after", runValidators: true, projection: SAFE_FIELDS },
    ).lean();
  } catch (error) {
    if (error?.code === 11000) throw new AmazonAccountOwnershipError();
    throw error;
  }
}

// Amazon refused the refresh token (invalid_grant: revoked, expired or the
// annual reauthorization is due). Syncs stop; synced history is kept until the
// seller reconnects or disconnects. Notifies the seller once.
export async function markReconnectRequired(account) {
  const updated = await AmazonAccount.findOneAndUpdate(
    { _id: account._id, user: account.user, status: "active" },
    { $set: { status: "reconnect_required", reconnectRequiredAt: new Date(), lastError: "Amazon authorization is no longer valid." } },
    { returnDocument: "after" },
  ).lean();
  await AmazonSyncJob.updateMany(
    { user: account.user, amazonAccount: account._id, active: true },
    { $set: { status: "failed", active: false, error: "reconnect_required", finishedAt: new Date() }, $unset: { lockedUntil: 1 } },
  );
  if (updated) {
    logWarn(null, "amazon_reconnect_required", null, { environment: account.environment });
    await notify(account.user, "error", "Reconnect Amazon", "Amazon no longer accepts SmartSell's authorization for your seller account. Reconnect it on the Integrations page; your synced Amazon data is kept until then.").catch(() => {});
  }
  return updated;
}

export const isInvalidGrant = (error) => error instanceof AmazonAuthError && error.oauthError === "invalid_grant";

// An SP-API client for an account (loaded withToken). The app's LWA
// credentials come from config; the seller's refresh token from the account.
export function clientForAccount(account, options) {
  if (account.status === "reconnect_required") throw new AmazonReconnectRequiredError();
  // Environment isolation: only accounts of the active AMAZON_ENVIRONMENT
  // may call Amazon (a production account never runs while the app is in
  // sandbox mode, and the reverse).
  if (account.environment !== getAmazonEnvironment()) {
    throw new AmazonServiceError(409, "environment_inactive", `This Amazon account belongs to the ${account.environment} environment, which is not active.`);
  }
  const config = getAmazonConfig(account.environment);
  if (!config) throw new Error("Amazon SP-API is not configured");
  return createAmazonClient({ ...config, refreshToken: decryptSecret(account.refreshTokenEnc) }, options);
}

// Runs fn(client) for an account; an invalid_grant marks the account
// reconnect_required and throws AmazonReconnectRequiredError.
export async function withAccountClient(account, fn, options) {
  const client = clientForAccount(account, options);
  try {
    return await fn(client);
  } catch (error) {
    if (isInvalidGrant(error)) {
      await markReconnectRequired(account);
      throw new AmazonReconnectRequiredError();
    }
    throw error;
  }
}

// Deletes the account and every Amazon record synced for it, for its owner
// only: sync jobs (so a running sync stops), checkpoints, listings, orders,
// FBA inventory and financial records. Shopify and eBay data are not touched.
// Returns null when the account does not exist or belongs to someone else.
// Note: this does not revoke the authorization at Amazon; the seller removes
// SmartSell in Seller Central (Apps and Services > Manage Your Apps).
export async function disconnectAmazonAccount(userId, accountId) {
  if (!mongoose.isValidObjectId(accountId)) return null;
  // Marked first: syncs and writes stop, and anything a running sync writes
  // afterwards is removed by its post-write check. If a step below fails, the
  // account remains (disconnecting) and the disconnect can be repeated.
  const account = await AmazonAccount.findOneAndUpdate({ _id: accountId, user: userId }, { $set: { status: "disconnecting" } }, { projection: "_id environment sellingPartnerId" }).lean();
  if (!account) return null;
  const deleted = {};
  for (const Model of ACCOUNT_DATA_MODELS) {
    const result = await Model.deleteMany({ user: userId, amazonAccount: account._id });
    deleted[Model.modelName] = result.deletedCount;
  }
  const removed = await AmazonAccount.deleteOne({ _id: account._id, user: userId });
  return {
    environment: account.environment,
    deleted: { accounts: removed.deletedCount, listings: deleted.AmazonListing, orders: deleted.AmazonOrder, inventory: deleted.AmazonInventory, financialEvents: deleted.AmazonFinancialEvent, syncJobs: deleted.AmazonSyncJob, checkpoints: deleted.AmazonSyncCheckpoint },
  };
}

// True when the account still exists for this owner and can be synced.
export async function accountStillConnected(account) {
  return Boolean(await AmazonAccount.exists({ _id: account._id, user: account.user, status: "active" }));
}

export function toClientAccount(account) {
  return {
    id: String(account._id),
    environment: account.environment,
    environmentLabel: account.environment === "sandbox" ? "Sandbox" : "Production",
    sellingPartnerId: account.sellingPartnerId,
    region: account.region,
    marketplaceIds: account.marketplaceIds || [],
    marketplaces: (account.marketplaces || []).map((m) => ({ id: m.id, name: m.name || null, countryCode: m.countryCode || null, currency: m.currency || null })),
    status: account.status,
    reconnectRequired: account.status === "reconnect_required",
    connectedAt: account.connectedAt || null,
    lastSyncAt: account.lastSyncAt || null,
    lastSuccessfulSyncAt: account.lastSuccessfulSyncAt || null,
    lastError: account.lastError || null,
  };
}
