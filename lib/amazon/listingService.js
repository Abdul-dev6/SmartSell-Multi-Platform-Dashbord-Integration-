import crypto from "node:crypto";
import mongoose from "mongoose";
import AmazonListing from "@/models/AmazonListing";
import AmazonInventory from "@/models/AmazonInventory";
import { isAmazonConnectEnabled } from "@/lib/amazon/config";
import { isSandboxViewerEnabled } from "@/lib/amazon/sandboxViewer";
import { AmazonApiError } from "@/lib/amazon/client";
import { accountStillConnected, getAmazonAccountForUser, withAccountClient } from "@/lib/amazon/accounts";
import { AmazonServiceError, invalid, notFound } from "@/lib/amazon/errors";
import { assertValid, validateListingInput } from "@/lib/amazon/validation";
import { getProductTypeRequirements, missingRequiredAttributes } from "@/lib/amazon/productTypes";
import {
  buildAttributes,
  buildPatches,
  deleteListingsItem,
  fetchListingsItem,
  LISTING_DETAIL_DATA,
  patchListingsItem,
  processingStatus,
  putListingsItem,
} from "@/lib/amazon/listings";

// Seller listing management on Amazon, always for the signed-in user's own
// connected account. Every write:
//   1. checks ownership and that writes are enabled for the account
//   2. validates input, then the product type's required attributes
//   3. claims the listing (pendingOperation) so a duplicate submission is
//      refused while one is in flight
//   4. asks Amazon to validate (mode=VALIDATION_PREVIEW), then submits
//   5. stores what Amazon returned; ACCEPTED means "queued", so the listing is
//      read back for its real processing result (live / processing / failed)

const LEASE_MS = 2 * 60 * 1000;
const PAGE_SIZE_MAX = 100;

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

export function canWrite(account) {
  return account.environment === "sandbox" ? isSandboxViewerEnabled() : isAmazonConnectEnabled();
}

export async function loadAccount(userId, accountId, { write }) {
  if (accountId !== undefined && !mongoose.isValidObjectId(accountId)) throw notFound("Amazon account");
  const account = await getAmazonAccountForUser(userId, { accountId, withToken: true });
  if (!account) throw notFound("Amazon account");
  if (account.status === "reconnect_required") throw new AmazonServiceError(409, "reconnect_required", "Reconnect your Amazon account first.");
  if (write && !canWrite(account)) throw new AmazonServiceError(404, "not_available", "Amazon listing changes are not enabled.");
  return account;
}

async function ownedListing(userId, listingId) {
  if (!mongoose.isValidObjectId(listingId)) throw notFound("Amazon listing");
  const listing = await AmazonListing.findOne({ _id: listingId, user: userId }).lean();
  if (!listing) throw notFound("Amazon listing");
  return listing;
}

async function claim(listing, type, requestHash) {
  const claimed = await AmazonListing.findOneAndUpdate(
    {
      _id: listing._id,
      user: listing.user,
      $or: [{ "pendingOperation.startedAt": { $exists: false } }, { "pendingOperation.startedAt": { $lt: new Date(Date.now() - LEASE_MS) } }],
    },
    { $set: { pendingOperation: { type, requestHash, startedAt: new Date() } } },
    { returnDocument: "after" },
  ).lean();
  if (!claimed) throw new AmazonServiceError(409, "in_progress", "Another change to this listing is still being sent to Amazon.");
  return claimed;
}

const release = (listing, update = {}) =>
  AmazonListing.updateOne({ _id: listing._id, user: listing.user }, { ...update, $unset: { pendingOperation: 1, ...(update.$unset || {}) } });

const submissionFields = (operation, submission, status) => ({
  submission: { operation, status, submissionId: submission.submissionId, submittedAt: new Date(), checkedAt: new Date() },
  issues: submission.issues,
});

// An INVALID submission is reported with Amazon's issues (422).
function rejected(submission) {
  return new AmazonServiceError(422, "amazon_invalid", "Amazon rejected the listing. Fix the issues it reported and try again.", { issues: submission.issues });
}

