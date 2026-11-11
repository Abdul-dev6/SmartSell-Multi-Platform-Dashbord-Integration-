import mongoose from "mongoose";
import EbayProduct from "@/models/EbayProduct";
import { getEbayAccountForUser } from "@/lib/ebay/accounts";
import { createEbayClient, EbayApiError } from "@/lib/ebay/client";
import { getEbayEnvironment } from "@/lib/ebay/config";

// SmartSell → eBay product writes through the Inventory API:
//   create/update: PUT inventory_item/{sku} → create or update the offer →
//                  publish (or withdraw, when the seller wants a draft)
//   delete:        DELETE inventory_item/{sku} (eBay also deletes the offer
//                  and ends the listing), then archive the local record.
// Every step is keyed by SKU or offer ID, so a retry after a failure or an
// unknown outcome repeats the same calls without creating duplicates.

const INVENTORY_API = "/sell/inventory/v1";
// Another write still running on the same product.
const WRITE_LEASE_MS = 2 * 60 * 1000;
const MAX_ERROR_LENGTH = 300;
// eBay: "Offer entity already exists" for this SKU and marketplace.
const OFFER_EXISTS_ERROR_IDS = new Set([25002]);
// eBay: "This Offer is not available" for a SKU without offers.
const NO_OFFER_ERROR_IDS = new Set([25713]);

export class EbayProductError extends Error {
  constructor(code, message, status, { ebayErrors, productId } = {}) {
    super(message);
    this.name = "EbayProductError";
    this.code = code;
    this.status = status;
    this.ebayErrors = ebayErrors;
    this.productId = productId;
  }
}

const skuPath = (sku) => `${INVENTORY_API}/inventory_item/${encodeURIComponent(sku)}`;
const offerPath = (offerId, action = "") => `${INVENTORY_API}/offer/${encodeURIComponent(offerId)}${action}`;

export function listingUrl(listingId, environment = getEbayEnvironment()) {
  if (!listingId) return null;
  const host = environment === "production" ? "https://www.ebay.com" : "https://sandbox.ebay.com";
  return `${host}/itm/${encodeURIComponent(listingId)}`;
}

