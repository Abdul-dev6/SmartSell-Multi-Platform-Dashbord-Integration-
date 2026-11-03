import Product from "@/models/Product";
import { fetchProductsPage } from "@/lib/shopify/products";
import { bulkUpsert, notNewerThan } from "@/lib/shopify/bulkUpsert";
import { canReadPublications } from "@/lib/shopify/scopes";

const toId = (value) => (value === null || value === undefined ? null : String(value));

// Shopify weight units (GraphQL enum); REST spells them kg / g / lb / oz.
const WEIGHT_UNITS = { kg: "KILOGRAMS", g: "GRAMS", lb: "POUNDS", oz: "OUNCES" };
export const normalizeWeightUnit = (unit) => {
  if (!unit) return null;
  const upper = String(unit).toUpperCase();
  return ["KILOGRAMS", "GRAMS", "POUNDS", "OUNCES"].includes(upper) ? upper : WEIGHT_UNITS[String(unit).toLowerCase()] || null;
};

// The taxonomy category as { id, name, fullName }. Returns undefined when
// the source's shape is not recognised, so an unknown shape never clears a
// stored category.
function mapCategory(category) {
  if (category === null) return null;
  if (!category || typeof category !== "object") return undefined;
  const id = category.admin_graphql_api_id
    || (typeof category.id === "string" && category.id.startsWith("gid://shopify/TaxonomyCategory/") ? category.id : null);
  if (!id) return undefined;
  return { id, name: category.name || null, fullName: category.full_name || category.fullName || category.name || null };
}

// Fields only some sources carry (GraphQL reads do; product webhooks do not
// include collections, publications or variant shipping). Each is returned
// only when present, so a partial payload never erases stored values.
function optionalProductFields(product) {
  const fields = {};

  if (Object.prototype.hasOwnProperty.call(product, "category")) {
    const category = mapCategory(product.category);
    if (category !== undefined) fields.category = category;
  }

  if (Array.isArray(product.collections)) {
    fields.collections = product.collections.map((c) => ({
      id: c.id,
      title: c.title,
      manual: c.manual !== false,
    }));
  }

  if (Array.isArray(product.published_publication_ids)) {
    fields.publishedOn = [...new Set(product.published_publication_ids.map(String))];
    fields.publishedOnKnown = true;
  }

  const variants = product.variants || [];
  if (variants.length && variants.every((v) => Object.prototype.hasOwnProperty.call(v, "requires_shipping"))) {
    fields.variantShipping = Object.fromEntries(
      variants.map((v) => [
        String(v.id),
        {
          requiresShipping: v.requires_shipping ?? null,
          weight: v.weight === null || v.weight === undefined ? null : Number(v.weight),
          weightUnit: normalizeWeightUnit(v.weight_unit),
          countryCodeOfOrigin: v.country_code_of_origin ?? null,
          harmonizedSystemCode: v.harmonized_system_code ?? null,
        },
      ]),
    );
  }

  // Cost per item (Shopify "unit cost"), per variant ID; null = not set.
  if (variants.length && variants.every((v) => Object.prototype.hasOwnProperty.call(v, "unit_cost"))) {
    fields.variantCosts = Object.fromEntries(
      variants.map((v) => [String(v.id), v.unit_cost === null || v.unit_cost === undefined ? null : Number(v.unit_cost)]),
    );
  }

  return fields;
}

// Maps a Shopify REST product to the fields stored in MongoDB.
export function mapShopifyProduct(product) {
  return {
    ...optionalProductFields(product),
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
//
// `authoritative` marks data just read from Shopify (a listing or a product
// read), which proves the product exists now. Webhook payloads are not: one
// can be delayed past the product's deletion, so it may only revive a product
// a full sync archived if it is newer than that archive.
export async function upsertShopifyProducts(store, products, syncedAt = new Date(), { authoritative = false } = {}) {
  const ops = products.map((product) => {
    const doc = mapShopifyProduct(product);
    const conditions = [notNewerThan("shopifyUpdatedAt", doc.shopifyUpdatedAt)];
    if (!authoritative) {
      conditions.push({
        $or: [
          { archiveReason: { $ne: "deleted_in_shopify" } },
          ...(doc.shopifyUpdatedAt ? [{ archivedAt: { $lt: doc.shopifyUpdatedAt } }] : []),
        ],
      });
    }
    const guards = conditions.filter((c) => Object.keys(c).length);
    return {
      updateOne: {
        filter: {
          shopifyStore: store._id,
          shopifyProductId: doc.shopifyProductId,
          // A product deleted from SmartSell is gone from Shopify; any payload
          // for it is stale and must not bring the record back.
          archiveReason: { $ne: "deleted_in_smartsell" },
          ...(guards.length ? { $and: guards } : {}),
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
  let cursor = null;

  do {
    const result = await fetchProductsPage(client, cursor, { publications: canReadPublications(store) });

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

    await upsertShopifyProducts(store, result.products, syncedAt, { authoritative: true });
    cursor = result.nextCursor;
  } while (cursor);

  // Only reached after every page succeeded, so a partial fetch never
  // archives products by mistake.
  // `$type: "string"` excludes pending SmartSell creates, which have no
  // Shopify ID yet ($nin alone would match them).
  // `lastSyncedAt < syncedAt` skips records a webhook or a SmartSell write
  // stored while this sync was paging (e.g. a product created after its page
  // was read); they are current even though this listing did not include them.
  // A delayed webhook cannot revive what is archived here (see
  // upsertShopifyProducts); a later listing that includes the product can.
  const archived = await Product.updateMany(
    {
      shopifyStore: store._id,
      shopifyProductId: { $type: "string", $nin: seenIds },
      archivedAt: null,
      $or: [{ lastSyncedAt: { $lt: syncedAt } }, { lastSyncedAt: null }],
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