// Reads the listing back and records its processing result.
async function readBack(client, account, listing) {
  try {
    const { record } = await fetchListingsItem(client, { sellerId: account.sellingPartnerId, sku: listing.sku, marketplaceId: listing.marketplaceId, includedData: LISTING_DETAIL_DATA });
    if (!record) return null;
    const status = listing.submission?.status === "processing" ? processingStatus(record) : listing.submission?.status;
    const update = { ...record, lastSyncedAt: new Date(), ...(listing.submission ? { "submission.status": status, "submission.checkedAt": new Date() } : {}) };
    // Keep values SmartSell just submitted until Amazon reflects them.
    if (listing.pendingOperation) for (const k of ["price", "currency", "quantity"]) delete update[k];
    return AmazonListing.findOneAndUpdate({ _id: listing._id, user: listing.user }, { $set: update }, { returnDocument: "after" }).lean();
  } catch (error) {
    // Not visible yet right after creation (404) or temporarily unavailable.
    if (error instanceof AmazonApiError) return null;
    throw error;
  }
}

// ── Create ──────────────────────────────────────────────────────────────────
export async function createListing(userId, body) {
  const account = await loadAccount(userId, body?.accountId, { write: true });
  const value = assertValid(validateListingInput(body, { account, mode: "create" }));
  const attributes = buildAttributes(value, value.marketplaceId);
  const requestHash = hash({ value });

  return withAccountClient(account, async (client) => {
    const requirements = await getProductTypeRequirements(client, { productType: value.productType, marketplaceId: value.marketplaceId, sellerId: account.sellingPartnerId });
    const missing = missingRequiredAttributes(requirements, attributes);
    if (missing.length) throw invalid(`Amazon requires these attributes for ${value.productType}: ${missing.join(", ")}.`, { missingAttributes: missing });

    // Claim the SKU: one listing per account + marketplace + SKU.
    const identity = { user: userId, amazonAccount: account._id, marketplaceId: value.marketplaceId, sku: value.sku };
    let listing = await AmazonListing.findOne(identity).lean();
    if (listing && !(listing.origin === "smartsell" && listing.submission?.status === "failed")) {
      if (listing.pendingOperation?.startedAt > new Date(Date.now() - LEASE_MS)) throw new AmazonServiceError(409, "in_progress", "This listing is already being submitted to Amazon.");
      throw new AmazonServiceError(409, "sku_exists", "A listing with this SKU already exists in this marketplace. Edit it instead.");
    }
    const createdNow = !listing;
    if (!listing) {
      try {
        listing = (
          await AmazonListing.create({ ...identity, environment: account.environment, origin: "smartsell", productType: value.productType, itemName: value.title, statuses: [] })
        ).toObject();
      } catch (error) {
        if (error?.code === 11000) throw new AmazonServiceError(409, "in_progress", "This listing is already being submitted to Amazon.");
        throw error;
      }
    }
    listing = await claim(listing, "create", requestHash);

    let sentForReal = false;
    try {
      const args = { sellerId: account.sellingPartnerId, sku: value.sku, marketplaceId: value.marketplaceId, productType: value.productType, attributes };
      const preview = await putListingsItem(client, { ...args, preview: true });
      if (preview.status === "INVALID") {
        await release(listing, { $set: submissionFields("create", preview, "failed") });
        throw rejected(preview);
      }
      sentForReal = true;
      const submission = await putListingsItem(client, args);
      if (!(await accountStillConnected(account))) {
        await AmazonListing.deleteOne({ _id: listing._id, user: userId });
        throw new AmazonServiceError(409, "disconnected", "The Amazon account was disconnected.");
      }
      if (submission.status === "INVALID") {
        await release(listing, { $set: submissionFields("create", submission, "failed") });
        throw rejected(submission);
      }
      await release(listing, {
        $set: {
          ...submissionFields("create", submission, "processing"),
          ...(submission.asin ? { asin: submission.asin } : {}),
          ...(value.price !== undefined ? { price: value.price, currency: value.currency } : {}),
          fulfillmentChannel: value.fulfillment === "FBA" ? "AMAZON_NA" : "DEFAULT",
          ...(value.fulfillment === "MFN" ? { quantity: value.quantity ?? 0 } : {}),
        },
      });
      const fresh = await AmazonListing.findOne({ _id: listing._id, user: userId }).lean();
      if (!fresh) throw new AmazonServiceError(409, "disconnected", "The Amazon account was disconnected.");
      return { status: 202, listing: (await readBack(client, account, fresh)) || fresh, submission };
    } catch (error) {
      if (!(error instanceof AmazonServiceError)) {
        // Amazon failed (throttled, unavailable, network) or authorization was
        // revoked. Never leave an empty placeholder that would block the SKU:
        // if nothing was submitted for real, remove the row this request
        // created; otherwise the outcome is unknown, so mark it failed (a
        // retry is safe: putListingsItem is keyed by SKU).
        if (!sentForReal && createdNow) await AmazonListing.deleteOne({ _id: listing._id, user: userId, submission: { $exists: false } }).catch(() => {});
        else await release(listing, { $set: { submission: { operation: "create", status: "failed", submittedAt: new Date(), checkedAt: new Date() } } }).catch(() => {});
      }
      throw error;
    }
  });
}

