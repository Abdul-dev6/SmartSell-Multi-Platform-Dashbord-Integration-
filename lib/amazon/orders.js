// Orders API 2026-01-01: searchOrders (the current version; v0 is deprecated).
//
// Privacy: only the data sets below are requested. The order datasets that
// carry the buyer's identity or delivery address, packages (ship-from
// addresses) and payment data are never requested, and no Restricted Data
// Token is used. Responses are mapped through an explicit allowlist; anything
// else Amazon sends is dropped, and raw responses are never stored.
export const ORDER_INCLUDED_DATA = Object.freeze(["PROCEEDS", "FULFILLMENT", "CANCELLATION"]);

const str = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const date = (v) => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const money = (m) => {
  const amount = typeof m?.amount === "string" ? Number(m.amount) : m?.amount;
  return Number.isFinite(amount) && str(m?.currencyCode, 3) ? { amount, currency: m.currencyCode } : null;
};
const int = (v) => (Number.isInteger(v) ? v : null);

export function toSafeOrderItem(item) {
  const orderItemId = str(item?.orderItemId, 60);
  if (!orderItemId) return null;
  const product = item.product || {};
  return {
    orderItemId,
    asin: str(product.asin, 20),
    sellerSku: str(product.sellerSku, 200),
    title: str(product.title, 500),
    quantityOrdered: int(item.quantityOrdered),
    quantityFulfilled: int(item.fulfillment?.quantityFulfilled),
    quantityUnfulfilled: int(item.fulfillment?.quantityUnfulfilled),
    unitPrice: money(product.price?.unitPrice),
    proceeds: money(item.proceeds?.proceedsTotal),
    cancelled: Boolean(item.cancellation?.cancellationExecution || item.cancellation?.cancellationRequest) || undefined,
  };
}

export function toSafeOrder(order) {
  const orderId = str(order?.orderId, 40);
  if (!orderId) return null;
  return {
    orderId,
    marketplaceId: str(order.salesChannel?.marketplaceId, 20),
    salesChannel: str(order.salesChannel?.channelName, 60),
    createdTime: date(order.createdTime),
    lastUpdatedTime: date(order.lastUpdatedTime),
    status: str(order.fulfillment?.fulfillmentStatus, 40),
    fulfilledBy: str(order.fulfillment?.fulfilledBy, 20),
    total: money(order.proceeds?.grandTotal),
    items: (Array.isArray(order.orderItems) ? order.orderItems : []).map(toSafeOrderItem).filter(Boolean),
  };
}

// One page of orders updated after `lastUpdatedAfter`, for the account's
// marketplaces (paginationToken pagination). lastUpdatedBefore is the
// response's upper bound: the next incremental sync starts from it.
export async function searchOrdersPage(client, { marketplaceIds, lastUpdatedAfter, paginationToken, maxResultsPerPage = 100 }) {
  const data = await client.get("searchOrders", "/orders/2026-01-01/orders", {
    lastUpdatedAfter: lastUpdatedAfter.toISOString(),
    marketplaceIds,
    includedData: ORDER_INCLUDED_DATA,
    maxResultsPerPage,
    paginationToken,
  });
  return {
    orders: (Array.isArray(data?.orders) ? data.orders : []).map(toSafeOrder).filter(Boolean),
    nextToken: str(data?.pagination?.nextToken, 4096),
    lastUpdatedBefore: date(data?.lastUpdatedBefore),
  };
}
