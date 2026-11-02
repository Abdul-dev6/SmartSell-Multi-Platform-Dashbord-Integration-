import Product from "@/models/Products";
import { Getproducts } from "./products";
import { bulkUpsert, notNewerThan } from "./bulkUpsert";

const toId = (value) => (value === null || value === undefined ? null : String(value));

// Maps a Shopify REST product to the fields stored in MongoDB.
export function mapShopifyProduct(product) {
  return {
    shopifyProductId: String(product.id),
    title: product.title,
    handle: product.handle,
    description: product.body_html,
    vendor: product.vendor,
    productType: product.product_type,
    status: product.status,
    tags: product.tags
      ? product.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      : [],
    variants: (product.variants || []).map((variant) => ({
      id: toId(variant.id),
      title: variant.title,
      sku: variant.sku || null,
      barcode: variant.barcode || null,
      price: variant.price ?? null,
      compareAtPrice: variant.compare_at_price ?? null,
      inventoryItemId: toId(variant.inventory_item_id),
      inventoryManagement: variant.inventory_management ?? null,
      position: variant.position,
      imageId: toId(variant.image_id),
    })),
    images: (product.images || []).map((image) => ({
      id: String(image.id),
      url: image.src,
      alt: image.alt || "",
    })),
    shopifyUpdatedAt: product.updated_at ? new Date(product.updated_at) : null,
  };
}

// Idempotent upsert of Shopify products for one store. Re-running with the same
// data changes nothing; an older payload never overwrites a newer stored one.
export async function upsertShopifyProducts(store, products, syncedAt = new Date()) {
  const ops = products.map((product) => {
    const doc = mapShopifyProduct(product);
    return {
      updateOne: {
        filter: {
          shopifyStore: store._id,
          shopifyProductId: doc.shopifyProductId,
          // A product deleted from SmartSell is gone from Shopify; any payload
          // for it is stale and must not bring the record back.
          archiveReason: { $ne: "deleted_in_smartsell" },
          ...notNewerThan("shopifyUpdatedAt", doc.shopifyUpdatedAt),
        },
        update: {
          $set: {
            ...doc,
            user: store.user,
            shopifyStore: store._id,
            lastSyncedAt: syncedAt,
            archivedAt: null,
            archiveReason: null,
          },
          $setOnInsert: { syncStatus: "synced", origin: "shopify" },
        },
        upsert: true,
      },
    };
  });

  const result = await bulkUpsert(Product, ops);

  // Mark records synced, except those with a SmartSell write still open:
  // their status is owned by that operation until it finishes.
  if (products.length) {
    await Product.updateMany(
      {
        shopifyStore: store._id,
        shopifyProductId: { $in: products.map((p) => String(p.id)) },
        "pendingOperation.type": { $exists: false },
        syncStatus: { $ne: "synced" },
      },
      { $set: { syncStatus: "synced", lastSyncError: null } },
    );
  }

  return result;
}

// Full product sync: fetches every page, upserts each page, then archives
// local products Shopify no longer has. Returns the inventory items found so
// inventory can be synced against the same snapshot.
export async function syncProducts(client, store) {
  const syncedAt = new Date();
  const seenIds = [];
  const inventoryItems = new Map(); // inventoryItemId -> { productId, variantId }
  let nextPageUrl = null;

  do {
    const result = await Getproducts(client, nextPageUrl);

    for (const product of result.products) {
      seenIds.push(String(product.id));
      for (const variant of product.variants || []) {
        if (variant.inventory_item_id) {
          inventoryItems.set(String(variant.inventory_item_id), {
            productId: String(product.id),
            variantId: String(variant.id),
          });
        }
      }
    }

    await upsertShopifyProducts(store, result.products, syncedAt);
    nextPageUrl = result.nextUrl;
  } while (nextPageUrl);

  // Only reached after every page succeeded, so a partial fetch never
  // archives products by mistake.
  // `$type: "string"` excludes pending SmartSell creates, which have no
  // Shopify ID yet ($nin alone would match them).
  const archived = await Product.updateMany(
    {
      shopifyStore: store._id,
      shopifyProductId: { $type: "string", $nin: seenIds },
      archivedAt: null,
    },
    {
      $set: {
        archivedAt: syncedAt,
        archiveReason: "deleted_in_shopify",
        lastSyncedAt: syncedAt,
      },
    },
  );

  return {
    count: seenIds.length,
    archived: archived.modifiedCount,
    inventoryItems,
  };
}
