import Inventory from "@/models/Inventory";
import Product from "@/models/Product";
import { Getinventory } from "@/lib/shopify/inventory";
import { bulkUpsert, notNewerThan } from "@/lib/shopify/bulkUpsert";

// One guarded upsert for an inventory level (per item, per location).
// `owner` is { productId, variantId } when known. `authoritative` marks a
// level just listed by Shopify (it exists now); a webhook payload may only
// bring back a disconnected level if it is newer than the disconnect.
function inventoryLevelOp(store, level, owner = {}, syncedAt = new Date(), { authoritative = false } = {}) {
  const inventoryItemId = String(level.inventory_item_id);
  const locationId = String(level.location_id);
  const shopifyUpdatedAt = level.updated_at ? new Date(level.updated_at) : null;
  const guards = [notNewerThan("shopifyUpdatedAt", shopifyUpdatedAt)];
  if (!authoritative) {
    guards.push({
      $or: [
        { disconnectedAt: null },
        ...(shopifyUpdatedAt ? [{ disconnectedAt: { $lt: shopifyUpdatedAt } }] : []),
      ],
    });
  }
  const conditions = guards.filter((g) => Object.keys(g).length);

  return {
    updateOne: {
      filter: {
        shopifyStore: store._id,
        inventoryItemId,
        locationId,
        ...(conditions.length ? { $and: conditions } : {}),
      },
      update: {
        $set: {
          disconnectedAt: null,
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

// inventory_levels/disconnect: Shopify no longer stocks the item at the
// location. The level is hidden (see the model), unless the stored level is
// newer than the disconnect. A disconnect for an unknown level is kept as a
// hidden placeholder so a delayed older update cannot create it.
export async function disconnectInventoryLevel(store, payload, disconnectedAt) {
  const at = new Date(disconnectedAt);
  return bulkUpsert(Inventory, [
    {
      updateOne: {
        filter: {
          shopifyStore: store._id,
          inventoryItemId: String(payload.inventory_item_id),
          locationId: String(payload.location_id),
          ...notNewerThan("shopifyUpdatedAt", at),
        },
        update: {
          $set: { disconnectedAt: at, shopifyUpdatedAt: at, lastSyncedAt: new Date() },
          $setOnInsert: { user: store.user, available: null },
        },
        upsert: true,
      },
    },
  ]);
}

// Syncs inventory levels (per item, per location) for the given items.
// `inventoryItems` maps inventoryItemId -> { productId, variantId }.
// Levels of these items that Shopify no longer lists are hidden; levels of
// other items (e.g. archived products) are left untouched.
export async function syncInventory(client, store, inventoryItems) {
  const syncedAt = new Date();
  const itemIds = [...inventoryItems.keys()].map(String);
  const levels = await Getinventory(client, itemIds);

  const ops = levels.map((level) =>
    inventoryLevelOp(store, level, inventoryItems.get(String(level.inventory_item_id)), syncedAt, {
      authoritative: true,
    }),
  );
  await bulkUpsert(Inventory, ops);

  // Only reached after every batch was fetched, so a partial fetch never
  // hides levels. Rows written after the sync started (webhooks) are skipped.
  const listed = new Set(levels.map((l) => `${l.inventory_item_id}:${l.location_id}`));
  const stored = await Inventory.find({
    shopifyStore: store._id,
    inventoryItemId: { $in: itemIds },
    disconnectedAt: null,
    $or: [{ lastSyncedAt: { $lt: syncedAt } }, { lastSyncedAt: null }],
  })
    .select("inventoryItemId locationId")
    .lean();
  const gone = stored.filter((l) => !listed.has(`${l.inventoryItemId}:${l.locationId}`)).map((l) => l._id);
  if (gone.length) {
    await Inventory.updateMany({ _id: { $in: gone }, disconnectedAt: null }, { $set: { disconnectedAt: syncedAt } });
  }

  return { count: levels.length, disconnected: gone.length };
}