// ── Update (attributes, price, seller-fulfilled quantity) and close ────────
async function patchListing(userId, listingId, value, operation) {
  const listing = await ownedListing(userId, listingId);
  const account = await loadAccount(userId, listing.amazonAccount, { write: true });
  if (value.quantity !== undefined && listing.fulfillmentChannel && listing.fulfillmentChannel !== "DEFAULT") {
    throw invalid("Amazon manages quantities for Fulfilled by Amazon listings; they cannot be changed from SmartSell.");
  }
  if (!listing.productType) throw new AmazonServiceError(409, "refresh_needed", "Refresh this listing from Amazon before editing it.");
  const patches = buildPatches(value, listing.marketplaceId);
  if (!patches.length) throw invalid("Nothing to update.");

  return withAccountClient(account, async (client) => {
    const claimed = await claim(listing, operation, hash({ value }));
    try {
      const args = { sellerId: account.sellingPartnerId, sku: listing.sku, marketplaceId: listing.marketplaceId, productType: listing.productType, patches };
      const preview = await patchListingsItem(client, { ...args, preview: true });
      if (preview.status === "INVALID") {
        await release(claimed, { $set: submissionFields(operation, preview, "failed") });
        throw rejected(preview);
      }
      const submission = await patchListingsItem(client, args);
      if (submission.status === "INVALID") {
        await release(claimed, { $set: submissionFields(operation, submission, "failed") });
        throw rejected(submission);
      }
      // Stored only after Amazon accepted the change.
      await release(claimed, {
        $set: {
          ...submissionFields(operation, submission, "processing"),
          ...(value.price !== undefined ? { price: value.price, currency: value.currency } : {}),
          ...(value.quantity !== undefined ? { quantity: value.quantity } : {}),
          ...(value.title ? { itemName: value.title } : {}),
        },
      });
      const fresh = await AmazonListing.findOne({ _id: listing._id, user: userId }).lean();
      if (!fresh) throw new AmazonServiceError(409, "disconnected", "The Amazon account was disconnected.");
      return { status: 202, listing: (await readBack(client, account, fresh)) || fresh, submission };
    } catch (error) {
      if (!(error instanceof AmazonServiceError)) await release(claimed).catch(() => {});
      throw error;
    }
  });
}

export async function updateListing(userId, listingId, body) {
  const listing = await ownedListing(userId, listingId);
  const account = await getAmazonAccountForUser(userId, { accountId: listing.amazonAccount });
  if (!account) throw notFound("Amazon account");
  const value = assertValid(validateListingInput({ ...body, marketplaceId: listing.marketplaceId }, { account, mode: "update" }));
  const operation = value.price !== undefined && Object.keys(value).length <= 2 ? "price" : value.quantity !== undefined && Object.keys(value).length === 1 ? "quantity" : "update";
  return patchListing(userId, listingId, value, operation);
}

