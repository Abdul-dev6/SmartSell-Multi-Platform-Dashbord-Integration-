import Product from "@/models/Product";
import Shopifystore from "@/models/ShopifyStore";
import { upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { upsertShopifyOrders } from "@/lib/shopify/ordersync";
import { upsertInventoryLevel } from "@/lib/shopify/syncinventory";

// Topics SmartSell subscribes to. Anything else is acknowledged and ignored.
export const SUPPORTED_TOPICS = new Set([
  "products/create",
  "products/update",
  "products/delete",
  "orders/create",
  "orders/updated",
  "inventory_levels/update",
  "app/uninstalled",
]);

const pick = (source, keys) =>
  Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));

// Only the order fields SmartSell stores (see mapShopifyOrder); addresses,
// phone numbers, notes and payment details are dropped before saving.
function minimalOrder(order) {
  return {
    ...pick(order, [
      "id", "name", "order_number", "created_at", "updated_at", "cancelled_at",
      "financial_status", "fulfillment_status", "total_price", "current_total_price",
      "subtotal_price", "total_tax", "total_discounts", "currency",
    ]),
    line_items: (order.line_items || []).map((item) =>
      pick(item, ["product_id", "variant_id", "title", "variant_title", "sku", "quantity", "price"]),
    ),
    customer: order.customer ? pick(order.customer, ["first_name", "last_name", "email"]) : null,
  };
}

// What is stored from each payload. Product payloads hold no customer data;
// app/uninstalled carries shop contact details, so only the shop ID is kept.
export function storablePayload(topic, payload) {
  if (topic === "app/uninstalled") {
    return { id: payload?.id ?? null };
  }
  if (topic.startsWith("orders/")) {
    return minimalOrder(payload);
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

// Order create/update (including cancellation, payment and fulfillment changes).
async function handleOrderUpsert(event, store) {
  const result = await upsertShopifyOrders(store, [event.payload]);
  if (result.inserted) return "created";
  if (result.skippedStale) return "skipped_stale";
  return "updated";
}

async function handleInventoryLevel(event, store) {
  const result = await upsertInventoryLevel(store, event.payload);
  if (result.inserted) return "created";
  if (result.skippedStale) return "skipped_stale";
  return "updated";
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
    case "orders/create":
    case "orders/updated":
      return handleOrderUpsert(event, store);
    case "inventory_levels/update":
      return handleInventoryLevel(event, store);
    case "app/uninstalled":
      return handleAppUninstalled(event, store);
    default:
      return "ignored_topic";
  }
}
