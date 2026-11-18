// FBA Inventory API v1: getInventorySummaries (read only). Quantities in
// Amazon's fulfillment centers are managed by Amazon; the API's write
// operations (addInventory, createInventoryItem, deleteInventoryItem) are
// sandbox-only, so SmartSell never changes FBA quantities.

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const date = (v) => {
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export function toSafeInventory(summary, marketplaceId) {
  const sellerSku = str(summary?.sellerSku, 200);
  if (!sellerSku) return null;
  const d = summary.inventoryDetails || {};
  return {
    marketplaceId,
    sellerSku,
    asin: str(summary.asin, 20),
    fnSku: str(summary.fnSku, 20),
    condition: str(summary.condition, 50),
    productName: str(summary.productName, 500),
    totalQuantity: num(summary.totalQuantity),
    fulfillableQuantity: num(d.fulfillableQuantity),
    inboundWorkingQuantity: num(d.inboundWorkingQuantity),
    inboundShippedQuantity: num(d.inboundShippedQuantity),
    inboundReceivingQuantity: num(d.inboundReceivingQuantity),
    reservedQuantity: num(d.reservedQuantity?.totalReservedQuantity),
    researchingQuantity: num(d.researchingQuantity?.totalResearchingQuantity),
    unfulfillableQuantity: num(d.unfulfillableQuantity?.totalUnfulfillableQuantity),
    amazonUpdatedAt: date(summary.lastUpdatedTime),
  };
}

// One page (nextToken pagination).
export async function getInventorySummariesPage(client, { marketplaceId, nextToken }) {
  const data = await client.get("getInventorySummaries", "/fba/inventory/v1/summaries", {
    details: true,
    granularityType: "Marketplace",
    granularityId: marketplaceId,
    marketplaceIds: [marketplaceId],
    nextToken,
  });
  return {
    items: (Array.isArray(data?.payload?.inventorySummaries) ? data.payload.inventorySummaries : []).map((s) => toSafeInventory(s, marketplaceId)).filter(Boolean),
    nextToken: str(data?.pagination?.nextToken, 4096),
  };
}
