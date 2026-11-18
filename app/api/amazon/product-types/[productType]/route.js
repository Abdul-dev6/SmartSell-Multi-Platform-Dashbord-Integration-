import { amazonRoute, ok, searchParams } from "@/lib/amazon/http";
import { invalid } from "@/lib/amazon/errors";
import { loadAccount } from "@/lib/amazon/listingService";
import { withAccountClient } from "@/lib/amazon/accounts";
import { getProductTypeRequirements } from "@/lib/amazon/productTypes";
import { validateMarketplace } from "@/lib/amazon/validation";

// GET ?accountId&marketplaceId — what a listing of this product type needs:
// required attributes and attribute list from the product type's schema
// (Product Type Definitions API getDefinitionsProductType, requirements=LISTING).
export const GET = amazonRoute(
  async ({ req, ctx, user }) => {
    const { productType } = await ctx.params;
    if (!/^[A-Z0-9_]{1,64}$/.test(productType || "")) throw invalid("Invalid product type.");
    const p = searchParams(req);
    const account = await loadAccount(user._id, p.get("accountId") || undefined, { write: false });
    const marketplaceId = p.get("marketplaceId") || account.marketplaceIds?.[0];
    if (!validateMarketplace(account, marketplaceId)) throw invalid("Choose a marketplace this Amazon account is authorized to sell in.");
    const requirements = await withAccountClient(account, (client) => getProductTypeRequirements(client, { productType, marketplaceId, sellerId: account.sellingPartnerId }));
    return ok({ requirements });
  },
  { label: "amazon_product_type_failed", rateLimit: { bucket: "read", limit: 300 } },
);
