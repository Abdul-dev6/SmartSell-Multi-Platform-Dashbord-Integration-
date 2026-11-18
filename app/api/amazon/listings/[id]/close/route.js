import { amazonRoute, ok, toClientListing } from "@/lib/amazon/http";
import { closeListing } from "@/lib/amazon/listingService";

// POST: closes a seller-fulfilled listing (quantity 0, so it becomes inactive
// but stays on Amazon and can be reopened by setting a quantity). This is not
// a deletion. FBA listings cannot be closed from SmartSell.
export const POST = amazonRoute(
  async ({ ctx, user }) => {
    const { id } = await ctx.params;
    const result = await closeListing(user._id, id);
    return ok({ listing: toClientListing(result.listing), submission: result.submission }, result.status);
  },
  { label: "amazon_listing_close_failed", rateLimit: { bucket: "write", limit: 60 } },
);
