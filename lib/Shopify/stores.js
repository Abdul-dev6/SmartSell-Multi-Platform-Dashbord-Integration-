import mongoose from "mongoose";
import Shopifystore from "@/models/ShopifyUser";
import { isValidShopDomain } from "./oauth";

export class StoreOwnershipError extends Error {
  constructor() {
    super("This Shopify store is linked to another SmartSell account");
    this.name = "StoreOwnershipError";
  }
}

// Finds an active store owned by `userId`. Optionally narrowed by shop domain
// or store id. Pass withToken to include the access token (server-side only).
export async function getActiveStoreForUser(
  userId,
  { shop, storeId, withToken = false } = {},
) {
  const filter = { user: userId, status: { $ne: "disconnected" } };

  if (storeId) {
    if (!mongoose.isValidObjectId(storeId)) {
      return null;
    }
    filter._id = storeId;
  }

  if (shop) {
    if (!isValidShopDomain(shop)) {
      return null;
    }
    filter.shop = shop;
  }

  const query = Shopifystore.findOne(filter).sort({ createdAt: 1 });
  return withToken ? query.select("+accessToken") : query;
}

export async function listStoresForUser(userId) {
  return Shopifystore.find({ user: userId })
    .select("_id shop status scope country connectedAt disconnectedAt createdAt webhooks")
    .sort({ createdAt: 1 })
    .lean();
}

// Links (or re-links) a store to a user after a successful OAuth exchange.
// A store owned by a different user is never reassigned.
export async function linkStore({ userId, shop, accessToken, scope }) {
  if (!isValidShopDomain(shop)) {
    throw new Error("Invalid shop domain");
  }

  const existing = await Shopifystore.findOne({ shop }).select("user");
  if (existing && !existing.user.equals(userId)) {
    throw new StoreOwnershipError();
  }

  try {
    return await Shopifystore.findOneAndUpdate(
      { shop, user: userId },
      {
        $set: {
          accessToken,
          scope,
          status: "active",
          connectedAt: new Date(),
        },
        $unset: { disconnectedAt: 1 },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
  } catch (error) {
    // Unique index on `shop`: another user linked it concurrently.
    if (error?.code === 11000) {
      throw new StoreOwnershipError();
    }
    throw error;
  }
}

// Revokes SmartSell's access at Shopify (this uninstalls the app from the
// store), then clears the token locally. The store record is kept so
// products and orders keep their reference, and only the same user can
// reconnect it.
export async function disconnectStore(userId, storeId) {
  const store = await getActiveStoreForUser(userId, {
    storeId,
    withToken: true,
  });
  if (!store) {
    return null;
  }

  let revokedAtShopify = false;
  if (store.accessToken) {
    try {
      const response = await fetch(
        `https://${store.shop}/admin/api_permissions/current.json`,
        {
          method: "DELETE",
          headers: { "X-Shopify-Access-Token": store.accessToken },
          signal: AbortSignal.timeout(10000),
        },
      );
      // 401 means the token was already revoked (e.g. app uninstalled in Shopify).
      revokedAtShopify = response.ok || response.status === 401;
    } catch {
      revokedAtShopify = false;
    }
  }

  await Shopifystore.updateOne(
    { _id: store._id, user: userId },
    {
      $set: { status: "disconnected", disconnectedAt: new Date() },
      $unset: { accessToken: 1 },
    },
  );

  return { shop: store.shop, revokedAtShopify };
}
