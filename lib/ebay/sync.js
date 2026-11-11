import EbayAccount from "@/models/EbayAccount";
import EbayProduct from "@/models/EbayProduct";
import { createEbayClient, EbayApiError } from "@/lib/ebay/client";
import { findOffer } from "@/lib/ebay/products/service";

// Imports the seller's eBay inventory items (and their offers) into
// SmartSell, and archives local products that no longer exist on eBay.
// Products with a SmartSell write still pending or failed are left alone so
// the seller's unsent changes are never overwritten.

const PAGE_SIZE = 100;
export const MAX_ITEMS = 2000;
const LOCK_MS = 5 * 60 * 1000;

function listingStatusOf(offer) {
  if (!offer) return "draft";
  if (offer.status === "PUBLISHED") return "published";
  if (offer.listing?.listingStatus === "ENDED") return "ended";
  return "draft";
}

function fieldsFrom(item, offer, currency) {
  const product = item.product || {};
  const price = Number(offer?.pricingSummary?.price?.value);
  const fields = {
    title: String(product.title || item.sku).slice(0, 80),
    description: offer?.listingDescription || product.description || "",
    condition: item.condition || "NEW",
    conditionDescription: item.conditionDescription || "",
    aspects: product.aspects || {},
    imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls.slice(0, 24) : [],
    quantity: Number(item.availability?.shipToLocationAvailability?.quantity ?? offer?.availableQuantity ?? 0) || 0,
    ...(Number.isFinite(price) ? { price } : {}),
    currency: offer?.pricingSummary?.price?.currency || currency,
    categoryId: offer?.categoryId || "",
    offerId: offer?.offerId || undefined,
    listingId: offer?.listing?.listingId || undefined,
    listingStatus: listingStatusOf(offer),
    publishRequested: listingStatusOf(offer) === "published",
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

async function lockAccount(accountId, now) {
  return EbayAccount.findOneAndUpdate(
    { _id: accountId, status: "active", $or: [{ syncLockedUntil: null }, { syncLockedUntil: { $lt: now } }] },
    { $set: { syncLockedUntil: new Date(now.getTime() + LOCK_MS) } },
    { returnDocument: "after" },
  ).select("+refreshTokenEnc +accessTokenEnc");
}

export async function syncEbayAccount(accountId, { now = new Date(), retryDelayMs } = {}) {
  const account = await lockAccount(accountId, now);
  if (!account) return { locked: true };

  const counts = { products: 0, archivedProducts: 0 };
  try {
    const client = createEbayClient(account, retryDelayMs === undefined ? {} : { retryDelayMs });
    const seen = new Set();
    let offset = 0;
    let total = Infinity;
    let truncated = false;

    while (offset < total) {
      if (offset >= MAX_ITEMS) {
        truncated = true;
        break;
      }
      const page = await client.get("/sell/inventory/v1/inventory_item", { query: { limit: PAGE_SIZE, offset } });
      const items = page?.inventoryItems || [];
      total = Number(page?.total ?? items.length);
      if (!items.length) break;

      for (const item of items) {
        if (!item?.sku) continue;
        seen.add(item.sku);
        const offer = await findOffer(client, item.sku);
        const fields = fieldsFrom(item, offer, client.marketplace.currency);

        const existing = await EbayProduct.findOne({ ebayAccount: account._id, liveSku: item.sku }).select("syncStatus").lean();
        if (existing && existing.syncStatus !== "synced") continue;

        await EbayProduct.updateOne(
          { ebayAccount: account._id, liveSku: item.sku },
          {
            $set: { ...fields, syncStatus: "synced", lastSyncedAt: now, ebayUpdatedAt: now },
            $setOnInsert: { user: account.user, sku: item.sku, origin: "ebay" },
          },
          { upsert: true },
        );
        counts.products += 1;
      }
      offset += items.length;
    }

    // Only a complete scan can tell what was deleted on eBay.
    if (!truncated) {
      const gone = await EbayProduct.updateMany(
        { ebayAccount: account._id, archivedAt: null, liveSku: { $type: "string", $nin: [...seen] }, syncStatus: "synced" },
        {
          $set: { archivedAt: now, archiveReason: "deleted_in_ebay", listingStatus: "ended" },
          $unset: { liveSku: 1 },
        },
      );
      counts.archivedProducts = gone.modifiedCount;
    }

    const status = truncated ? "partial" : "success";
    await EbayAccount.updateOne(
      { _id: account._id },
      {
        $set: {
          lastSyncAt: now,
          lastSyncStatus: status,
          lastSyncCounts: counts,
          ...(truncated ? { lastSyncError: `Only the first ${MAX_ITEMS} eBay items were imported.` } : {}),
        },
        ...(truncated ? {} : { $unset: { lastSyncError: 1 } }),
      },
    );
    return { status, counts, truncated };
  } catch (error) {
    const message = error instanceof EbayApiError ? error.message : "Unexpected error while importing from eBay.";
    await EbayAccount.updateOne(
      { _id: account._id },
      { $set: { lastSyncAt: now, lastSyncStatus: "failed", lastSyncError: String(message).slice(0, 300), lastSyncCounts: counts } },
    );
    throw error;
  } finally {
    await EbayAccount.updateOne({ _id: account._id }, { $unset: { syncLockedUntil: 1 } });
  }
}
