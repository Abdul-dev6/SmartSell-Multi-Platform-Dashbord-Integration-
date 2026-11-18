// Sellers API v1: getMarketplaceParticipations (connection check and the
// marketplaces an account sells in). Only marketplace fields are kept; the
// store name is dropped because SmartSell does not need it.

const str = (v, max = 100) => (typeof v === "string" && v.length <= max ? v : null);

export function toSafeParticipation(entry) {
  const m = entry?.marketplace;
  if (!str(m?.id, 20)) return null;
  return {
    marketplaceId: m.id,
    countryCode: str(m.countryCode, 2),
    name: str(m.name),
    defaultCurrencyCode: str(m.defaultCurrencyCode, 3),
    isParticipating: entry?.participation?.isParticipating === true,
    hasSuspendedListings: entry?.participation?.hasSuspendedListings === true,
  };
}

// The mapped participations plus Amazon's raw response (for the Sandbox
// Data Viewer's debug view).
export async function fetchMarketplaceParticipations(client) {
  const raw = await client.get("getMarketplaceParticipations", "/sellers/v1/marketplaceParticipations");
  const participations = (Array.isArray(raw?.payload) ? raw.payload : []).map(toSafeParticipation).filter(Boolean);
  return { participations, raw };
}

export async function getMarketplaceParticipations(client) {
  return (await fetchMarketplaceParticipations(client)).participations;
}
