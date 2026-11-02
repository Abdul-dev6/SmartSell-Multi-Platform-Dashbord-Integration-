import Order from "@/models/Order";
import { Getorders } from "./order";
import { bulkUpsert, notNewerThan } from "./bulkUpsert";

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

// Syncs all orders, or only those updated since `updatedAtMin`.
export async function syncOrders(client, store, { updatedAtMin } = {}) {
  const syncedAt = new Date();
  let count = 0;
  let nextPageUrl = null;

  do {
    const result = await Getorders(client, nextPageUrl, { updatedAtMin });
    await upsertShopifyOrders(store, result.orders, syncedAt);
    count += result.orders.length;
    nextPageUrl = result.nextUrl;
  } while (nextPageUrl);

  return { count };
}
