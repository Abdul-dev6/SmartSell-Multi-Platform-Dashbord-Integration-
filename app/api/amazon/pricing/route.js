import { amazonRoute, intParam, ok, searchParams, toClientListing } from "@/lib/amazon/http";
import { listListings } from "@/lib/amazon/listingService";

// GET ?accountId&marketplaceId&q&page — the seller's own offer prices (from
// the Listings Items API `offers`, refreshed by every listings sync). Prices
// are changed with PATCH /api/amazon/listings/[id] { price, currency }, which
// updates the listing's purchasable_offer on Amazon.
export const GET = amazonRoute(async ({ req, user }) => {
  const p = searchParams(req);
  const marketplaceId = /^[A-Z0-9]{10,16}$/.test(p.get("marketplaceId") || "") ? p.get("marketplaceId") : undefined;
  const result = await listListings(user._id, {
    accountId: p.get("accountId") || undefined,
    marketplaceId,
    q: (p.get("q") || "").trim() || undefined,
    page: intParam(p.get("page"), 1),
    pageSize: intParam(p.get("pageSize"), 50),
  });
  return ok({
    ...result,
    items: result.items.map((l) => {
      const c = toClientListing(l);
      return {
        id: c.id,
        sku: c.sku,
        asin: c.asin,
        title: c.title,
        marketplaceId: c.marketplaceId,
        price: c.price,
        currency: c.currency,
        fulfillment: c.fulfillment,
        priceStatus: c.submission?.operation === "price" ? c.submission.status : null,
        pending: c.pending,
        lastSyncedAt: c.lastSyncedAt,
      };
    }),
  });
}, { label: "amazon_pricing_failed" });
