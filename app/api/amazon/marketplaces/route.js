import AmazonAccount from "@/models/AmazonAccount";
import { amazonRoute, ok, searchParams } from "@/lib/amazon/http";
import { loadAccount } from "@/lib/amazon/listingService";
import { withAccountClient } from "@/lib/amazon/accounts";
import { fetchMarketplaceParticipations } from "@/lib/amazon/sellers";
import { isRegionMarketplace } from "@/lib/amazon/config";

// GET ?accountId[&refresh=1] — the seller's authorized marketplaces. With
// refresh=1 they are read again from Amazon (Sellers API
// getMarketplaceParticipations) and saved.
export const GET = amazonRoute(
  async ({ req, user }) => {
    const p = searchParams(req);
    const account = await loadAccount(user._id, p.get("accountId") || undefined, { write: false });
    if (p.get("refresh") !== "1") return ok({ marketplaces: account.marketplaces || [], marketplaceIds: account.marketplaceIds || [] });
    const { participations } = await withAccountClient(account, (client) => fetchMarketplaceParticipations(client));
    const marketplaces = participations
      .filter((m) => isRegionMarketplace(m.marketplaceId))
      .map((m) => ({ id: m.marketplaceId, name: m.name, countryCode: m.countryCode, currency: m.defaultCurrencyCode, isParticipating: m.isParticipating }));
    const marketplaceIds = marketplaces.filter((m) => m.isParticipating).map((m) => m.id);
    await AmazonAccount.updateOne({ _id: account._id, user: user._id }, { $set: { marketplaces, marketplaceIds } });
    return ok({ marketplaces, marketplaceIds });
  },
  { label: "amazon_marketplaces_failed", rateLimit: { bucket: "read", limit: 300 } },
);
