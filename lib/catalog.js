import Shopifystore from "@/models/ShopifyUser";
import Product, { HAS_SHOPIFY_ID } from "@/models/Products";
import Inventory from "@/models/Inventory";

const MAX_ROWS = 5000;

// Active stores owned by the user, with the sync state the UI shows.
export async function getActiveStores(userId) {
  return Shopifystore.find({ user: userId, status: { $ne: "disconnected" } })
    .select("_id shop timezone currency locations lastSyncAt lastSyncStatus lastSyncError lastSyncCounts syncLockedUntil")
    .sort({ createdAt: 1 })
    .lean();
}

export function syncSummary(stores) {
  return stores.map((store) => ({
    storeId: String(store._id),
    shop: store.shop,
    lastSyncAt: store.lastSyncAt || null,
    lastSyncStatus: store.lastSyncStatus || null,
    lastSyncError: store.lastSyncError || null,
    counts: store.lastSyncCounts || null,
    syncing: Boolean(store.syncLockedUntil && store.syncLockedUntil > new Date()),
  }));
}

// One row per variant per location, the shape the Product, Listing and
// Inventory pages render. Variants with no inventory level get one row with
// `available: null` (not tracked), so untracked products still appear.
// `storesById` (optional) maps store id → { shop, locations } for display names.
export async function getInventoryRows(userId, storeIds, storesById = new Map()) {
  const [products, levels] = await Promise.all([
    Product.find({ user: userId, shopifyStore: { $in: storeIds }, archivedAt: null, ...HAS_SHOPIFY_ID })
      .select("shopifyStore shopifyProductId title vendor productType status images variants shopifyUpdatedAt updatedAt syncStatus lastSyncError")
      .sort({ title: 1 })
      .lean(),
    Inventory.find({ user: userId, shopifyStore: { $in: storeIds } })
      .select("inventoryItemId locationId available shopifyUpdatedAt")
      .lean(),
  ]);

  const levelsByItem = new Map();
  for (const level of levels) {
    const list = levelsByItem.get(level.inventoryItemId) || [];
    list.push(level);
    levelsByItem.set(level.inventoryItemId, list);
  }

  const rows = [];
  for (const product of products) {
    const store = storesById.get(String(product.shopifyStore));
    const locationName = (id) =>
      store?.locations?.find((location) => location.id === id)?.name || null;

    for (const variant of product.variants || []) {
      const base = {
        local_id: String(product._id),
        shop: store?.shop || null,
        vendor: product.vendor || null,
        product_type: product.productType || null,
        sync_status: product.syncStatus || "synced",
        sync_error: product.lastSyncError || null,
        variant_count: (product.variants || []).length,
        product_id: product.shopifyProductId,
        title: product.title,
        status: product.status,
        image: product.images?.[0]?.url || null,
        variant_id: variant.id,
        variant_title: variant.title,
        price: variant.price ?? null,
        sku: variant.sku?.trim() || variant.barcode || `SHOPIFY-${variant.id}`,
        platform: "Shopify",
        inventory_item_id: variant.inventoryItemId,
      };

      const itemLevels = levelsByItem.get(variant.inventoryItemId) || [];
      if (!itemLevels.length) {
        rows.push({
          ...base,
          id: `${variant.id}:none`,
          row_id: `${variant.id}:none`,
          location_id: null,
          location_name: null,
          available: null,
          updated_at: product.shopifyUpdatedAt || product.updatedAt,
        });
      }
      for (const level of itemLevels) {
        rows.push({
          ...base,
          id: `${variant.id}:${level.locationId}`,
          row_id: `${variant.id}:${level.locationId}`,
          location_id: level.locationId,
          location_name: locationName(level.locationId),
          available: level.available,
          updated_at: level.shopifyUpdatedAt || product.shopifyUpdatedAt,
        });
      }
      if (rows.length >= MAX_ROWS) {
        return { rows, truncated: true };
      }
    }
  }

  return { rows, truncated: false };
}

// SmartSell writes that failed or have not been confirmed, so the user can
// see and retry them (including creates that have no Shopify ID yet).
export async function getProductsNeedingAttention(userId, storeIds) {
  const docs = await Product.find({
    user: userId,
    shopifyStore: { $in: storeIds },
    archivedAt: null,
    syncStatus: { $in: ["pending", "failed"] },
  })
    .select("title syncStatus lastSyncError pendingOperation.type pendingOperation.outcome pendingOperation.startedAt shopifyProductId")
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    title: doc.title,
    syncStatus: doc.syncStatus,
    error: doc.lastSyncError || null,
    operation: doc.pendingOperation?.type || null,
    outcome: doc.pendingOperation?.outcome || null,
    startedAt: doc.pendingOperation?.startedAt || null,
    inShopify: Boolean(doc.shopifyProductId),
  }));
}
