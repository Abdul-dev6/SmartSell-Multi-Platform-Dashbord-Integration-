import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import Shopifystore from "@/models/ShopifyUser";
import Product from "@/models/Products";
import Inventory from "@/models/Inventory";
import Order from "@/models/Order";
import { linkStore } from "@/lib/Shopify/stores";
import { upsertShopifyProducts } from "@/lib/Shopify/syncProduct";
import { createUser, resetDatabase } from "./helpers/db";
import { fakeShopify, shopifyOrder, shopifyProduct } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/Shopify/client", () => ({
  createClient: () => shopify.current,
}));

const { syncStore } = await import("@/lib/Shopify/syncStore");

const SHOP = "test-store.myshopify.com";

async function setup() {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: SHOP, accessToken: "tok", scope: "read_products" });
  return { user, store };
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Shopifystore.init(), Product.init(), Inventory.init(), Order.init()]);
});

describe("syncStore", () => {
  it("creates the Product, Inventory and Order collections and saves Shopify data", async () => {
    const { user, store } = await setup();
    const products = Array.from({ length: 3 }, (_, i) => shopifyProduct(i + 1));
    shopify.current = fakeShopify({
      products,
      pageSize: 2, // forces pagination
      inventoryLevels: [
        { inventory_item_id: 100, location_id: 7, available: 5, updated_at: "2026-10-01T00:00:00Z" },
        { inventory_item_id: 200, location_id: 7, available: null, updated_at: "2026-10-01T00:00:00Z" },
      ],
      orders: [shopifyOrder(1), shopifyOrder(2)],
    });

    const result = await syncStore(store._id, user._id);
    expect(result.status).toBe("success");
    expect(result.counts).toEqual({ products: 3, archivedProducts: 0, reconciledCreates: 0, inventoryLevels: 2, orders: 2 });

    const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["products", "inventories", "orders"]));

    expect(await Product.countDocuments({ user: user._id, shopifyStore: store._id })).toBe(3);
    const product = await Product.findOne({ shopifyProductId: "1" }).lean();
    expect(product.variants[0]).toMatchObject({ id: "10", sku: "SKU-1", inventoryItemId: "100" });
    expect(product.tags).toEqual(["a", "b"]);

    const levels = await Inventory.find().sort({ inventoryItemId: 1 }).lean();
    expect(levels.map((l) => [l.inventoryItemId, l.available, l.productId])).toEqual([
      ["100", 5, "1"],
      ["200", null, "2"], // untracked stays null, not 0
    ]);

    const order = await Order.findOne({ shopifyOrderId: "1" }).lean();
    expect(order).toMatchObject({
      name: "#1001",
      currency: "PKR",
      totalPrice: 110,
      currentTotalPrice: 110,
      financialStatus: "paid",
      customer: { name: "Ada Lovelace", email: "ada@example.com" },
    });
    expect(order.shopifyCreatedAt.toISOString()).toBe("2026-10-15T10:00:00.000Z");
    expect(order.lineItems[0]).toMatchObject({ productId: "1", quantity: 2, price: 50 });
    // Addresses and raw payloads are not stored.
    expect(JSON.stringify(order)).not.toContain("Secret St");

    const saved = await Shopifystore.findById(store._id).lean();
    expect(saved).toMatchObject({ lastSyncStatus: "success", timezone: "Asia/Karachi", currency: "PKR" });
    expect(saved.locations).toEqual([{ id: "7", name: "Main Warehouse", active: true }]);
    expect(saved.ordersSyncedThrough).toBeInstanceOf(Date);
    expect(saved.syncLockedUntil).toBeUndefined();
  });

  it("re-syncing the same data never creates duplicates", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({
      products: [shopifyProduct(1), shopifyProduct(2)],
      inventoryLevels: [{ inventory_item_id: 100, location_id: 7, available: 5 }],
      orders: [shopifyOrder(1)],
    });

    await syncStore(store._id, user._id);
    await syncStore(store._id, user._id);
    await syncStore(store._id, user._id);

    expect(await Product.countDocuments()).toBe(2);
    expect(await Inventory.countDocuments()).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
  });

  it("asks only for orders updated since the last sync (with overlap)", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({ orders: [shopifyOrder(1)] });
    await syncStore(store._id, user._id);
    const firstOrderCall = shopify.current.calls.find((c) => c.url === "/orders.json");
    expect(firstOrderCall.params.updated_at_min).toBeUndefined();

    shopify.current = fakeShopify({ orders: [shopifyOrder(1)] });
    await syncStore(store._id, user._id);
    const secondOrderCall = shopify.current.calls.find((c) => c.url === "/orders.json");
    const { ordersSyncedThrough } = await Shopifystore.findById(store._id).lean();
    expect(new Date(secondOrderCall.params.updated_at_min).getTime()).toBeLessThan(ordersSyncedThrough.getTime());
  });

  it("archives products deleted in Shopify, keeps their record, and restores them if they return", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({ products: [shopifyProduct(1), shopifyProduct(2)], orders: [shopifyOrder(1)] });
    await syncStore(store._id, user._id);

    shopify.current = fakeShopify({ products: [shopifyProduct(1)], orders: [shopifyOrder(1)] });
    const result = await syncStore(store._id, user._id);
    expect(result.counts.archivedProducts).toBe(1);
    const archived = await Product.findOne({ shopifyProductId: "2" }).lean();
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(await Order.countDocuments()).toBe(1); // order history untouched

    shopify.current = fakeShopify({
      products: [shopifyProduct(1), shopifyProduct(2, { updated_at: "2026-10-02T00:00:00Z" })],
    });
    await syncStore(store._id, user._id);
    expect((await Product.findOne({ shopifyProductId: "2" }).lean()).archivedAt).toBeNull();
  });

  it("does not archive anything when the product fetch fails part-way", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({ products: [shopifyProduct(1)], orders: [] });
    await syncStore(store._id, user._id);

    shopify.current = fakeShopify({ fail: { products: 503 }, orders: [] });
    const result = await syncStore(store._id, user._id);
    expect(result.status).toBe("partial");
    expect(result.errors).toEqual([
      "Products: Shopify request failed (HTTP 503).",
      "Inventory: skipped because products could not be synced.",
    ]);
    expect((await Product.findOne({ shopifyProductId: "1" }).lean()).archivedAt).toBeNull();
  });

  it("reports partial failure and does not advance the order cursor when orders fail", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({ products: [shopifyProduct(1)], fail: { orders: 403 } });

    const result = await syncStore(store._id, user._id);
    expect(result.status).toBe("partial");
    expect(result.errors[0]).toMatch(/^Orders: Missing Shopify permission \(403\)/);
    expect(await Product.countDocuments()).toBe(1);

    const saved = await Shopifystore.findById(store._id).lean();
    expect(saved.lastSyncStatus).toBe("partial");
    expect(saved.lastSyncError).toContain("403");
    expect(saved.ordersSyncedThrough).toBeUndefined();
  });

  it("a failed locations fetch does not fail the sync", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({ products: [shopifyProduct(1)], orders: [], fail: { locations: 403 } });
    expect((await syncStore(store._id, user._id)).status).toBe("success");
  });

  it("marks the sync failed when every phase fails", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({ fail: { products: 401, orders: 401, shop: 401 } });
    const result = await syncStore(store._id, user._id);
    expect(result.status).toBe("failed");
  });

  it("only one sync runs per store at a time", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopify({ products: [shopifyProduct(1)], orders: [shopifyOrder(1)] });

    const [a, b] = await Promise.all([syncStore(store._id, user._id), syncStore(store._id, user._id)]);
    expect([a.status, b.status].sort()).toEqual(["busy", "success"]);
    expect(await Product.countDocuments()).toBe(1);
  });

  it("refuses to sync another user's store", async () => {
    const { store } = await setup();
    const other = await createUser();
    shopify.current = fakeShopify();
    expect((await syncStore(store._id, other._id)).status).toBe("not_found");
    expect(shopify.current.calls).toHaveLength(0);
  });
});

describe("out-of-order protection", () => {
  it("an older Shopify payload never overwrites a newer stored product", async () => {
    const { store } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(1, { title: "New", updated_at: "2026-10-05T00:00:00Z" })]);

    const stale = await upsertShopifyProducts(store, [
      shopifyProduct(1, { title: "Old", updated_at: "2026-10-01T00:00:00Z" }),
    ]);
    expect(stale.skippedStale).toBe(1);
    expect((await Product.findOne({ shopifyProductId: "1" })).title).toBe("New");

    await upsertShopifyProducts(store, [shopifyProduct(1, { title: "Newer", updated_at: "2026-10-06T00:00:00Z" })]);
    expect((await Product.findOne({ shopifyProductId: "1" })).title).toBe("Newer");
    expect(await Product.countDocuments()).toBe(1);
  });
});