export function toClientEbayProduct(doc, { environment } = {}) {
  return {
    id: String(doc._id),
    marketplace: "ebay",
    accountId: String(doc.ebayAccount),
    origin: doc.origin,
    sku: doc.sku,
    title: doc.title,
    description: doc.description || "",
    condition: doc.condition || "NEW",
    conditionDescription: doc.conditionDescription || "",
    categoryId: doc.categoryId || "",
    categoryName: doc.categoryName || "",
    aspects: doc.aspects || {},
    imageUrls: doc.imageUrls || [],
    price: doc.price ?? null,
    currency: doc.currency || null,
    quantity: doc.quantity ?? 0,
    offerId: doc.offerId || null,
    listingId: doc.listingId || null,
    listingStatus: doc.listingStatus || "draft",
    listingUrl: listingUrl(doc.listingId, environment),
    publish: doc.publishRequested !== false,
    syncStatus: doc.syncStatus || "synced",
    lastSyncError: doc.lastSyncError || null,
    pendingOperation: doc.pendingOperation?.type
      ? { type: doc.pendingOperation.type, outcome: doc.pendingOperation.outcome || null }
      : null,
    archivedAt: doc.archivedAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function inventoryItemPayload(p) {
  return {
    availability: { shipToLocationAvailability: { quantity: p.quantity } },
    condition: p.condition,
    ...(p.conditionDescription ? { conditionDescription: p.conditionDescription } : {}),
    product: {
      title: p.title,
      ...(p.description ? { description: p.description } : {}),
      ...(Object.keys(p.aspects || {}).length ? { aspects: p.aspects } : {}),
      ...(p.imageUrls?.length ? { imageUrls: p.imageUrls } : {}),
    },
  };
}

// sku, marketplaceId and format can only be sent when the offer is created.
function offerPayload(p, account, currency, { create }) {
  const setup = account.setup || {};
  const policies = {
    ...(setup.fulfillmentPolicyId ? { fulfillmentPolicyId: setup.fulfillmentPolicyId } : {}),
    ...(setup.paymentPolicyId ? { paymentPolicyId: setup.paymentPolicyId } : {}),
    ...(setup.returnPolicyId ? { returnPolicyId: setup.returnPolicyId } : {}),
  };
  return {
    ...(create ? { sku: p.sku, marketplaceId: account.marketplaceId, format: "FIXED_PRICE" } : {}),
    availableQuantity: p.quantity,
    ...(p.categoryId ? { categoryId: p.categoryId } : {}),
    ...(p.description ? { listingDescription: p.description } : {}),
    ...(Object.keys(policies).length ? { listingPolicies: policies } : {}),
    ...(setup.merchantLocationKey ? { merchantLocationKey: setup.merchantLocationKey } : {}),
    pricingSummary: { price: { value: p.price.toFixed(2), currency } },
  };
}

export async function findOffer(client, sku) {
  try {
    const data = await client.get(`${INVENTORY_API}/offer`, { query: { sku, marketplace_id: client.marketplace.id } });
    return (data?.offers || []).find((o) => o.marketplaceId === client.marketplace.id) || null;
  } catch (error) {
    // eBay answers "This Offer is not available" (25713) when the SKU has none.
    if (error instanceof EbayApiError && (error.status === 404 || error.errors.some((e) => NO_OFFER_ERROR_IDS.has(Number(e.errorId))))) {
      return null;
    }
    throw error;
  }
}

function safeMessage(error) {
  if (error instanceof EbayApiError || error instanceof EbayProductError) {
    return String(error.message).slice(0, MAX_ERROR_LENGTH);
  }
  return "Unexpected error while contacting eBay.";
}

function toProductError(error, productId) {
  if (error instanceof EbayProductError) return error;
  if (error instanceof EbayApiError) {
    const status =
      error.code === "reauth_required" || error.code === "unauthorized"
        ? 409
        : error.code === "ebay_not_configured"
          ? 503
          : error.outcome === "unknown" || error.code === "network_error" || error.code === "ebay_unavailable"
            ? 502
            : 422;
    return new EbayProductError(error.code, error.message, status, { ebayErrors: error.errors, productId });
  }
  return null;
}

// Sends the product to eBay. `fields` is the validated form; `doc` the local record.
async function pushToEbay(client, account, doc, fields) {
  await client.put(skuPath(doc.sku), inventoryItemPayload(fields));

  // A first create attempt cannot have an offer yet, so it posts directly;
  // later attempts and imported items look the offer up by SKU.
  const firstCreate = doc.pendingOperation?.type === "create" && (doc.pendingOperation.attempts || 0) <= 1;
  let offerId = doc.offerId || (firstCreate ? null : (await findOffer(client, doc.sku))?.offerId) || null;
  if (offerId) {
    await client.put(offerPath(offerId), offerPayload(fields, account, client.marketplace.currency, { create: false }));
  } else {
    try {
      const created = await client.post(
        `${INVENTORY_API}/offer`,
        offerPayload({ ...fields, sku: doc.sku }, account, client.marketplace.currency, { create: true }),
      );
      offerId = created?.offerId;
    } catch (error) {
      // An earlier attempt created it but its response was lost.
      if (!(error instanceof EbayApiError && error.errors.some((e) => OFFER_EXISTS_ERROR_IDS.has(Number(e.errorId))))) throw error;
      offerId = (await findOffer(client, doc.sku))?.offerId;
      if (!offerId) throw error;
      await client.put(offerPath(offerId), offerPayload(fields, account, client.marketplace.currency, { create: false }));
    }
    if (!offerId) {
      throw new EbayApiError({ code: "ebay_rejected", message: "eBay did not return an offer ID." });
    }
    // Remember the offer at once, so a later failure keeps the link.
    await EbayProduct.updateOne({ _id: doc._id }, { $set: { offerId } });
  }

  let listingId = doc.listingId || null;
  let listingStatus = doc.listingStatus || "draft";
  if (fields.publish && listingStatus !== "published") {
    const published = await client.post(offerPath(offerId, "/publish"));
    listingId = published?.listingId || listingId;
    listingStatus = "published";
  } else if (!fields.publish && listingStatus === "published") {
    await client.post(offerPath(offerId, "/withdraw"));
    listingStatus = "ended";
  }

  return { offerId, listingId, listingStatus };
}

function storedFields(value, currency) {
  return {
    title: value.title,
    description: value.description,
    condition: value.condition,
    conditionDescription: value.conditionDescription,
    categoryId: value.categoryId,
    categoryName: value.categoryName,
    aspects: value.aspects,
    imageUrls: value.imageUrls,
    price: value.price,
    currency,
    quantity: value.quantity,
    publishRequested: value.publish,
  };
}

async function markSynced(doc, result, extra = {}) {
  return EbayProduct.findOneAndUpdate(
    { _id: doc._id },
    {
      $set: {
        ...result,
        ...extra,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
        ebayUpdatedAt: new Date(),
      },
      $unset: { pendingOperation: 1, lastSyncError: 1 },
    },
    { returnDocument: "after" },
  ).lean();
}

async function markFailed(doc, error) {
  await EbayProduct.updateOne(
    { _id: doc._id },
    {
      $set: {
        syncStatus: "failed",
        lastSyncError: safeMessage(error),
        "pendingOperation.outcome": error?.outcome === "unknown" ? "unknown" : "rejected",
      },
    },
  );
}

// Atomically marks the product as being written, unless another write is
// still running. Returns the claimed document or throws.
async function claimProduct(userId, id, type, input) {
  if (!mongoose.isValidObjectId(id)) throw new EbayProductError("not_found", "Product not found.", 404);
  const now = new Date();
  const claimed = await EbayProduct.findOneAndUpdate(
    {
      _id: id,
      user: userId,
      archivedAt: null,
      $or: [{ syncStatus: { $ne: "pending" } }, { "pendingOperation.startedAt": { $lt: new Date(now - WRITE_LEASE_MS) } }],
    },
    [
      {
        $set: {
          syncStatus: "pending",
          // A failed create stays a create until eBay confirms it.
          "pendingOperation.type": {
            $cond: [{ $and: [{ $eq: ["$pendingOperation.type", "create"] }, { $ne: [type, "delete"] }] }, "create", type],
          },
          "pendingOperation.startedAt": now,
          "pendingOperation.attempts": { $add: [{ $ifNull: ["$pendingOperation.attempts", 0] }, 1] },
          "pendingOperation.input": input === undefined ? "$pendingOperation.input" : { $literal: input },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true },
  );
  if (claimed) return claimed;

  const exists = await EbayProduct.exists({ _id: id, user: userId, archivedAt: null });
  if (!exists) throw new EbayProductError("not_found", "Product not found.", 404);
  throw new EbayProductError("write_in_progress", "Another change to this product is still being sent to eBay.", 409, { productId: id });
}

async function accountFor(userId, accountId, { requireSetup }) {
  const account = await getEbayAccountForUser(userId, { accountId, withTokens: true, includeReauth: true });
  if (!account) {
    throw new EbayProductError("no_ebay_account", "Connect an eBay account first.", 409);
  }
  if (account.status === "reauth_required") {
    throw new EbayProductError("reauth_required", "eBay authorization expired or was revoked. Reconnect eBay on the Integrations page.", 409);
  }
  if (requireSetup && !account.setup?.ready) {
    throw new EbayProductError(
      "setup_required",
      "Finish eBay setup (business policies and an inventory location) on the Integrations page before publishing.",
      409,
    );
  }
  return account;
}

async function writeAndRecord(account, doc, fields) {
  const client = createEbayClient(account);
  try {
    const result = await pushToEbay(client, account, doc, fields);
    return await markSynced(doc, result);
  } catch (error) {
    const productError = toProductError(error, String(doc._id));
    if (!productError) throw error;
    await markFailed(doc, error);
    throw productError;
  }
}

export async function createEbayProduct(userId, value) {
  const account = await accountFor(userId, value.accountId, { requireSetup: value.publish });

  const replay = await EbayProduct.findOne({ ebayAccount: account._id, idempotencyKey: value.idempotencyKey }).lean();
  if (replay) return { product: replay, status: 200, replay: true };

  if (await EbayProduct.exists({ ebayAccount: account._id, liveSku: value.sku })) {
    throw new EbayProductError("sku_taken", `SKU ${value.sku} is already used by another product.`, 409);
  }

  // Never overwrite an item the seller already has on eBay under this SKU.
  const client = createEbayClient(account);
  try {
    await client.get(skuPath(value.sku));
    throw new EbayProductError(
      "sku_exists_on_ebay",
      `SKU ${value.sku} already exists on your eBay account. Import it with “Sync eBay” or choose another SKU.`,
      409,
    );
  } catch (error) {
    if (error instanceof EbayProductError) throw error;
    if (!(error instanceof EbayApiError && error.status === 404)) {
      throw toProductError(error) || error;
    }
  }

  let doc;
  try {
    doc = await EbayProduct.create({
      user: userId,
      ebayAccount: account._id,
      sku: value.sku,
      liveSku: value.sku,
      origin: "smartsell",
      idempotencyKey: value.idempotencyKey,
      ...storedFields(value, client.marketplace.currency),
      listingStatus: "draft",
      syncStatus: "pending",
      pendingOperation: { type: "create", startedAt: new Date(), attempts: 1, input: value },
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await EbayProduct.findOne({ ebayAccount: account._id, idempotencyKey: value.idempotencyKey }).lean();
      if (existing) return { product: existing, status: 200, replay: true };
      throw new EbayProductError("sku_taken", `SKU ${value.sku} is already used by another product.`, 409);
    }
    throw error;
  }

  const product = await writeAndRecord(account, doc, value);
  return { product, status: 201 };
}

export async function getOwnedEbayProduct(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return EbayProduct.findOne({ _id: id, user: userId }).lean();
}

export async function updateEbayProduct(userId, id, value) {
  const current = await getOwnedEbayProduct(userId, id);
  if (!current || current.archivedAt) throw new EbayProductError("not_found", "Product not found.", 404);
  const account = await accountFor(userId, current.ebayAccount, { requireSetup: value.publish });

  const doc = await claimProduct(userId, id, "update", value);
  await EbayProduct.updateOne({ _id: doc._id }, { $set: storedFields(value, current.currency) });
  const product = await writeAndRecord(account, doc, value);
  return { product, status: 200 };
}

async function performDelete(account, doc) {
  const client = createEbayClient(account);
  try {
    await client.delete(skuPath(doc.sku));
  } catch (error) {
    // Already gone on eBay (or never reached it): nothing left to remove.
    if (!(error instanceof EbayApiError && error.status === 404)) {
      const productError = toProductError(error, String(doc._id));
      if (!productError) throw error;
      await markFailed(doc, error);
      throw productError;
    }
  }
  return EbayProduct.findOneAndUpdate(
    { _id: doc._id },
    {
      $set: { archivedAt: new Date(), archiveReason: "deleted_in_smartsell", syncStatus: "synced", listingStatus: "ended", lastSyncedAt: new Date() },
      $unset: { liveSku: 1, pendingOperation: 1, lastSyncError: 1 },
    },
    { returnDocument: "after" },
  ).lean();
}

export async function deleteEbayProduct(userId, id) {
  const current = await getOwnedEbayProduct(userId, id);
  if (!current || current.archivedAt) throw new EbayProductError("not_found", "Product not found.", 404);
  const account = await accountFor(userId, current.ebayAccount, { requireSetup: false });
  const doc = await claimProduct(userId, id, "delete");
  const product = await performDelete(account, doc);
  return { product, status: 200 };
}

// Repeats a failed or unconfirmed write with the input that was sent.
export async function retryEbayProduct(userId, id) {
  const current = await getOwnedEbayProduct(userId, id);
  if (!current || current.archivedAt) throw new EbayProductError("not_found", "Product not found.", 404);
  if (current.syncStatus === "synced" || !current.pendingOperation?.type) {
    return { product: current, status: 200, nothingToRetry: true };
  }
  const input = current.pendingOperation.input;
  const type = current.pendingOperation.type;
  const account = await accountFor(userId, current.ebayAccount, { requireSetup: type !== "delete" && input?.publish });
  const doc = await claimProduct(userId, id, type);
  if (type === "delete") {
    return { product: await performDelete(account, doc), status: 200 };
  }
  if (!input) throw new EbayProductError("cannot_retry", "This change cannot be retried. Edit the product and save again.", 409);
  return { product: await writeAndRecord(account, doc, input), status: 200 };
}
