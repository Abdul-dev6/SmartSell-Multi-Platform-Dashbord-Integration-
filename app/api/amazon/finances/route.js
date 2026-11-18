import mongoose from "mongoose";
import AmazonFinancialEvent from "@/models/AmazonFinancialEvent";
import { amazonRoute, intParam, ok, searchParams } from "@/lib/amazon/http";

// GET ?accountId&kind=transaction|event_group&page — the seller's Amazon
// financial data from SmartSell's synced copy: transactions (Finances API
// 2024-06-19) and settlement groups (v0), plus totals per currency and type.
// Net profit is not calculated: SmartSell has no Amazon product costs, so a
// profit figure would be misleading.
export const GET = amazonRoute(async ({ req, user }) => {
  const p = searchParams(req);
  const scope = { user: user._id };
  const accountId = p.get("accountId");
  if (accountId) {
    if (!mongoose.isValidObjectId(accountId)) return ok({ items: [], total: 0, totals: [] });
    scope.amazonAccount = new mongoose.Types.ObjectId(accountId);
  }
  const kind = p.get("kind") === "event_group" ? "event_group" : "transaction";
  const page = intParam(p.get("page"), 1);
  const pageSize = Math.min(intParam(p.get("pageSize"), 25), 100);
  const filter = { ...scope, kind };
  const [items, total, totals] = await Promise.all([
    AmazonFinancialEvent.find(filter).sort({ postedDate: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    AmazonFinancialEvent.countDocuments(filter),
    AmazonFinancialEvent.aggregate([
      { $match: { ...scope, kind: "transaction", "total.currency": { $type: "string" } } },
      { $group: { _id: { currency: "$total.currency", type: "$transactionType" }, amount: { $sum: "$total.amount" }, count: { $sum: 1 } } },
      { $sort: { "_id.currency": 1, "_id.type": 1 } },
    ]),
  ]);
  return ok({
    kind,
    page,
    pageSize,
    total,
    items: items.map((e) => ({
      id: String(e._id),
      accountId: String(e.amazonAccount),
      kind: e.kind,
      eventId: e.eventId,
      type: e.transactionType || null,
      status: e.transactionStatus || e.processingStatus || null,
      description: e.description || null,
      postedDate: e.postedDate || null,
      marketplaceId: e.marketplaceId || null,
      orderId: e.orderId || null,
      total: e.total || null,
      breakdowns: e.breakdowns || [],
      fundTransferStatus: e.fundTransferStatus || null,
      fundTransferDate: e.fundTransferDate || null,
      groupStart: e.groupStart || null,
      groupEnd: e.groupEnd || null,
    })),
    totals: totals.map((t) => ({ currency: t._id.currency, type: t._id.type || "Other", amount: Math.round(t.amount * 100) / 100, count: t.count })),
    netProfit: null,
    netProfitNote: "Net profit is not calculated: SmartSell does not have the product costs for your Amazon items.",
  });
}, { label: "amazon_finances_failed" });
