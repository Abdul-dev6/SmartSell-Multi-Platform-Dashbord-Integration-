import mongoose from "mongoose";
import AmazonOrder from "@/models/AmazonOrder";
import { amazonRoute, intParam, ok, searchParams } from "@/lib/amazon/http";

// GET ?accountId&status&marketplaceId&page&pageSize — the seller's Amazon
// orders from SmartSell's synced copy (Orders API 2026-01-01). No buyer data
// is stored, so none can be returned.
export const GET = amazonRoute(async ({ req, user }) => {
  const p = searchParams(req);
  const filter = { user: user._id };
  const accountId = p.get("accountId");
  if (accountId) {
    if (!mongoose.isValidObjectId(accountId)) return ok({ items: [], total: 0, page: 1 });
    filter.amazonAccount = accountId;
  }
  if (/^[A-Z_]{3,30}$/.test(p.get("status") || "")) filter.status = p.get("status");
  if (/^[A-Z0-9]{10,16}$/.test(p.get("marketplaceId") || "")) filter.marketplaceId = p.get("marketplaceId");
  const page = intParam(p.get("page"), 1);
  const pageSize = Math.min(intParam(p.get("pageSize"), 25), 100);
  const [items, total] = await Promise.all([
    AmazonOrder.find(filter).sort({ createdTime: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    AmazonOrder.countDocuments(filter),
  ]);
  return ok({
    page,
    pageSize,
    total,
    items: items.map((o) => ({
      id: String(o._id),
      accountId: String(o.amazonAccount),
      orderId: o.orderId,
      marketplaceId: o.marketplaceId || null,
      salesChannel: o.salesChannel || null,
      createdTime: o.createdTime || null,
      lastUpdatedTime: o.lastUpdatedTime || null,
      status: o.status || null,
      fulfilledBy: o.fulfilledBy || null,
      total: o.total || null,
      items: (o.items || []).map((i) => ({
        orderItemId: i.orderItemId,
        asin: i.asin || null,
        sellerSku: i.sellerSku || null,
        title: i.title || null,
        quantityOrdered: i.quantityOrdered ?? null,
        quantityFulfilled: i.quantityFulfilled ?? null,
        unitPrice: i.unitPrice || null,
        cancelled: Boolean(i.cancelled),
      })),
    })),
  });
}, { label: "amazon_orders_failed" });
