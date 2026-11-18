import { amazonRoute, ok, searchParams } from "@/lib/amazon/http";
import { listInventory } from "@/lib/amazon/listingService";

// GET ?accountId — Amazon inventory, kept apart:
//   merchantFulfilled  seller-fulfilled quantities (editable: PATCH
//                      /api/amazon/listings/[id] { quantity })
//   fba                Fulfilled by Amazon quantities (read only; Amazon
//                      manages them in its fulfillment centers)
export const GET = amazonRoute(async ({ req, user }) => {
  const { merchantFulfilled, fba } = await listInventory(user._id, { accountId: searchParams(req).get("accountId") || undefined });
  return ok({
    merchantFulfilled: merchantFulfilled.map((l) => ({
      id: String(l._id),
      accountId: String(l.amazonAccount),
      marketplaceId: l.marketplaceId,
      sku: l.sku,
      asin: l.asin || null,
      title: l.itemName || null,
      quantity: l.quantity ?? null,
      statuses: l.statuses || [],
      quantityStatus: l.submission?.operation === "quantity" || l.submission?.operation === "close" ? l.submission.status : null,
      lastSyncedAt: l.lastSyncedAt || null,
    })),
    fba: fba.map((i) => ({
      id: String(i._id),
      accountId: String(i.amazonAccount),
      marketplaceId: i.marketplaceId,
      sku: i.sellerSku,
      asin: i.asin || null,
      fnSku: i.fnSku || null,
      title: i.productName || null,
      condition: i.condition || null,
      totalQuantity: i.totalQuantity ?? null,
      fulfillable: i.fulfillableQuantity ?? null,
      inbound: (i.inboundWorkingQuantity ?? 0) + (i.inboundShippedQuantity ?? 0) + (i.inboundReceivingQuantity ?? 0),
      reserved: i.reservedQuantity ?? null,
      researching: i.researchingQuantity ?? null,
      unfulfillable: i.unfulfillableQuantity ?? null,
      lastSyncedAt: i.lastSyncedAt || null,
    })),
    fbaWritable: false,
  });
}, { label: "amazon_inventory_failed" });
