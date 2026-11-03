import Product from "@/models/Product";
import Order from "@/models/Order";
import Shopifystore from "@/models/ShopifyStore";
import { upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { createClient } from "@/lib/shopify/client";
import { fetchProduct } from "@/lib/shopify/products";
import { canReadPublications } from "@/lib/shopify/scopes";
import { logWarn } from "@/lib/observability/log";
import { upsertShopifyOrders } from "@/lib/shopify/ordersync";
import { disconnectInventoryLevel, upsertInventoryLevel } from "@/lib/shopify/syncinventory";

// Topics SmartSell subscribes to. Anything else is acknowledged and ignored.
export const SUPPORTED_TOPICS = new Set([
  "products/create",
  "products/update",
  "products/delete",
  "orders/create",
  "orders/updated",
  "orders/delete",
  "inventory_levels/update",
  "inventory_levels/connect",
  "inventory_levels/disconnect",
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
  await enrichFromShopify(event, store);
  if (result.inserted) return "created";
  if (result.skippedStale) return "skipped_stale";
  return "updated";
}

// Product webhook payloads carry no collections, sales channels or variant
// shipping fields (and changes to those still fire products/update). The
// product is re-read from Shopify so they stay current. Best effort: the
// payload is already applied, and a failed read is repaired by the next sync.
async function enrichFromShopify(event, store) {
  if (!store.accessToken) return;
  try {
    const client = createClient(store.shop, store.accessToken);
    const live = await fetchProduct(client, event.payload.id, { publications: canReadPublications(store) });
    // null = deleted meanwhile; the products/delete event handles that.
    if (live) await upsertShopifyProducts(store, [live], new Date(), { authoritative: true });
  } catch (error) {
    logWarn(null, "webhook_product_enrich_failed", error, {
      message: false,
      webhookId: event.webhookId,
      shop: store.shop,
    });
  }
}

// Product delete: archive (never remove) the local record. The deletion time
// is recorded as the record's Shopify timestamp, so a late create/update
// delivery for the same product is recognised as stale and ignored.
async function handleProductDelete(event, store) {
  const shopifyProductId = String(event.payload.id);
  const deletedAt = event.triggeredAt || event.receivedAt || new Date();
  const filter = { shopifyStore: store._id, shopifyProductId };
  // The product is gone from Shopify, so any SmartSell operation still open on
  // it is finished (a delete whose response was lost) or moot (an edit).
  const settled = {
    $set: { syncStatus: "synced", lastSyncError: null, lastSyncedAt: new Date() },
    $unset: { pendingOperation: 1 },
    $max: { shopifyUpdatedAt: deletedAt },
  };
  const archive = (archiveReason) => ({
    ...settled,
    $set: { ...settled.$set, archivedAt: deletedAt, archiveReason },
  });

  // A SmartSell delete whose response was lost: Shopify confirms it here.
  let result = await Product.updateOne(
    { ...filter, archivedAt: null, "pendingOperation.type": "delete" },
    archive("deleted_in_smartsell"),
  );
  if (!result.matchedCount) {
    result = await Product.updateOne({ ...filter, archivedAt: null }, archive("deleted_in_shopify"));
  }
  if (result.matchedCount) return "archived";

  // Already archived (by SmartSell or a full sync): still record the deletion
  // time, so a delayed create/update delivery is recognised as stale.
  const existing = await Product.updateOne(filter, settled);
  if (existing.matchedCount) {
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

// Order deleted in Shopify: keep the record but mark it, so it leaves every
// view and figure. If the delete arrives before the create, a marked
// placeholder is stored; the late create fills it in and it stays deleted.
async function handleOrderDelete(event, store) {
  const deletedAt = event.triggeredAt || event.receivedAt || new Date();
  try {
    const result = await Order.updateOne(
      { shopifyStore: store._id, shopifyOrderId: String(event.payload.id), deletedAt: null },
      { $set: { deletedAt }, $setOnInsert: { user: store.user, totalPrice: 0 } },
      { upsert: true },
    );
    return result.upsertedCount ? "tombstoned" : "deleted";
  } catch (error) {
    // Already marked deleted: the filter missed and the insert hit the unique index.
    if (error?.code === 11000) return "already_deleted";
    throw error;
  }
}

// inventory_levels/update and /connect. A connect payload may lack
// updated_at; the event time stands in so ordering still works.
async function handleInventoryLevel(event, store) {
  const level = {
    ...event.payload,
    updated_at: event.payload.updated_at || (event.triggeredAt ? new Date(event.triggeredAt).toISOString() : null),
  };
  const result = await upsertInventoryLevel(store, level);
  if (result.inserted) return "created";
  if (result.skippedStale) return "skipped_stale";
  return "updated";
}

async function handleInventoryDisconnect(event, store) {
  const at = event.triggeredAt || event.receivedAt || new Date();
  const result = await disconnectInventoryLevel(store, event.payload, at);
  if (result.skippedStale) return "skipped_stale";
  return result.inserted ? "tombstoned" : "disconnected";
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
    case "orders/delete":
      return handleOrderDelete(event, store);
    case "inventory_levels/update":
    case "inventory_levels/connect":
      return handleInventoryLevel(event, store);
    case "inventory_levels/disconnect":
      return handleInventoryDisconnect(event, store);
    case "app/uninstalled":
      return handleAppUninstalled(event, store);
    default:
      return "ignored_topic";
  }
}
