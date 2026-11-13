import EbayProduct from "@/models/EbayProduct";
import { listingUrl } from "@/lib/ebay/products/service";

// eBay products as rows in the shared catalog shape used by the Product,
// Listing and Inventory pages (see lib/catalog.js for Shopify rows). eBay
// products have a single SKU and a single inventory location.

const MAX_ROWS = 5000;
const STATUS = { published: "active", draft: "draft", ended: "archived" };

const brandOf = (aspects) => {
  const value = aspects?.Brand ?? aspects?.brand;
  return Array.isArray(value) ? value[0] || null : value || null;
};

export async function getEbayRows(userId, accounts) {
  if (!accounts.length) return { rows: [], truncated: false };
  const byId = new Map(accounts.map((a) => [String(a._id), a]));
  const products = await EbayProduct.find({ user: userId, ebayAccount: { $in: accounts.map((a) => a._id) }, archivedAt: null })
    .select("ebayAccount sku title condition categoryName aspects imageUrls price currency quantity listingId listingStatus syncStatus lastSyncError ebayUpdatedAt updatedAt")
    .sort({ title: 1 })
    .limit(MAX_ROWS + 1)
    .lean();

  const rows = products.slice(0, MAX_ROWS).map((p) => {
    const account = byId.get(String(p.ebayAccount));
    const locationKey = account?.setup?.merchantLocationKey || null;
    const id = `ebay:${p._id}`;
    return {
      id,
      row_id: id,
      local_id: String(p._id),
      marketplace: "ebay",
      platform: "eBay",
      account_id: String(p.ebayAccount),
      shop: account?.username || null,
      currency: p.currency || null,
      vendor: brandOf(p.aspects),
      product_type: p.categoryName || null,
      sync_status: p.syncStatus || "synced",
      sync_error: p.lastSyncError || null,
      variant_count: 1,
      product_id: p.listingId || null,
      title: p.title,
      status: STATUS[p.listingStatus] || "draft",
      listing_status: p.listingStatus || "draft",
      listing_url: listingUrl(p.listingId, account?.environment),
      image: p.imageUrls?.[0] || null,
      variant_id: p.sku,
      variant_title: "Default Title",
      price: p.price ?? null,
      sku: p.sku,
      inventory_item_id: null,
      location_id: locationKey ? `ebay:${locationKey}` : null,
      location_name: locationKey ? `eBay · ${locationKey}` : null,
      available: typeof p.quantity === "number" ? p.quantity : null,
      updated_at: p.ebayUpdatedAt || p.updatedAt,
    };
  });
  return { rows, truncated: products.length > MAX_ROWS };
}

// Failed or unconfirmed SmartSell → eBay writes, for the "Needs attention" panel.
export async function getEbayProductsNeedingAttention(userId, accounts) {
  if (!accounts.length) return [];
  const docs = await EbayProduct.find({
    user: userId,
    ebayAccount: { $in: accounts.map((a) => a._id) },
    archivedAt: null,
    syncStatus: { $in: ["pending", "failed"] },
  })
    .select("title syncStatus lastSyncError pendingOperation.type pendingOperation.outcome pendingOperation.startedAt offerId")
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    marketplace: "ebay",
    title: doc.title,
    syncStatus: doc.syncStatus,
    error: doc.lastSyncError || null,
    operation: doc.pendingOperation?.type || null,
    outcome: doc.pendingOperation?.outcome || null,
    startedAt: doc.pendingOperation?.startedAt || null,
    inEbay: Boolean(doc.offerId),
  }));
}
