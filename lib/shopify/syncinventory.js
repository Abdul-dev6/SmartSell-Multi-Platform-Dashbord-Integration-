import Inventory from "@/models/Inventory";
import Product from "@/models/Product";
import { Getinventory } from "@/lib/shopify/inventory";
import { bulkUpsert, notNewerThan } from "@/lib/shopify/bulkUpsert";

// One guarded upsert for an inventory level (per item, per location).
// `owner` is { productId, variantId } when known.
function inventoryLevelOp(store, level, owner = {}, syncedAt = new Date()) {
  const inventoryItemId = String(level.inventory_item_id);
  const locationId = String(level.location_id);
  const shopifyUpdatedAt = level.updated_at ? new Date(level.updated_at) : null;

  return {
    updateOne: {
      filter: {
        shopifyStore: store._id,
        inventoryItemId,
        locationId,
        ...notNewerThan("shopifyUpdatedAt", shopifyUpdatedAt),
      },
      update: {
        $set: {
          user: store.user,
          shopifyStore: store._id,
          inventoryItemId,
          locationId,
          // null = quantity not tracked; keep it distinct from 0.
          available: typeof level.available === "number" ? level.available : null,
          ...(owner.productId ? { productId: owner.productId } : {}),
          ...(owner.variantId ? { variantId: owner.variantId } : {}),
          shopifyUpdatedAt,
          lastSyncedAt: syncedAt,
        },
      },
      upsert: true,
    },
  };
}

// Applies one inventory level from a webhook. Older updates are skipped.
export async function upsertInventoryLevel(store, level) {
  const inventoryItemId = String(level.inventory_item_id);
  const product = await Product.findOne(
    { shopifyStore: store._id, "variants.inventoryItemId": inventoryItemId },
    { shopifyProductId: 1, variants: 1 },
  ).lean();
  const variant = product?.variants?.find((v) => v.inventoryItemId === inventoryItemId);
  const owner = product ? { productId: product.shopifyProductId, variantId: variant?.id } : {};

  return bulkUpsert(Inventory, [inventoryLevelOp(store, level, owner)]);
}

// Syncs inventory levels (per item, per location) for the given items.
// `inventoryItems` maps inventoryItemId -> { productId, variantId }.
export async function syncInventory(client, store, inventoryItems) {
  const syncedAt = new Date();
  const levels = await Getinventory(client, [...inventoryItems.keys()]);

  const ops = levels.map((level) =>
    inventoryLevelOp(store, level, inventoryItems.get(String(level.inventory_item_id)), syncedAt),
  );

  await bulkUpsert(Inventory, ops);
  return { count: levels.length };
}
