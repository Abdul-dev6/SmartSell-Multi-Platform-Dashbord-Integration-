import Product from "@/models/Products";
import Shopifystore from "@/models/ShopifyUser";
import { upsertShopifyProducts } from "@/lib/Shopify/syncProduct";

// Topics SmartSell subscribes to. Anything else is acknowledged and ignored.
export const SUPPORTED_TOPICS = new Set([
  "products/create",
  "products/update",
  "products/delete",
  "app/uninstalled",
]);

// What is stored from each payload. Product payloads hold no customer data;
// app/uninstalled carries shop contact details, so only the shop ID is kept.
export function storablePayload(topic, payload) {
  if (topic === "app/uninstalled") {
    return { id: payload?.id ?? null };
  }
  return payload;
}

// Product create/update: idempotent upsert guarded by updated_at, so duplicate
// or out-of-order deliveries never overwrite newer data or create duplicates.
async function handleProductUpsert(event, store) {
  const result = await upsertShopifyProducts(store, [event.payload]);
  if (result.inserted) return "created";
  if (result.skippedStale) return "skipped_stale";
  return "updated";
}

// Product delete: archive (never remove) the local record. The deletion time
// is recorded as the record's Shopify timestamp, so a late create/update
// delivery for the same product is recognised as stale and ignored.
async function handleProductDelete(event, store) {
  const shopifyProductId = String(event.payload.id);
  const deletedAt = event.triggeredAt || event.receivedAt || new Date();

  const result = await Product.updateOne(
    { shopifyStore: store._id, shopifyProductId, archivedAt: null },
    {
      $set: {
        archivedAt: deletedAt,
        archiveReason: "deleted_in_shopify",
        lastSyncedAt: new Date(),
      },
      $max: { shopifyUpdatedAt: deletedAt },
    },
  );
  if (result.matchedCount) return "archived";

  if (await Product.exists({ shopifyStore: store._id, shopifyProductId })) {
    return "already_archived";
  }

  // Delete arrived before (or without) the create: keep a tombstone so a
  // delayed create delivery cannot bring the product back.
  try {
    await Product.create({
      user: store.user,
      shopifyStore: store._id,
      shopifyProductId,
      title: `Deleted product ${shopifyProductId}`,
      origin: "shopify",
      syncStatus: "synced",
      archivedAt: deletedAt,
      archiveReason: "deleted_in_shopify",
      shopifyUpdatedAt: deletedAt,
      lastSyncedAt: new Date(),
    });
    return "tombstoned";
  } catch (error) {
    if (error?.code === 11000) return "already_archived";
    throw error;
  }
}

// The merchant uninstalled the app in Shopify: the token is no longer valid.
async function handleAppUninstalled(event, store) {
  await Shopifystore.updateOne(
    { _id: store._id },
    {
      $set: { status: "disconnected", disconnectedAt: new Date(), "webhooks.status": "inactive" },
      $unset: { accessToken: 1 },
    },
  );
  return "store_disconnected";
}

export async function handleWebhookEvent(event, store) {
  switch (event.topic) {
    case "products/create":
    case "products/update":
      return handleProductUpsert(event, store);
    case "products/delete":
      return handleProductDelete(event, store);
    case "app/uninstalled":
      return handleAppUninstalled(event, store);
    default:
      return "ignored_topic";
  }
}
