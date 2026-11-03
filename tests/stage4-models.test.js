import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import Product from "@/models/Product";
import WebhookEvent from "@/models/WebhookEvent";
import { linkStore } from "@/lib/shopify/stores";
import { syncProducts } from "@/lib/shopify/syncProduct";
import { getInventoryRows } from "@/lib/catalog";
import { migrate } from "@/scripts/migrations/stage4-indexes.mjs";
import { createUser, resetDatabase } from "./helpers/db";
import { fakeShopify, shopifyProduct } from "./helpers/fakeShopify";

async function newStore() {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: `s${Date.now()}${Math.floor(Math.random() * 1e6)}.myshopify.com`, accessToken: "t", scope: "" });
  return { user, store };
}

function pendingProduct(user, store, overrides = {}) {
  return {
    user: user._id,
    shopifyStore: store._id,
    title: "Draft",
    origin: "smartsell",
    syncStatus: "pending",
    pendingOperation: { type: "create", startedAt: new Date(), attempts: 1 },
    ...overrides,
  };
}

describe("Product model (Stage 4)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await Product.syncIndexes();
  });

  it("allows several pending creates without a Shopify ID", async () => {
    const { user, store } = await newStore();
    await Product.create(pendingProduct(user, store, { idempotencyKey: "k1" }));
    await Product.create(pendingProduct(user, store, { idempotencyKey: "k2" }));
    expect(await Product.countDocuments({ shopifyProductId: { $exists: false } })).toBe(2);
  });

  it("still allows only one record per Shopify product per store", async () => {
    const { user, store } = await newStore();
    await Product.create({ user: user._id, shopifyStore: store._id, title: "A", shopifyProductId: "1" });
    await expect(
      Product.create({ user: user._id, shopifyStore: store._id, title: "B", shopifyProductId: "1" }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("rejects a reused idempotency key in the same store but allows it in another", async () => {
    const a = await newStore();
    const b = await newStore();
    await Product.create(pendingProduct(a.user, a.store, { idempotencyKey: "same" }));
    await expect(Product.create(pendingProduct(a.user, a.store, { idempotencyKey: "same" }))).rejects.toMatchObject({ code: 11000 });
    await expect(Product.create(pendingProduct(b.user, b.store, { idempotencyKey: "same" }))).resolves.toBeDefined();
  });

  it("validates enums", async () => {
    const { user, store } = await newStore();
    await expect(Product.create(pendingProduct(user, store, { syncStatus: "weird" }))).rejects.toThrow();
    await expect(Product.create(pendingProduct(user, store, { pendingOperation: { type: "explode" } }))).rejects.toThrow();
    await expect(Product.create(pendingProduct(user, store, { archiveReason: "because" }))).rejects.toThrow();
  });

  it("full sync never archives a pending SmartSell create, and catalog rows skip it", async () => {
    const { user, store } = await newStore();
    await Product.create(pendingProduct(user, store, { idempotencyKey: "k" }));

    const result = await syncProducts(fakeShopify({ products: [shopifyProduct(1)] }), store);
    expect(result.archived).toBe(0);
    const pending = await Product.findOne({ idempotencyKey: "k" }).lean();
    expect(pending.archivedAt).toBeUndefined();

    const { rows } = await getInventoryRows(user._id, [store._id]);
    expect(rows.map((r) => r.product_id)).toEqual(["1"]);
  });

  it("records why a product was archived", async () => {
    const { store } = await newStore();
    await syncProducts(fakeShopify({ products: [shopifyProduct(1), shopifyProduct(2)] }), store);
    await syncProducts(fakeShopify({ products: [shopifyProduct(1)] }), store);
    expect((await Product.findOne({ shopifyProductId: "2" }).lean()).archiveReason).toBe("deleted_in_shopify");
  });
});

describe("WebhookEvent model", () => {
  beforeEach(async () => {
    await resetDatabase();
    await WebhookEvent.syncIndexes();
  });

  const event = (store, overrides = {}) => ({
    webhookId: "wh-1",
    topic: "products/update",
    shop: store.shop,
    shopifyStore: store._id,
    user: store.user,
    resourceId: "1",
    payload: { id: 1 },
    ...overrides,
  });

  it("defaults to pending and due now", async () => {
    const { store } = await newStore();
    const saved = await WebhookEvent.create(event(store));
    expect(saved.status).toBe("pending");
    expect(saved.attempts).toBe(0);
    expect(saved.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("deduplicates by Shopify webhook ID", async () => {
    const { store } = await newStore();
    await WebhookEvent.create(event(store));
    await expect(WebhookEvent.create(event(store))).rejects.toMatchObject({ code: 11000 });
  });

  it("requires the verified identity fields and a known status", async () => {
    const { store } = await newStore();
    await expect(WebhookEvent.create(event(store, { webhookId: undefined }))).rejects.toThrow();
    await expect(WebhookEvent.create(event(store, { shopifyStore: undefined }))).rejects.toThrow();
    await expect(WebhookEvent.create(event(store, { payload: undefined }))).rejects.toThrow();
    await expect(WebhookEvent.create(event(store, { status: "lost" }))).rejects.toThrow();
  });

  it("has a TTL index for cleanup", async () => {
    const ttl = (await WebhookEvent.collection.indexes()).find((i) => i.key.expiresAt);
    expect(ttl.expireAfterSeconds).toBe(0);
  });
});

describe("stage 4 index migration", () => {
  beforeEach(async () => {
    await resetDatabase();
    await mongoose.connection.db.collection("products").dropIndexes().catch(() => {});
  });

  const db = () => mongoose.connection.db;
  const productIdIndex = async () =>
    (await db().collection("products").indexes()).find((i) => i.key.shopifyProductId === 1 && i.key.shopifyStore === 1);

  it("dry run changes nothing; apply converts the old index and is idempotent", async () => {
    const products = db().collection("products");
    await products.createIndex({ shopifyStore: 1, shopifyProductId: 1 }, { unique: true });
    const storeId = new mongoose.Types.ObjectId();
    await products.insertOne({ shopifyStore: storeId, shopifyProductId: "1", title: "keep me" });
    const logs = [];

    await migrate(db(), { apply: false, log: (m) => logs.push(m) });
    expect((await productIdIndex()).partialFilterExpression).toBeUndefined();
    expect(logs.join("\n")).toContain("Dry run only");

    await migrate(db(), { apply: true, log: () => {} });
    const index = await productIdIndex();
    expect(index.unique).toBe(true);
    expect(index.partialFilterExpression).toEqual({ shopifyProductId: { $type: "string" } });
    expect(await products.countDocuments({ title: "keep me" })).toBe(1);

    // Uniqueness is still enforced after the migration.
    await expect(products.insertOne({ shopifyStore: storeId, shopifyProductId: "1" })).rejects.toMatchObject({ code: 11000 });

    const second = [];
    await migrate(db(), { apply: true, log: (m) => second.push(m) });
    expect(second.join("\n")).toContain("already partial unique");
  });

  it("refuses to migrate when duplicates exist, without changing anything", async () => {
    const products = db().collection("products");
    const storeId = new mongoose.Types.ObjectId();
    await products.insertMany([
      { shopifyStore: storeId, shopifyProductId: "9" },
      { shopifyStore: storeId, shopifyProductId: "9" },
    ]);
    await expect(migrate(db(), { apply: true, log: () => {} })).rejects.toThrow(/duplicate/);
    expect(await products.countDocuments()).toBe(2);
  });
});
