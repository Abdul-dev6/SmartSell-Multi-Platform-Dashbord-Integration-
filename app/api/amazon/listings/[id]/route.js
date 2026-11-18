import { amazonRoute, ok, searchParams, toClientListing } from "@/lib/amazon/http";
import { deleteListing, getListing, refreshListing, updateListing } from "@/lib/amazon/listingService";

// GET    one listing; ?refresh=1 reads it from Amazon first (status, issues,
//        price, quantity, processing result)
// PATCH  { title?, description?, bulletPoints?, images?, brand?, attributes?,
//        price?, currency?, quantity? } — partial update (JSON Patch)
// DELETE { confirm: true } — deletes the listing on Amazon
export const GET = amazonRoute(async ({ req, ctx, user }) => {
  const { id } = await ctx.params;
  const listing = searchParams(req).get("refresh") === "1" ? await refreshListing(user._id, id) : await getListing(user._id, id);
  return ok({ listing: toClientListing(listing) });
}, { label: "amazon_listing_get_failed" });

export const PATCH = amazonRoute(
  async ({ ctx, user, body }) => {
    const { id } = await ctx.params;
    const result = await updateListing(user._id, id, body);
    return ok({ listing: toClientListing(result.listing), submission: result.submission }, result.status);
  },
  { label: "amazon_listing_update_failed", json: true, rateLimit: { bucket: "write", limit: 60 } },
);

export const DELETE = amazonRoute(
  async ({ ctx, user, body }) => {
    const { id } = await ctx.params;
    const result = await deleteListing(user._id, id, { confirm: body?.confirm });
    return ok({ deleted: true, submission: result.submission });
  },
  { label: "amazon_listing_delete_failed", json: true, rateLimit: { bucket: "write", limit: 60 } },
);
