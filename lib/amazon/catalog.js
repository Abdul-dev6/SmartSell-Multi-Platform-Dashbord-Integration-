import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import { isSandboxViewerEnabled } from "@/lib/amazon/sandboxViewer";

// Amazon SANDBOX listings as product rows for the Products page, in the same
// shape as eBay's rows (lib/ebay/catalog.js). Every row is Amazon's sample
// data: marked `sample: true`, read-only (no local_id, so no edit/delete),
// and returned only where the Sandbox viewer is enabled (never in a
// production build), even though the database is shared.

const MAX_ROWS = 200;

export async function getAmazonSandboxAccounts(userId) {
  if (!isSandboxViewerEnabled()) return [];
  return AmazonAccount.find({ user: userId, environment: "sandbox" }).select("_id sellingPartnerId marketplaceIds").sort({ createdAt: 1 }).lean();
}

export function toSandboxRow(listing, account) {
  const id = `amazon:${listing._id}`;
  const statuses = listing.statuses || [];
  return {
    id,
    row_id: id,
    local_id: null,
    marketplace: "amazon",
    platform: "Amazon (Sandbox)",
    sample: true,
    environment: "sandbox",
    account_id: String(listing.amazonAccount),
    shop: account?.sellingPartnerId || null,
    currency: null,
    vendor: null,
    product_type: listing.productType || null,
    sync_status: "synced",
    sync_error: null,
    variant_count: 1,
    product_id: listing.asin ? `amazon:${listing.asin}` : id,
    asin: listing.asin || null,
    title: listing.itemName || listing.sku,
    status: statuses.includes("BUYABLE") ? "active" : "draft",
    listing_status: statuses.join(", ") || null,
    marketplace_id: listing.marketplaceId,
    image: null,
    variant_id: listing.sku,
    variant_title: "Default Title",
    price: null,
    sku: listing.sku,
    inventory_item_id: null,
    location_id: null,
    location_name: null,
    available: null,
    updated_at: listing.lastSyncedAt || listing.updatedAt,
  };
}

export async function getAmazonSandboxRows(userId, accounts) {
  if (!isSandboxViewerEnabled() || !accounts.length) return { rows: [], truncated: false };
  const byId = new Map(accounts.map((a) => [String(a._id), a]));
  const listings = await AmazonListing.find({ user: userId, environment: "sandbox", amazonAccount: { $in: accounts.map((a) => a._id) } })
    .select("amazonAccount marketplaceId sku asin productType conditionType statuses itemName lastSyncedAt updatedAt")
    .sort({ itemName: 1 })
    .limit(MAX_ROWS + 1)
    .lean();
  return {
    rows: listings.slice(0, MAX_ROWS).map((l) => toSandboxRow(l, byId.get(String(l.amazonAccount)))),
    truncated: listings.length > MAX_ROWS,
  };
}
