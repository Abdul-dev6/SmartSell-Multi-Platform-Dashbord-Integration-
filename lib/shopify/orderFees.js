import Order from "@/models/Order";
import { shopifyGraphql } from "@/lib/shopify/graphql";

// Payment processing fees per order: the sum of TransactionFee amounts on
// the order's transactions (Shopify Payments; other gateways report none).
// Read in batches via `nodes`, needs read_orders only.
const BATCH = 50;

const ORDER_FEES = `
  query SmartSellOrderFees($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        legacyResourceId
        transactions(first: 20) { fees { amount { amount } } }
      }
    }
  }`;

// Map of order ID -> total fees for the given numeric order IDs.
export async function fetchOrderFees(client, orderIds) {
  const fees = new Map();
  const ids = [...new Set(orderIds.map(String))];
  for (let i = 0; i < ids.length; i += BATCH) {
    const data = await shopifyGraphql(
      client,
      ORDER_FEES,
      { ids: ids.slice(i, i + BATCH).map((id) => `gid://shopify/Order/${id}`) },
      { idempotent: true },
    );
    for (const node of data.nodes || []) {
      if (!node?.legacyResourceId) continue;
      const total = (node.transactions || [])
        .flatMap((t) => t.fees || [])
        .reduce((sum, f) => sum + Number(f.amount?.amount || 0), 0);
      fees.set(String(node.legacyResourceId), Math.round(total * 100) / 100);
    }
  }
  return fees;
}

// Reads and stores fees for these orders. Returns how many were updated.
export async function refreshOrderFees(client, store, orderIds) {
  if (!orderIds.length) return 0;
  const fees = await fetchOrderFees(client, orderIds);
  if (!fees.size) return 0;
  const result = await Order.bulkWrite(
    [...fees].map(([shopifyOrderId, amount]) => ({
      updateOne: { filter: { shopifyStore: store._id, shopifyOrderId }, update: { $set: { shopifyFees: amount } } },
    })),
    { ordered: false },
  );
  return result.modifiedCount;
}
