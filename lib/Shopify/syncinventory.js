import Inventory from "@/models/Inventory";
import { Getinventory } from "./inventory";
import { bulkUpsert, notNewerThan } from "./bulkUpsert";

// Syncs inventory levels (per item, per location) for the given items.
// `inventoryItems` maps inventoryItemId -> { productId, variantId }.
export async function syncInventory(client, store, inventoryItems) {
  const syncedAt = new Date();
  const levels = await Getinventory(client, [...inventoryItems.keys()]);

  const ops = levels.map((level) => {
    const inventoryItemId = String(level.inventory_item_id);
    const locationId = String(level.location_id);
    const owner = inventoryItems.get(inventoryItemId) || {};
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
            productId: owner.productId ?? null,
            variantId: owner.variantId ?? null,
            shopifyUpdatedAt,
            lastSyncedAt: syncedAt,
          },
        },
        upsert: true,
      },
    };
  });

  await bulkUpsert(Inventory, ops);
  return { count: levels.length };
}
