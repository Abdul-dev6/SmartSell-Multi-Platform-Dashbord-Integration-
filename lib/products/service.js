import mongoose from "mongoose";
import Product, { HAS_SHOPIFY_ID } from "@/models/Product";
import { getActiveStoreForUser } from "@/lib/shopify/stores";
import { createClient } from "@/lib/shopify/client";
import {
  assertNoUserErrors,
  gidToId,
  productGid,
  shopifyGraphql,
  ShopifyGraphQLError,
} from "@/lib/shopify/graphql";
import { upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { fetchProduct } from "@/lib/shopify/products";
import { logError } from "@/lib/observability/log";
import {
  canManageInventory,
  canManagePublications,
  canReadPublications,
  missingInventoryScopes,
  missingPublicationScopes,
} from "@/lib/shopify/scopes";
import { StockChangedError, applyInventory, locationGid, planInventory, readItemLevels } from "@/lib/shopify/inventoryWrite";
import { syncInventory } from "@/lib/shopify/syncinventory";

// A create whose outcome is unknown is not resent until Shopify has had time
// to index it, so the idempotency lookup can find it.
const CREATE_IN_FLIGHT_MS = 2 * 60 * 1000;
const IDEMPOTENCY_METAFIELD = { namespace: "smartsell", key: "idempotency_key" };

export class ProductServiceError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "ProductServiceError";
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

const PRODUCT_SET = `
  mutation SmartSellProductCreate($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product { id }
      userErrors { field message code }
    }
  }`;

const PRODUCT_UPDATE = `
  mutation SmartSellProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }`;

const VARIANTS_UPDATE = `
  mutation SmartSellVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message code }
    }
  }`;

const PUBLISH = `
  mutation SmartSellPublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }`;

const UNPUBLISH = `
  mutation SmartSellUnpublish($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }`;

const PRODUCT_DELETE = `
  mutation SmartSellProductDelete($input: ProductDeleteInput!) {
    productDelete(input: $input, synchronous: true) {
      deletedProductId
      userErrors { field message }
    }
  }`;

const FIND_BY_IDEMPOTENCY_KEY = `
  query SmartSellFindCreated($query: String!) {
    products(first: 50, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        id
        metafield(namespace: "${IDEMPOTENCY_METAFIELD.namespace}", key: "${IDEMPOTENCY_METAFIELD.key}") { value }
      }
    }
  }`;

// "rejected": Shopify did not apply the request (validation, permissions,
// throttling, or userErrors; 4xx responses are refused requests).
// "unknown": no response, a 5xx, or GraphQL errors returned together with
// mutation data (the mutation ran and the error came while building the
// response), so the request may have been applied.
export function classifyFailure(error) {
  if (error instanceof ShopifyGraphQLError) return error.executed ? "unknown" : "rejected";
  const status = error?.response?.status;
  if (status && status >= 400 && status < 500) return "rejected";
  return "unknown";
}

function failureResponse(error, outcome) {
  if (error instanceof StockChangedError) {
    const current = error.changes.filter((c) => c.current !== null);
    return new ProductServiceError(
      409,
      "stock_changed",
      "Stock changed in Shopify since this product was loaded (for example, a sale). Reload to see the current quantities, then save again.",
      { stockChanges: current },
    );
  }
  if (error instanceof ShopifyGraphQLError && error.code === "USER_ERRORS") {
    return new ProductServiceError(422, "shopify_validation", "Shopify rejected the product.", {
      userErrors: error.userErrors,
    });
  }
  if (error?.code === "THROTTLED" || error?.response?.status === 429) {
    return new ProductServiceError(429, "rate_limited", "Shopify rate limit reached. Try again shortly.");
  }
  if (error?.code === "ACCESS_DENIED" || [401, 403].includes(error?.response?.status)) {
    return new ProductServiceError(
      403,
      "missing_permission",
      "Shopify denied the request. Reconnect the store to grant product write permission.",
    );
  }
  if (outcome === "unknown") {
    return new ProductServiceError(
      502,
      "outcome_unknown",
      "Shopify did not confirm the change. SmartSell will check Shopify before retrying, so no duplicate is created.",
    );
  }
  return new ProductServiceError(502, "shopify_error", "Shopify could not process the request.");
}

// A Shopify client/GraphQL error as the user-facing ProductServiceError.
export function shopifyFailure(error) {
  return error instanceof ProductServiceError ? error : failureResponse(error, classifyFailure(error));
}

function safeErrorSummary(error) {
  if (error instanceof ShopifyGraphQLError && error.userErrors?.length) {
    return error.userErrors.map((e) => e.message).join("; ").slice(0, 500);
  }
  return failureResponse(error, classifyFailure(error)).message;
}

// Shape returned to the browser (never tokens or raw payloads).
export function toClientProduct(doc) {
  const variants = doc.variants || [];
  const single = variants.length === 1 ? variants[0] : null;
  const shipping = single ? doc.variantShipping?.[String(single.id)] : null;
  return {
    id: String(doc._id),
    shopifyProductId: doc.shopifyProductId || null,
    title: doc.title,
    description: doc.description || "",
    vendor: doc.vendor || "",
    productType: doc.productType || "",
    tags: doc.tags || [],
    status: doc.status ? String(doc.status).toLowerCase() : "draft",
    handle: doc.handle || "",
    variantCount: variants.length,
    images: (doc.images || []).map((image) => ({ url: image.url, alt: image.alt || "" })),
    price: single?.price ?? "",
    comparePrice: single?.compareAtPrice ?? "",
    sku: single?.sku ?? "",
    barcode: single?.barcode ?? "",
    trackInventory: single ? single.inventoryManagement === "shopify" : null,
    inventoryItemId: single?.inventoryItemId || null,
    category: doc.category?.id ? { id: doc.category.id, name: doc.category.name, fullName: doc.category.fullName } : null,
    collections: (doc.collections || []).map((c) => ({ id: c.id, title: c.title, manual: c.manual !== false })),
    publishedOn: doc.publishedOn || [],
    publishedOnKnown: Boolean(doc.publishedOnKnown),
    shipping: shipping
      ? {
          requiresShipping: shipping.requiresShipping ?? null,
          weight: shipping.weight ?? null,
          weightUnit: shipping.weightUnit || null,
          countryCodeOfOrigin: shipping.countryCodeOfOrigin || null,
          harmonizedSystemCode: shipping.harmonizedSystemCode || null,
        }
      : null,
    origin: doc.origin || "shopify",
    syncStatus: doc.syncStatus || "synced",
    lastSyncError: doc.lastSyncError || null,
    pendingOperation: doc.pendingOperation?.type
      ? { type: doc.pendingOperation.type, outcome: doc.pendingOperation.outcome || null }
      : null,
    archivedAt: doc.archivedAt || null,
    archiveReason: doc.archiveReason || null,
    shopifyUpdatedAt: doc.shopifyUpdatedAt || null,
  };
}

export async function requireStore(userId, storeId) {
  const store = await getActiveStoreForUser(userId, { storeId, withToken: true });
  if (!store) {
    throw new ProductServiceError(404, "store_not_found", "No connected Shopify store.");
  }
  return store;
}

export async function findOwnedProduct(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Product.findOne({ _id: id, user: userId });
}

// Re-reads the product from Shopify and stores it, so MongoDB reflects what
// Shopify actually saved (including fields Shopify normalized).
export async function refreshFromShopify(client, store, shopifyProductId) {
  const product = await fetchProduct(client, shopifyProductId, { publications: canReadPublications(store) });
  if (!product) {
    throw Object.assign(new Error("Product no longer exists in Shopify"), { code: "PRODUCT_NOT_FOUND" });
  }
  await upsertShopifyProducts(store, [product], new Date(), { authoritative: true });
}

// The product no longer exists in Shopify (deleted there, and the webhook has
// not arrived yet): archive it as Shopify would, and end any open operation.
async function archiveDeletedInShopify(productId) {
  const now = new Date();
  await Product.updateOne(
    { _id: productId, archivedAt: null },
    {
      $set: {
        archivedAt: now,
        archiveReason: "deleted_in_shopify",
        syncStatus: "synced",
        lastSyncError: null,
        lastSyncedAt: now,
      },
      $unset: { pendingOperation: 1 },
      $max: { shopifyUpdatedAt: now },
    },
  );
}

const deletedInShopifyError = () =>
  new ProductServiceError(
    404,
    "deleted_in_shopify",
    "This product was deleted in Shopify, so SmartSell archived it. Order history is kept.",
  );

// Reads the product from Shopify after a failed write: a product (REST shape),
// null when it no longer exists, or undefined when the read itself failed.
const readLive = (client, store, shopifyProductId) =>
  fetchProduct(client, shopifyProductId, { publications: canReadPublications(store) }).catch(() => undefined);

// Links a pending SmartSell record to its Shopify product. If a sync or
// webhook already imported that product as its own record, that record is
// kept (it has the full Shopify data), SmartSell's metadata is moved onto it,
// and the now-redundant placeholder is removed.
export async function attachShopifyId(placeholder, shopifyProductId) {
  try {
    await Product.updateOne({ _id: placeholder._id }, { $set: { shopifyProductId } });
    return placeholder._id;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const imported = await Product.findOne({
      shopifyStore: placeholder.shopifyStore,
      shopifyProductId,
    });
    await Product.deleteOne({ _id: placeholder._id, shopifyProductId: { $exists: false } });
    await Product.updateOne(
      { _id: imported._id },
      { $set: { origin: "smartsell", idempotencyKey: placeholder.idempotencyKey } },
    );
    return imported._id;
  }
}

async function findCreatedInShopify(client, idempotencyKey, since) {
  const after = new Date(since.getTime() - 60 * 1000).toISOString();
  const data = await shopifyGraphql(
    client,
    FIND_BY_IDEMPOTENCY_KEY,
    { query: `created_at:>='${after}'` },
    { idempotent: true },
  );
  const match = data.products.nodes.find((p) => p.metafield?.value === idempotencyKey);
  return match ? gidToId(match.id) : null;
}

// Shipping fields go to the variant's inventory item (InventoryItemInput).
function inventoryItemInput(shipping = {}, extra = {}) {
  const item = { ...extra };
  if (shipping.requiresShipping !== undefined) item.requiresShipping = shipping.requiresShipping;
  if (shipping.weight) item.measurement = { weight: shipping.weight };
  if (shipping.harmonizedSystemCode) item.harmonizedSystemCode = shipping.harmonizedSystemCode;
  if (shipping.countryCodeOfOrigin) item.countryCodeOfOrigin = shipping.countryCodeOfOrigin;
  return Object.keys(item).length ? item : null;
}

// Sales channels need write_publications; refuse before anything is sent,
// so a request never half-applies for lack of a permission.
function assertCanPublish(store, value) {
  if (value.publications === undefined || canManagePublications(store)) return;
  throw new ProductServiceError(
    403,
    "missing_scope",
    "Choosing sales channels needs extra Shopify permissions. Enable them for the app, then reconnect the store.",
    { missingScopes: missingPublicationScopes(store) },
  );
}

// Stock and quantity tracking need write_inventory; refuse before sending.
function assertCanManageInventory(store, value) {
  if ((value.inventory === undefined && value.trackInventory === undefined) || canManageInventory(store)) return;
  throw new ProductServiceError(
    403,
    "missing_scope",
    "Managing stock from SmartSell needs an extra Shopify permission. Enable it for the app, then reconnect the store.",
    { missingScopes: missingInventoryScopes(store) },
  );
}

// Re-reads the item's stock levels from Shopify into MongoDB.
async function refreshItemInventory(client, store, product, inventoryItemId) {
  const variant = (product.variants || []).find((v) => String(v.inventoryItemId) === String(inventoryItemId));
  await syncInventory(client, store, new Map([[String(inventoryItemId), { productId: product.shopifyProductId, variantId: variant?.id }]]));
}

// Publishes to / unpublishes from sales channels so the product is on
// exactly `desired`, starting from `current` (what Shopify reports now).
// Recomputed from live state on every attempt, so repeating it is safe.
async function applyPublications(client, gid, desired, current) {
  const want = new Set(desired);
  const have = new Set(current);
  const publish = [...want].filter((id) => !have.has(id));
  const unpublish = [...have].filter((id) => !want.has(id));
  if (publish.length) {
    const data = await shopifyGraphql(client, PUBLISH, { id: gid, input: publish.map((publicationId) => ({ publicationId })) });
    assertNoUserErrors(data.publishablePublish, "publishablePublish");
  }
  if (unpublish.length) {
    const data = await shopifyGraphql(client, UNPUBLISH, { id: gid, input: unpublish.map((publicationId) => ({ publicationId })) });
    assertNoUserErrors(data.publishableUnpublish, "publishableUnpublish");
  }
  return { published: publish.length, unpublished: unpublish.length };
}

// Collection changes relative to the product's live collections. Automated
// (smart) collections are assigned by Shopify's rules: they are never left
// here, and choosing one the product is already in changes nothing.
function collectionChanges(desired, live) {
  const current = live?.collections || [];
  const currentIds = new Set(current.map((c) => c.id));
  const want = new Set(desired);
  return {
    join: [...want].filter((id) => !currentIds.has(id)),
    leave: current.filter((c) => c.manual !== false && !want.has(c.id)).map((c) => c.id),
  };
}

// Stock given implies tracking; otherwise the explicit choice, if any.
function trackingInput(value) {
  if (value.trackInventory !== undefined) return { tracked: value.trackInventory };
  return value.inventory?.length ? { tracked: true } : {};
}

function productSetInput(value) {
  const variant = value.variant || {};
  return {
    title: value.title,
    descriptionHtml: value.descriptionHtml ?? "",
    vendor: value.vendor ?? "",
    productType: value.productType ?? "",
    tags: value.tags ?? [],
    status: value.status ?? "DRAFT",
    ...(value.handle ? { handle: value.handle } : {}),
    ...(value.seo ? { seo: value.seo } : {}),
    ...(value.category ? { category: value.category } : {}),
    ...(value.collections?.length ? { collections: value.collections } : {}),
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
    variants: [
      {
        optionValues: [{ optionName: "Title", name: "Default Title" }],
        price: variant.price,
        ...(variant.compareAtPrice !== undefined ? { compareAtPrice: variant.compareAtPrice } : {}),
        ...(variant.sku ? { sku: variant.sku } : {}),
        ...(variant.barcode ? { barcode: variant.barcode } : {}),
        ...(variant.inventoryPolicy ? { inventoryPolicy: variant.inventoryPolicy } : {}),
        ...(inventoryItemInput(value.shipping, trackingInput(value)) ? { inventoryItem: inventoryItemInput(value.shipping, trackingInput(value)) } : {}),
        ...(value.inventory?.length
          ? {
              inventoryQuantities: value.inventory.map((l) => ({
                locationId: locationGid(l.locationId),
                name: "available",
                quantity: l.available,
              })),
            }
          : {}),
      },
    ],
    // Lets SmartSell find this product again if the response is lost.
    metafields: [
      {
        ...IDEMPOTENCY_METAFIELD,
        type: "single_line_text_field",
        value: value.idempotencyKey,
      },
    ],
  };
}

async function finishCreate(client, store, placeholder, shopifyProductId) {
  const productId = await attachShopifyId(placeholder, shopifyProductId);
  try {
    await refreshFromShopify(client, store, shopifyProductId);
    await Product.updateOne(
      { _id: productId },
      { $set: { syncStatus: "synced", lastSyncError: null }, $unset: { pendingOperation: 1 } },
    );
  } catch (error) {
    // The product exists in Shopify and is linked; only the local copy is stale.
    await Product.updateOne(
      { _id: productId },
      {
        $set: {
          syncStatus: "failed",
          lastSyncError: "Created in Shopify; the local copy will refresh on the next sync.",
        },
        $unset: { pendingOperation: 1 },
      },
    );
    logError(null, "product_refresh_after_create_failed", error, { message: false, productId: String(productId) });
  }
  return Product.findById(productId);
}

// Creates a product in Shopify from a SmartSell request. Safe to call again
// with the same idempotency key: it never creates a second Shopify product.
// Returns { status, product, replay?, notSent? }.
export async function createProduct(userId, value) {
  const store = await requireStore(userId, value.storeId);
  assertCanPublish(store, value);
  assertCanManageInventory(store, value);
  const client = createClient(store.shop, store.accessToken);
  const now = new Date();

  let placeholder = await Product.findOne({
    shopifyStore: store._id,
    idempotencyKey: value.idempotencyKey,
  });

  if (placeholder?.shopifyProductId) {
    if (placeholder.syncStatus === "failed") {
      await refreshFromShopify(client, store, placeholder.shopifyProductId).catch(() => {});
    }
    return { status: 200, product: await Product.findById(placeholder._id), replay: true };
  }

  if (placeholder?.pendingOperation?.outcome === "unknown") {
    const startedAt = placeholder.pendingOperation.startedAt || placeholder.createdAt;
    if (now - startedAt < CREATE_IN_FLIGHT_MS) {
      throw new ProductServiceError(
        409,
        "create_in_progress",
        "This product is still being created. Wait a moment, then check the product list.",
        { productId: String(placeholder._id) },
      );
    }
    const existingId = await findCreatedInShopify(client, value.idempotencyKey, startedAt);
    if (existingId) {
      return { status: 200, product: await finishCreate(client, store, placeholder, existingId), replay: true };
    }
  }

  const pendingOperation = {
    type: "create",
    startedAt: now,
    attempts: (placeholder?.pendingOperation?.attempts || 0) + 1,
    input: value,
    outcome: "unknown",
  };

  if (placeholder) {
    await Product.updateOne(
      { _id: placeholder._id },
      { $set: { title: value.title, syncStatus: "pending", pendingOperation, lastSyncError: null } },
    );
  } else {
    try {
      placeholder = await Product.create({
        user: userId,
        shopifyStore: store._id,
        title: value.title,
        status: value.status?.toLowerCase(),
        origin: "smartsell",
        idempotencyKey: value.idempotencyKey,
        syncStatus: "pending",
        pendingOperation,
      });
    } catch (error) {
      if (error?.code === 11000) {
        throw new ProductServiceError(409, "create_in_progress", "This product is already being created.");
      }
      throw error;
    }
  }

  let shopifyProductId;
  try {
    const data = await shopifyGraphql(client, PRODUCT_SET, { input: productSetInput(value) });
    const payload = assertNoUserErrors(data.productSet, "productSet");
    shopifyProductId = gidToId(payload.product?.id);
    if (!shopifyProductId) throw new Error("productSet returned no product id");
  } catch (error) {
    const outcome = classifyFailure(error);
    await Product.updateOne(
      { _id: placeholder._id },
      {
        $set: {
          syncStatus: outcome === "unknown" ? "pending" : "failed",
          lastSyncError: safeErrorSummary(error),
          "pendingOperation.outcome": outcome,
        },
      },
    );
    logError(null, "product_create_failed", error, { message: false, outcome, shop: store.shop });
    throw failureResponse(error, outcome);
  }

  // The product exists in Shopify now. Publishing is a separate step: if it
  // fails, the product is kept and the publishing is left for a retry.
  let publishError = null;
  if (value.publications?.length) {
    try {
      await applyPublications(client, productGid(shopifyProductId), value.publications, []);
    } catch (error) {
      publishError = error;
      logError(null, "product_publish_failed", error, { message: false, shop: store.shop });
    }
  }

  const created = await finishCreate(client, store, placeholder, shopifyProductId);
  if (value.inventory?.length || value.trackInventory !== undefined) {
    const itemId = created?.variants?.[0]?.inventoryItemId;
    if (itemId) await refreshItemInventory(client, store, created, itemId).catch(() => {});
  }
  if (!publishError) return { status: 201, product: created };

  await Product.updateOne(
    { _id: created._id },
    {
      $set: {
        syncStatus: "failed",
        lastSyncError: `Created in Shopify, but sales channels were not updated: ${safeErrorSummary(publishError)}`,
        pendingOperation: {
          type: "update",
          startedAt: new Date(),
          attempts: 1,
          input: { publications: value.publications },
          outcome: classifyFailure(publishError),
        },
      },
    },
  );
  return { status: 201, product: await Product.findById(created._id), partial: "publications" };
}

// Applies validated changes to an existing Shopify product. Both mutations
// set absolute values, so repeating an update is safe.
export async function updateProduct(userId, id, value) {
  const product = await findOwnedProduct(userId, id);
  if (!product || product.archivedAt || !product.shopifyProductId) {
    throw new ProductServiceError(404, "not_found", "Product not found.");
  }

  const variants = product.variants || [];
  const perVariant = value.variant || value.shipping || value.inventory !== undefined || value.trackInventory !== undefined;
  if (perVariant && variants.length !== 1) {
    throw new ProductServiceError(
      422,
      "multiple_variants",
      `This product has ${variants.length} variants. Price, SKU, barcode, shipping and stock differ per variant, which this form does not edit.`,
    );
  }

  const store = await requireStore(userId, product.shopifyStore);
  assertCanPublish(store, value);
  assertCanManageInventory(store, value);
  const client = createClient(store.shop, store.accessToken);
  const gid = productGid(product.shopifyProductId);

  const productFields = {};
  for (const key of ["title", "descriptionHtml", "vendor", "productType", "tags", "status", "handle", "seo", "category"]) {
    if (value[key] !== undefined) productFields[key] = value[key];
  }

  // Collection and sales-channel changes are computed from what Shopify has
  // now (not the stored copy), so a retry or a concurrent change in Shopify
  // never adds or removes the wrong ones.
  let live;
  if (value.collections !== undefined || value.publications !== undefined) {
    try {
      live = await fetchProduct(client, product.shopifyProductId, { publications: canReadPublications(store) });
    } catch (error) {
      throw failureResponse(error, "rejected");
    }
    if (live === null) {
      await archiveDeletedInShopify(product._id);
      throw deletedInShopifyError();
    }
  }
  // Stock: compare with Shopify's live levels before changing anything, so a
  // conflicting change (a sale since the form was loaded) stops the whole
  // edit with nothing applied.
  const inventoryItemId = variants[0]?.inventoryItemId;
  let inventoryPlan = null;
  if (value.inventory !== undefined) {
    if (!inventoryItemId) {
      throw new ProductServiceError(422, "no_inventory_item", "This product has no inventory item in Shopify.");
    }
    let levels;
    try {
      levels = await readItemLevels(client, inventoryItemId);
    } catch (error) {
      throw failureResponse(error, "rejected");
    }
    if (!levels) {
      throw new ProductServiceError(422, "no_inventory_item", "This product has no inventory item in Shopify.");
    }
    try {
      inventoryPlan = planInventory(value.inventory, levels);
    } catch (error) {
      throw failureResponse(error, "rejected");
    }
  }

  if (value.collections !== undefined) {
    const { join, leave } = collectionChanges(value.collections, live);
    if (join.length) productFields.collectionsToJoin = join;
    if (leave.length) productFields.collectionsToLeave = leave;
  }

  await Product.updateOne(
    { _id: product._id },
    {
      $set: {
        syncStatus: "pending",
        pendingOperation: {
          type: "update",
          startedAt: new Date(),
          attempts: (product.pendingOperation?.attempts || 0) + 1,
          input: value,
          outcome: "unknown",
        },
      },
    },
  );

  try {
    if (Object.keys(productFields).length) {
      const data = await shopifyGraphql(client, PRODUCT_UPDATE, { product: { id: gid, ...productFields } });
      assertNoUserErrors(data.productUpdate, "productUpdate");
    }

    const tracking = value.trackInventory !== undefined ? { tracked: value.trackInventory } : {};
    if (value.variant || value.shipping || value.trackInventory !== undefined) {
      const { sku, ...variantFields } = value.variant || {};
      const inventoryItem = inventoryItemInput(value.shipping, { ...(sku !== undefined ? { sku } : {}), ...tracking });
      const data = await shopifyGraphql(client, VARIANTS_UPDATE, {
        productId: gid,
        variants: [
          {
            id: `gid://shopify/ProductVariant/${variants[0].id}`,
            ...variantFields,
            ...(inventoryItem ? { inventoryItem } : {}),
          },
        ],
      });
      assertNoUserErrors(data.productVariantsBulkUpdate, "productVariantsBulkUpdate");
    }

    if (value.publications !== undefined) {
      await applyPublications(client, gid, value.publications, live.published_publication_ids || []);
    }

    if (inventoryPlan && (inventoryPlan.set.length || inventoryPlan.activate.length)) {
      await applyInventory(client, inventoryItemId, inventoryPlan, { reference: `smartsell://product/${product._id}` });
    }
  } catch (error) {
    const outcome = classifyFailure(error);
    const live = await readLive(client, store, product.shopifyProductId);
    if (live === null) {
      await archiveDeletedInShopify(product._id);
      throw deletedInShopifyError();
    }
    await Product.updateOne(
      { _id: product._id },
      {
        $set: {
          syncStatus: "failed",
          lastSyncError: safeErrorSummary(error),
          "pendingOperation.outcome": outcome,
        },
      },
    );
    // Some changes may have applied; show what Shopify has now.
    if (live) await upsertShopifyProducts(store, [live], new Date(), { authoritative: true }).catch(() => {});
    throw failureResponse(error, outcome);
  }

  try {
    await refreshFromShopify(client, store, product.shopifyProductId);
    if ((value.inventory !== undefined || value.trackInventory !== undefined) && inventoryItemId) {
      await refreshItemInventory(client, store, product, inventoryItemId);
    }
    await Product.updateOne(
      { _id: product._id },
      { $set: { syncStatus: "synced", lastSyncError: null }, $unset: { pendingOperation: 1 } },
    );
  } catch (error) {
    if (error?.code === "PRODUCT_NOT_FOUND") {
      await archiveDeletedInShopify(product._id);
      throw deletedInShopifyError();
    }
    await Product.updateOne(
      { _id: product._id },
      {
        $set: {
          syncStatus: "failed",
          lastSyncError: "Saved in Shopify; the local copy will refresh on the next sync.",
        },
        $unset: { pendingOperation: 1 },
      },
    );
  }

  return { status: 200, product: await Product.findById(product._id) };
}

// Deletes the product in Shopify and archives the local record (kept for
// order history). Deleting an already-deleted product succeeds.
export async function deleteProduct(userId, id) {
  const product = await findOwnedProduct(userId, id);
  if (!product) {
    throw new ProductServiceError(404, "not_found", "Product not found.");
  }
  if (product.archivedAt) {
    return { status: 200, product, alreadyDeleted: true };
  }
  if (!product.shopifyProductId) {
    throw new ProductServiceError(
      409,
      "not_in_shopify",
      "This product was never created in Shopify. Retry or resubmit it first.",
    );
  }

  const store = await requireStore(userId, product.shopifyStore);
  const client = createClient(store.shop, store.accessToken);

  await Product.updateOne(
    { _id: product._id },
    {
      $set: {
        syncStatus: "pending",
        pendingOperation: {
          type: "delete",
          startedAt: new Date(),
          attempts: (product.pendingOperation?.attempts || 0) + 1,
          outcome: "unknown",
        },
      },
    },
  );

  try {
    const data = await shopifyGraphql(client, PRODUCT_DELETE, {
      input: { id: productGid(product.shopifyProductId) },
    });
    const payload = data.productDelete;
    const alreadyGone = payload?.userErrors?.some((e) => /does not exist|not found/i.test(e.message));
    if (!alreadyGone) assertNoUserErrors(payload, "productDelete");
  } catch (error) {
    const outcome = classifyFailure(error);
    // A lost response or an unexpected userError: ask Shopify whether the
    // product still exists. If it is gone, the delete is done.
    const maybeGone =
      outcome === "unknown" || (error instanceof ShopifyGraphQLError && error.code === "USER_ERRORS");
    if (!(maybeGone && (await readLive(client, store, product.shopifyProductId)) === null)) {
      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            syncStatus: "failed",
            lastSyncError: safeErrorSummary(error),
            "pendingOperation.outcome": outcome,
          },
        },
      );
      throw failureResponse(error, outcome);
    }
  }

  await Product.updateOne(
    { _id: product._id },
    {
      $set: {
        archivedAt: new Date(),
        archiveReason: "deleted_in_smartsell",
        syncStatus: "synced",
        lastSyncError: null,
      },
      $unset: { pendingOperation: 1 },
    },
  );

  return { status: 200, product: await Product.findById(product._id) };
}

