import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Shopifystore from "@/models/ShopifyUser";
import { createClient } from "./client";
import { syncProducts } from "./syncProduct";
import { syncInventory } from "./syncinventory";
import { syncOrders } from "./ordersync";
import { reconcilePendingCreates } from "@/lib/products/service";

const LOCK_MS = 5 * 60 * 1000;
// Re-fetch orders updated slightly before the last sync to cover clock skew
// and orders that changed while the previous sync was running.
const ORDER_OVERLAP_MS = 5 * 60 * 1000;

// Short, safe description of a failure: no response bodies, tokens or PII.
export function describeSyncError(error) {
  const status = error?.response?.status;
  if (status === 401) return "Shopify rejected the access token (401). Reconnect the store.";
  if (status === 403) return "Missing Shopify permission (403). Reconnect to grant required scopes.";
  if (status === 429) return "Shopify rate limit reached (429). Try again shortly.";
  if (status) return `Shopify request failed (HTTP ${status}).`;
  if (error?.code === "ECONNABORTED") return "Shopify request timed out.";
  return `${error?.name || "Error"}: sync step failed.`;
}

async function acquireLock(storeId, userId) {
  const now = new Date();
  return Shopifystore.findOneAndUpdate(
    {
      _id: storeId,
      user: userId,
      status: { $ne: "disconnected" },
      $or: [{ syncLockedUntil: null }, { syncLockedUntil: { $lt: now } }],
    },
    { $set: { syncLockedUntil: new Date(now.getTime() + LOCK_MS) } },
    { returnDocument: "after" },
  ).select("+accessToken");
}

async function fetchShopSettings(client) {
  const response = await client.get("/shop.json", {
    params: { fields: "iana_timezone,currency" },
  });
  const shop = response.data?.shop || {};
  return { timezone: shop.iana_timezone || null, currency: shop.currency || null };
}

// Synchronizes one store owned by `userId`.
// Returns { status: "not_found" | "busy" | "success" | "partial" | "failed", ... }.
export async function syncStore(storeId, userId) {
  await connectDB();

  if (!mongoose.isValidObjectId(storeId)) {
    return { status: "not_found" };
  }

  const store = await acquireLock(storeId, userId);
  if (!store) {
    const exists = await Shopifystore.exists({
      _id: storeId,
      user: userId,
      status: { $ne: "disconnected" },
    });
    return { status: exists ? "busy" : "not_found" };
  }

  const startedAt = new Date();
  const client = createClient(store.shop, store.accessToken);
  const counts = {};
  const errors = [];
  const update = {};

  try {
    try {
      Object.assign(update, await fetchShopSettings(client));
    } catch (error) {
      // Not fatal: reports fall back to UTC.
      console.warn("Shop settings fetch failed:", store.shop, error.response?.status);
    }

    let inventoryItems = null;
    try {
      const products = await syncProducts(client, store);
      counts.products = products.count;
      counts.archivedProducts = products.archived;
      inventoryItems = products.inventoryItems;
    } catch (error) {
      errors.push(`Products: ${describeSyncError(error)}`);
    }

    // Link SmartSell creates whose Shopify response was lost (not fatal).
    try {
      counts.reconciledCreates = (await reconcilePendingCreates(client, store)).linked;
    } catch (error) {
      console.warn("Pending create reconciliation failed:", store.shop, describeSyncError(error));
    }

    if (inventoryItems) {
      try {
        counts.inventoryLevels = (await syncInventory(client, store, inventoryItems)).count;
      } catch (error) {
        errors.push(`Inventory: ${describeSyncError(error)}`);
      }
    } else {
      errors.push("Inventory: skipped because products could not be synced.");
    }

    try {
      const updatedAtMin = store.ordersSyncedThrough
        ? new Date(store.ordersSyncedThrough.getTime() - ORDER_OVERLAP_MS)
        : undefined;
      counts.orders = (await syncOrders(client, store, { updatedAtMin })).count;
      // Everything updated before this sync started is now stored.
      update.ordersSyncedThrough = startedAt;
    } catch (error) {
      errors.push(`Orders: ${describeSyncError(error)}`);
    }

    const phases = 3; // products, inventory, orders
    const status =
      errors.length === 0 ? "success" : errors.length >= phases ? "failed" : "partial";

    for (const message of errors) {
      console.error("Shopify sync error:", store.shop, message);
    }

    await Shopifystore.updateOne(
      { _id: store._id },
      {
        $set: {
          ...update,
          lastSyncAt: new Date(),
          lastSyncStatus: status,
          lastSyncError: errors.join(" ") || null,
          lastSyncCounts: counts,
        },
        $unset: { syncLockedUntil: 1 },
      },
    );

    return { status, shop: store.shop, counts, errors };
  } catch (error) {
    // Bookkeeping itself failed (e.g. database); release the lock.
    await Shopifystore.updateOne(
      { _id: store._id },
      { $unset: { syncLockedUntil: 1 } },
    ).catch(() => {});
    throw error;
  }
}
