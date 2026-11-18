import { amazonRoute, ok, searchParams } from "@/lib/amazon/http";
import { invalid } from "@/lib/amazon/errors";
import { loadAccount } from "@/lib/amazon/listingService";
import { withAccountClient } from "@/lib/amazon/accounts";
import { searchProductTypes } from "@/lib/amazon/productTypes";
import { validateMarketplace } from "@/lib/amazon/validation";

// GET ?accountId&marketplaceId&q — Amazon product types matching keywords
// (Product Type Definitions API searchDefinitionsProductTypes).
export const GET = amazonRoute(
  async ({ req, user }) => {
    const p = searchParams(req);
    const account = await loadAccount(user._id, p.get("accountId") || undefined, { write: false });
    const marketplaceId = p.get("marketplaceId") || account.marketplaceIds?.[0];
    if (!validateMarketplace(account, marketplaceId)) throw invalid("Choose a marketplace this Amazon account is authorized to sell in.");
    const q = (p.get("q") || "").trim();
    if (q.length > 100) throw invalid("Search must be at most 100 characters.");
    const productTypes = await withAccountClient(account, (client) => searchProductTypes(client, { keywords: q || undefined, marketplaceId }));
    return ok({ productTypes });
  },
  { label: "amazon_product_types_failed", rateLimit: { bucket: "read", limit: 300 } },
);