// Retries an interrupted or failed operation from its stored request.
export async function retryProduct(userId, id) {
  const product = await findOwnedProduct(userId, id);
  if (!product) {
    throw new ProductServiceError(404, "not_found", "Product not found.");
  }
  const op = product.pendingOperation;
  if (!op?.type) {
    if (product.syncStatus === "failed" && product.shopifyProductId) {
      const store = await requireStore(userId, product.shopifyStore);
      const client = createClient(store.shop, store.accessToken);
      try {
        await refreshFromShopify(client, store, product.shopifyProductId);
      } catch (error) {
        if (error?.code !== "PRODUCT_NOT_FOUND") throw error;
        await archiveDeletedInShopify(product._id);
        throw deletedInShopifyError();
      }
      await Product.updateOne({ _id: product._id }, { $set: { syncStatus: "synced", lastSyncError: null } });
      return { status: 200, product: await Product.findById(product._id) };
    }
    throw new ProductServiceError(409, "nothing_to_retry", "There is nothing to retry for this product.");
  }

  if (op.type === "create") {
    return createProduct(userId, { ...op.input, idempotencyKey: product.idempotencyKey, storeId: String(product.shopifyStore) });
  }
  if (op.type === "update") {
    return updateProduct(userId, id, op.input || {});
  }
  return deleteProduct(userId, id);
}

// Finds pending SmartSell creates whose result was lost and links them to the
// Shopify product if it exists. Run after a product sync.
export async function reconcilePendingCreates(client, store, { now = new Date() } = {}) {
  const pending = await Product.find({
    shopifyStore: store._id,
    origin: "smartsell",
    shopifyProductId: { $exists: false },
    "pendingOperation.type": "create",
    "pendingOperation.outcome": "unknown",
    "pendingOperation.startedAt": { $lt: new Date(now.getTime() - CREATE_IN_FLIGHT_MS) },
  });

  let linked = 0;
  for (const placeholder of pending) {
    const shopifyProductId = await findCreatedInShopify(
      client,
      placeholder.idempotencyKey,
      placeholder.pendingOperation.startedAt,
    );
    if (shopifyProductId) {
      await finishCreate(client, store, placeholder, shopifyProductId);
      linked += 1;
    }
  }
  return { checked: pending.length, linked };
}

export { HAS_SHOPIFY_ID };
