import Order from "@/models/Order";
import { Getorders, getOrdersByIds } from "@/lib/shopify/order";
import { bulkUpsert, notNewerThan } from "@/lib/shopify/bulkUpsert";
import { getNextPageUrl } from "@/lib/shopify/pagination";
import { refreshOrderFees } from "@/lib/shopify/orderFees";
import { logWarn } from "@/lib/observability/log";

const toNumber = (value) =>
  value === null || value === undefined || value === "" ? null : Number(value);
const toDate = (value) => (value ? new Date(value) : null);

function customerSummary(customer) {
  if (!customer) {
    return { name: null, email: null };
  }
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  return { name: name || null, email: customer.email || null };
}

// Maps a Shopify REST order to the fields stored in MongoDB. Addresses and
// the raw payload are deliberately not stored.
export function mapShopifyOrder(order) {
  return {
    shopifyOrderId: String(order.id),
    orderNumber: order.order_number ? String(order.order_number) : null,
    name: order.name || null,
    customer: customerSummary(order.customer),
    lineItems: (order.line_items || []).map((item) => ({
      productId: item.product_id ? String(item.product_id) : null,
      variantId: item.variant_id ? String(item.variant_id) : null,
      title: item.title || "",
      variantTitle: item.variant_title || null,
      sku: item.sku || null,
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
      // Still to ship; quantity minus this has been shipped. null = unknown.
      fulfillableQuantity: item.fulfillable_quantity === undefined || item.fulfillable_quantity === null ? null : Number(item.fulfillable_quantity),
    })),
    currency: order.currency || null,
    totalPrice: Number(order.total_price || 0),
    currentTotalPrice: toNumber(order.current_total_price),
    subtotalPrice: toNumber(order.subtotal_price),
    totalTax: toNumber(order.total_tax),
    totalDiscounts: toNumber(order.total_discounts),
    financialStatus: order.financial_status || null,
    fulfillmentStatus: order.fulfillment_status || null,
    cancelledAt: toDate(order.cancelled_at),
    shopifyCreatedAt: toDate(order.created_at),
    shopifyUpdatedAt: toDate(order.updated_at),
  };
}

export async function upsertShopifyOrders(store, orders, syncedAt = new Date()) {
  const ops = orders.map((order) => {
    const doc = mapShopifyOrder(order);
    return {
      updateOne: {
        filter: {
          shopifyStore: store._id,
          shopifyOrderId: doc.shopifyOrderId,
          ...notNewerThan("shopifyUpdatedAt", doc.shopifyUpdatedAt),
        },
        update: {
          $set: {
            ...doc,
            user: store.user,
            shopifyStore: store._id,
            lastSyncedAt: syncedAt,
          },
        },
        upsert: true,
      },
    };
  });

  return bulkUpsert(Order, ops);
}

// Shopify only lists the last 60 days of orders without read_all_orders, so
// deletions are only detected inside a slightly smaller window. Older stored
// orders are never touched.
export const ORDER_RECONCILE_WINDOW_DAYS = 55;

async function fetchOrderIdsSince(client, createdAtMin) {
  const ids = new Set();
  let url = "/orders.json";
  let params = { status: "any", fields: "id", limit: 250, created_at_min: createdAtMin.toISOString() };
  while (url) {
    const response = await client.get(url, { params });
    for (const order of response.data?.orders || []) ids.add(String(order.id));
    url = getNextPageUrl(response.headers?.link);
    params = {}; // the next-page URL already carries the filters
  }
  return ids;
}

// Marks stored orders that Shopify no longer lists as deleted (for when the
// orders/delete webhook was missed). Runs only after the full ID listing
// succeeded. Orders written after it started are left alone, and an order
// Shopify does list is un-marked if an earlier pass marked it.
export async function reconcileDeletedOrders(client, store, { now = new Date() } = {}) {
  const windowStart = new Date(now.getTime() - ORDER_RECONCILE_WINDOW_DAYS * 86400000);
  const ids = [...(await fetchOrderIdsSince(client, windowStart))];

  const restored = await Order.updateMany(
    { shopifyStore: store._id, shopifyOrderId: { $in: ids }, deletedAt: { $ne: null, $lt: now } },
    { $unset: { deletedAt: 1 } },
  );
  const deleted = await Order.updateMany(
    {
      shopifyStore: store._id,
      deletedAt: null,
      shopifyOrderId: { $nin: ids },
      // An hour inside the window, to stay clear of its edge.
      shopifyCreatedAt: { $gte: new Date(windowStart.getTime() + 3600000), $lt: now },
      $or: [{ lastSyncedAt: { $lt: now } }, { lastSyncedAt: null }],
    },
    { $set: { deletedAt: now } },
  );
  return { checked: ids.length, deleted: deleted.modifiedCount, restored: restored.modifiedCount };
}

// Syncs all orders, or only those updated since `updatedAtMin`.
export async function syncOrders(client, store, { updatedAtMin } = {}) {
  const syncedAt = new Date();
  let count = 0;
  let nextPageUrl = null;

  do {
    const result = await Getorders(client, nextPageUrl, { updatedAtMin });
    await upsertShopifyOrders(store, result.orders, syncedAt);
    // Payment fees (for calculated expenses). Best effort: a failed read
    // leaves fees unknown until the next sync and never fails the sync.
    await refreshOrderFees(client, store, result.orders.map((o) => o.id)).catch((error) =>
      logWarn(null, "order_fees_read_failed", error, { message: false, shop: store.shop }),
    );
    count += result.orders.length;
    nextPageUrl = result.nextUrl;
  } while (nextPageUrl);

  return { count };
}

// Orders stored before SmartSell recorded payment fees and shipped
// quantities lack them, and an incremental sync only re-reads changed
// orders. This re-reads up to `limit` such orders per sync; once every order
// has them it finds nothing and makes no Shopify call.
export async function backfillOrderDetails(client, store, { limit = 250 } = {}) {
  const missing = await Order.find({
    shopifyStore: store._id,
    deletedAt: null,
    $or: [{ shopifyFees: { $exists: false } }, { "lineItems.fulfillableQuantity": { $exists: false } }],
  })
    .select("shopifyOrderId")
    .limit(limit)
    .lean();
  if (!missing.length) return { checked: 0 };

  const ids = missing.map((o) => o.shopifyOrderId);
  const orders = await getOrdersByIds(client, ids);
  await upsertShopifyOrders(store, orders);
  await refreshOrderFees(client, store, ids);
  // Orders Shopify no longer returns (e.g. older than its 60-day window)
  // keep their data; mark what is still missing as unknown (fees 0, shipped
  // quantity null) so they are not re-read on every sync.
  await Order.updateMany(
    { shopifyStore: store._id, shopifyOrderId: { $in: ids }, shopifyFees: { $exists: false } },
    { $set: { shopifyFees: 0 } },
  );
  await Order.updateMany(
    { shopifyStore: store._id, shopifyOrderId: { $in: ids }, "lineItems.fulfillableQuantity": { $exists: false } },
    { $set: { "lineItems.$[line].fulfillableQuantity": null } },
    { arrayFilters: [{ "line.fulfillableQuantity": { $exists: false } }] },
  );
  return { checked: ids.length };
}
