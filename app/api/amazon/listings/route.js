import { amazonRoute, intParam, ok, searchParams, toClientListing } from "@/lib/amazon/http";
import { createListing, listListings } from "@/lib/amazon/listingService";

// GET  ?accountId&q&status=active|inactive|issues&marketplaceId&fulfillment=MFN|FBA&page&pageSize
//      the signed-in seller's Amazon listings (from SmartSell's synced copy)
// POST create a listing on Amazon (validated against the product type and by
//      Amazon's VALIDATION_PREVIEW before submission). 202: accepted by Amazon
//      and processing; 422: rejected, with Amazon's issues.
export const GET = amazonRoute(async ({ req, user }) => {
  const p = searchParams(req);
  const status = ["active", "inactive", "issues"].includes(p.get("status")) ? p.get("status") : undefined;
  const fulfillment = ["MFN", "FBA"].includes(p.get("fulfillment")) ? p.get("fulfillment") : undefined;
  const marketplaceId = /^[A-Z0-9]{10,16}$/.test(p.get("marketplaceId") || "") ? p.get("marketplaceId") : undefined;
  const result = await listListings(user._id, {
    accountId: p.get("accountId") || undefined,
    q: (p.get("q") || "").trim() || undefined,
    status,
    fulfillment,
    marketplaceId,
    page: intParam(p.get("page"), 1),
    pageSize: intParam(p.get("pageSize"), 25),
  });
  return ok({ ...result, items: result.items.map(toClientListing) });
}, { label: "amazon_listings_list_failed" });

export const POST = amazonRoute(
  async ({ user, body }) => {
    const result = await createListing(user._id, body);
    return ok({ listing: toClientListing(result.listing), submission: result.submission }, result.status);
  },
  { label: "amazon_listing_create_failed", json: true, rateLimit: { bucket: "write", limit: 60 } },
);
