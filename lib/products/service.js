import mongoose from "mongoose";
import Product, { HAS_SHOPIFY_ID } from "@/models/Products";
import { getActiveStoreForUser } from "@/lib/Shopify/stores";
import { createClient } from "@/lib/Shopify/client";
import {
  assertNoUserErrors,
  gidToId,
  productGid,
  shopifyGraphql,
  ShopifyGraphQLError,
} from "@/lib/Shopify/graphql";
import { upsertShopifyProducts } from "@/lib/Shopify/syncProduct";

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
// throttling — GraphQL errors are returned before anything executes, and 4xx
// responses are refused requests). "unknown": no response or a 5xx, so the
// request may or may not have been applied.
export function classifyFailure(error) {
  if (error instanceof ShopifyGraphQLError) return "rejected";
  const status = error?.response?.status;
  if (status && status >= 400 && status < 500) return "rejected";
  return "unknown";
}

function failureResponse(error, outcome) {
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
    price: single?.price ?? "",
    comparePrice: single?.compareAtPrice ?? "",
    sku: single?.sku ?? "",
    barcode: single?.barcode ?? "",
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

async function requireStore(userId, storeId) {
  const store = await getActiveStoreForUser(userId, { storeId, withToken: true });
  if (!store) {
    throw new ProductServiceError(404, "store_not_found", "No connected Shopify store.");
  }
  return store;
}

async function findOwnedProduct(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Product.findOne({ _id: id, user: userId });
}

// Re-reads the product from Shopify and stores it, so MongoDB reflects what
// Shopify actually saved (including fields Shopify normalized).
async function refreshFromShopify(client, store, shopifyProductId) {
  const response = await client.get(`/products/${shopifyProductId}.json`);
  await upsertShopifyProducts(store, [response.data.product]);
}

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
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
    variants: [
      {
        optionValues: [{ optionName: "Title", name: "Default Title" }],
        price: variant.price,
        ...(variant.compareAtPrice !== undefined ? { compareAtPrice: variant.compareAtPrice } : {}),
        ...(variant.sku ? { sku: variant.sku } : {}),
        ...(variant.barcode ? { barcode: variant.barcode } : {}),
        ...(variant.inventoryPolicy ? { inventoryPolicy: variant.inventoryPolicy } : {}),
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
    console.error("Product refresh after create failed:", error.name, error.response?.status);
  }
  return Product.findById(productId);
}

// Creates a product in Shopify from a SmartSell request. Safe to call again
// with the same idempotency key: it never creates a second Shopify product.
// Returns { status, product, replay?, notSent? }.
export async function createProduct(userId, value) {
  const store = await requireStore(userId, value.storeId);
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
    console.error("Product create failed:", { outcome, code: error.code, status: error.response?.status });
    throw failureResponse(error, outcome);
  }

  return { status: 201, product: await finishCreate(client, store, placeholder, shopifyProductId) };
}

// Applies validated changes to an existing Shopify product. Both mutations
// set absolute values, so repeating an update is safe.
export async function updateProduct(userId, id, value) {
  const product = await findOwnedProduct(userId, id);
  if (!product || product.archivedAt || !product.shopifyProductId) {
    throw new ProductServiceError(404, "not_found", "Product not found.");
  }

  const variants = product.variants || [];
  if (value.variant && variants.length !== 1) {
    throw new ProductServiceError(
      422,
      "multiple_variants",
      `This product has ${variants.length} variants. Edit variant prices and SKUs in Shopify.`,
    );
  }

  const store = await requireStore(userId, product.shopifyStore);
  const client = createClient(store.shop, store.accessToken);
  const gid = productGid(product.shopifyProductId);

  const productFields = {};
  for (const key of ["title", "descriptionHtml", "vendor", "productType", "tags", "status", "handle", "seo"]) {
    if (value[key] !== undefined) productFields[key] = value[key];
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

    if (value.variant) {
      const { sku, ...variantFields } = value.variant;
      const data = await shopifyGraphql(client, VARIANTS_UPDATE, {
        productId: gid,
        variants: [
          {
            id: `gid://shopify/ProductVariant/${variants[0].id}`,
            ...variantFields,
            ...(sku !== undefined ? { inventoryItem: { sku } } : {}),
          },
        ],
      });
      assertNoUserErrors(data.productVariantsBulkUpdate, "productVariantsBulkUpdate");
    }
  } catch (error) {
    const outcome = classifyFailure(error);
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
    await refreshFromShopify(client, store, product.shopifyProductId).catch(() => {});
    throw failureResponse(error, outcome);
  }

  try {
    await refreshFromShopify(client, store, product.shopifyProductId);
    await Product.updateOne(
      { _id: product._id },
      { $set: { syncStatus: "synced", lastSyncError: null }, $unset: { pendingOperation: 1 } },
    );
  } catch {
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
      await refreshFromShopify(client, store, product.shopifyProductId);
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
