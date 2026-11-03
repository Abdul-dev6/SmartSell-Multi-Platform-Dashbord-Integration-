import { getNextPageUrl } from "@/lib/shopify/pagination";
import { logError } from "@/lib/observability/log";

const SAFE_ORDER_FIELDS = [
  "id",
  "name",
  "order_number",
  "created_at",
  "updated_at",
  "cancelled_at",
  "financial_status",
  "fulfillment_status",
  "total_price",
  "current_total_price",
  "subtotal_price",
  "total_tax",
  "total_discounts",
  "currency",
  "line_items",
  "tags",
  "customer",
].join(",");

// Fetches one page of orders. `updatedAtMin` limits the first page to orders
// changed since then; the next-page URL from Shopify already carries filters.
export async function Getorders(client, nextPageUrl = null, { updatedAtMin } = {}) {
  try {
    const url = nextPageUrl || "/orders.json";
    const params = nextPageUrl
      ? {}
      : {
          limit: 250,
          status: "any",
          fields: SAFE_ORDER_FIELDS,
          ...(updatedAtMin ? { updated_at_min: updatedAtMin.toISOString() } : {}),
        };
    const response = await client.get(url, { params });
    const orders = response.data?.orders || [];
    const nextUrl = getNextPageUrl(response.headers?.link);
    return { orders, nextUrl };
  } catch (error) {
    // Status only: Shopify error bodies can echo request data.
    logError(null, "shopify_orders_request_failed", error);
    throw error;
  }
}