// Closing makes a seller-fulfilled listing inactive (quantity 0, the listing
// stays and can be reopened). Amazon's Listings Items API has no separate
// "close" operation; FBA listings cannot be closed from SmartSell.
export async function closeListing(userId, listingId) {
  const listing = await ownedListing(userId, listingId);
  if (listing.fulfillmentChannel && listing.fulfillmentChannel !== "DEFAULT") {
    throw invalid("Fulfilled by Amazon listings cannot be closed from SmartSell. Close them in Seller Central.");
  }
  return patchListing(userId, listingId, { quantity: 0 }, "close");
}

// ── Delete ──────────────────────────────────────────────────────────────────
// Deleting removes the listing from Amazon (deleteListingsItem). Unlike
// closing, it cannot be reopened.
export async function deleteListing(userId, listingId, { confirm } = {}) {
  if (confirm !== true) throw new AmazonServiceError(400, "confirmation_required", "Deletion must be confirmed.");
  const listing = await ownedListing(userId, listingId);
  const account = await loadAccount(userId, listing.amazonAccount, { write: true });
  return withAccountClient(account, async (client) => {
    const claimed = await claim(listing, "delete", hash({ delete: listing.sku }));
    let submission;
    try {
      submission = await deleteListingsItem(client, { sellerId: account.sellingPartnerId, sku: listing.sku, marketplaceId: listing.marketplaceId });
    } catch (error) {
      await release(claimed).catch(() => {});
      throw error;
    }
    if (submission.status === "INVALID") {
      await release(claimed, { $set: submissionFields("delete", submission, "failed") });
      throw rejected(submission);
    }
    await AmazonListing.deleteOne({ _id: listing._id, user: userId, amazonAccount: account._id });
    return { status: 200, deleted: true, submission };
  });
}

// ── Read ────────────────────────────────────────────────────────────────────
export async function refreshListing(userId, listingId) {
  const listing = await ownedListing(userId, listingId);
  const account = await loadAccount(userId, listing.amazonAccount, { write: false });
  return withAccountClient(account, async (client) => (await readBack(client, account, listing)) || listing);
}

export async function getListing(userId, listingId) {
  return ownedListing(userId, listingId);
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listListings(userId, { accountId, q, status, marketplaceId, fulfillment, page = 1, pageSize = 25 } = {}) {
  const filter = { user: userId };
  if (accountId !== undefined) {
    if (!mongoose.isValidObjectId(accountId)) return { items: [], total: 0, page: 1, pageSize };
    filter.amazonAccount = accountId;
  }
  if (marketplaceId) filter.marketplaceId = marketplaceId;
  if (status === "active") filter.statuses = "BUYABLE";
  else if (status === "inactive") filter.statuses = { $ne: "BUYABLE" };
  else if (status === "issues") filter["issues.severity"] = "ERROR";
  if (fulfillment === "MFN") filter.fulfillmentChannel = "DEFAULT";
  else if (fulfillment === "FBA") filter.fulfillmentChannel = { $regex: "^AMAZON" };
  if (q) {
    const rx = new RegExp(escapeRegex(q.slice(0, 100)), "i");
    filter.$or = [{ sku: rx }, { asin: rx }, { itemName: rx }];
  }
  const size = Math.min(Math.max(1, pageSize), PAGE_SIZE_MAX);
  const current = Math.max(1, page);
  const [items, total] = await Promise.all([
    AmazonListing.find(filter).sort({ itemName: 1, sku: 1 }).skip((current - 1) * size).limit(size).lean(),
    AmazonListing.countDocuments(filter),
  ]);
  return { items, total, page: current, pageSize: size };
}

export async function listInventory(userId, { accountId } = {}) {
  const scope = { user: userId };
  if (accountId !== undefined) {
    if (!mongoose.isValidObjectId(accountId)) return { merchantFulfilled: [], fba: [] };
    scope.amazonAccount = accountId;
  }
  const [mfn, fba] = await Promise.all([
    AmazonListing.find({ ...scope, fulfillmentChannel: "DEFAULT" }).select("amazonAccount marketplaceId sku asin itemName quantity statuses submission lastSyncedAt").sort({ sku: 1 }).limit(500).lean(),
    AmazonInventory.find(scope).sort({ sellerSku: 1 }).limit(500).lean(),
  ]);
  return { merchantFulfilled: mfn, fba };
}
