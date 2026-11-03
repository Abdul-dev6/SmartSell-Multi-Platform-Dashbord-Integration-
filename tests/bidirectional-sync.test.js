import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Product";
import Order from "@/models/Order";
import Inventory from "@/models/Inventory";
import WebhookEvent from "@/models/WebhookEvent";
import Shopifystore from "@/models/ShopifyStore";
import { linkStore } from "@/lib/shopify/stores";
import { syncProducts, upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { upsertShopifyOrders } from "@/lib/shopify/ordersync";
import { upsertInventoryLevel } from "@/lib/shopify/syncinventory";
import { validateProductInput } from "@/lib/products/validation";
import { createUser, resetDatabase } from "./helpers/db";
import { fakeShopify, fakeShopifyStore, shopifyOrder, shopifyProduct } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/shopify/client", () => ({ createClient: () => shopify.current }));

const { POST: webhook } = await import("@/app/api/shopify/webhooks/route");
const { createProduct, updateProduct, deleteProduct, retryProduct } = await import("@/lib/products/service");
const { reconcileStaleStores } = await import("@/lib/shopify/syncStore");

const SECRET = process.env.SHOPIFY_CLIENT_SECRET;
let seq = 0;

function delivery({ shop, topic = "products/update", payload, triggeredAt }) {
  const body = JSON.stringify(payload);
  return new NextRequest("http://localhost:3000/api/shopify/webhooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": crypto.createHmac("sha256", SECRET).update(body).digest("base64"),
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": `bi-${++seq}`,
      ...(triggeredAt ? { "x-shopify-triggered-at": triggeredAt } : {}),
    },
    body,
  });
}

async function setup(products = []) {
  const user = await createUser();
  const shop = `s${Math.floor(Math.random() * 1e9)}.myshopify.com`;
  const store = await linkStore({ userId: user._id, shop, accessToken: "t", scope: "write_products" });
  shopify.current = fakeShopifyStore({ products });
  return { user, store, shop };
}

const createInput = (key = "key-bidir-0001") =>
  validateProductInput({ idempotencyKey: key, title: "Sync Mug", price: "9.00", status: "draft" }, { mode: "create" }).value;

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Product.syncIndexes(), WebhookEvent.syncIndexes(), Shopifystore.init(), Order.init(), Inventory.init()]);
});

describe("full sync archiving (Shopify → SmartSell reconciliation)", () => {
  it("does not archive a product a webhook stored while the sync was paging", async () => {
    const { store } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(3)], new Date(Date.now() - 60_000)); // deleted in Shopify since

    const base = fakeShopify({ products: [shopifyProduct(1)] });
    let injected = false;
    const client = {
      ...base,
      async post(url, body) {
        const answer = await base.post(url, body);
        if (!injected) {
          injected = true;
          // products/create webhook for a product created after its page was read
          await upsertShopifyProducts(store, [shopifyProduct(2, { updated_at: new Date().toISOString() })]);
        }
        return answer;
      },
    };

    const result = await syncProducts(client, store);
    expect(result.archived).toBe(1);
    const byId = Object.fromEntries((await Product.find().lean()).map((p) => [p.shopifyProductId, p]));
    expect(byId["1"].archivedAt).toBeNull();
    expect(byId["2"].archivedAt).toBeNull();
    expect(byId["3"]).toMatchObject({ archiveReason: "deleted_in_shopify" });
  });

  it("a delayed update for a product the sync archived cannot bring it back", async () => {
    const { store, shop } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(5)], new Date(Date.now() - 60_000));
    await syncProducts(fakeShopify({ products: [] }), store);

    await webhook(delivery({ shop, payload: shopifyProduct(5, { title: "Late", updated_at: new Date(Date.now() - 30_000).toISOString() }) }));
    const doc = await Product.findOne({ shopifyProductId: "5" }).lean();
    expect(doc.archivedAt).toBeInstanceOf(Date);
    expect(doc.title).not.toBe("Late");
  });
});

describe("products/delete webhook", () => {
  it("on an already-archived product still records the deletion time, so late updates stay stale", async () => {
    const { store, shop } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(8, { updated_at: "2026-10-01T00:00:00Z" })]);
    await Product.updateOne({ shopifyProductId: "8" }, { $set: { archivedAt: new Date(), archiveReason: "deleted_in_shopify" } });

    await webhook(delivery({ shop, topic: "products/delete", payload: { id: 8 }, triggeredAt: "2026-10-05T00:00:00Z" }));
    expect((await WebhookEvent.findOne({ topic: "products/delete" }).lean()).outcome).toBe("already_archived");

    await webhook(delivery({ shop, payload: shopifyProduct(8, { title: "Late", updated_at: "2026-10-03T00:00:00Z" }) }));
    const doc = await Product.findOne({ shopifyProductId: "8" }).lean();
    expect(doc.archivedAt).toBeInstanceOf(Date);
    expect(doc.title).not.toBe("Late");
  });

  it("confirms a SmartSell delete whose response was lost and clears the open operation", async () => {
    const { user, shop } = await setup();
    const { product } = await createProduct(user._id, createInput());
    // SmartSell sent the delete; Shopify applied it but the answer never came back.
    await Product.updateOne(
      { _id: product._id },
      { $set: { syncStatus: "failed", pendingOperation: { type: "delete", startedAt: new Date(), attempts: 1, outcome: "unknown" } } },
    );
    shopify.current.state.products = [];

    await webhook(delivery({ shop, topic: "products/delete", payload: { id: Number(product.shopifyProductId) } }));
    const doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ archiveReason: "deleted_in_smartsell", syncStatus: "synced", lastSyncError: null });
    expect(doc.pendingOperation).toBeUndefined();
  });

  it("keeps order history and inventory records", async () => {
    const { store, shop } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(4)]);
    await upsertShopifyOrders(store, [shopifyOrder(1, { line_items: [{ product_id: 4, variant_id: 40, quantity: 1, price: "10.00", title: "Product 4" }] })]);
    await upsertInventoryLevel(store, { inventory_item_id: 400, location_id: 7, available: 3, updated_at: "2026-10-01T00:00:00Z" });
    await upsertInventoryLevel(store, { inventory_item_id: 999, location_id: 7, available: 1, updated_at: "2026-10-01T00:00:00Z" });

    await webhook(delivery({ shop, topic: "products/delete", payload: { id: 4 } }));
    expect((await Product.findOne({ shopifyProductId: "4" }).lean()).archivedAt).toBeInstanceOf(Date);
    expect(await Order.countDocuments()).toBe(1);
    expect(await Inventory.countDocuments()).toBe(2);
  });
});

describe("SmartSell writes to a product Shopify already deleted", () => {
  it("an edit archives the local record instead of failing forever", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, createInput());
    shopify.current.state.products = []; // deleted in Shopify; webhook not here yet

    await expect(updateProduct(user._id, product._id, { title: "Renamed" })).rejects.toMatchObject({ status: 404, code: "deleted_in_shopify" });
    const doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ archiveReason: "deleted_in_shopify", syncStatus: "synced" });
    expect(doc.pendingOperation).toBeUndefined();
  });

  it("retrying a failed record whose product is gone archives it", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, createInput());
    await Product.updateOne({ _id: product._id }, { $set: { syncStatus: "failed" } });
    shopify.current.state.products = [];

    await expect(retryProduct(user._id, product._id)).rejects.toMatchObject({ code: "deleted_in_shopify" });
    expect((await Product.findById(product._id).lean()).archiveReason).toBe("deleted_in_shopify");
  });

  it("a delete whose response was lost is confirmed by checking Shopify", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, createInput());
    shopify.current.state.failNext.productDelete = "lostResponse";

    const result = await deleteProduct(user._id, product._id);
    expect(result.status).toBe(200);
    const doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ archiveReason: "deleted_in_smartsell", syncStatus: "synced" });
    expect(doc.pendingOperation).toBeUndefined();
  });

  it("a delete that never reached Shopify is still reported as failed", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, createInput());
    shopify.current.state.failNext.productDelete = "timeout";

    await expect(deleteProduct(user._id, product._id)).rejects.toMatchObject({ code: "outcome_unknown" });
    expect((await Product.findById(product._id).lean()).archivedAt).toBeFalsy();
    expect(shopify.current.state.products).toHaveLength(1);
  });
});

describe("daily reconciliation", () => {
  it("re-syncs stores not synced recently and archives products whose delete webhook was missed", async () => {
    const { user, store } = await setup();
    const fresh = await linkStore({ userId: (await createUser())._id, shop: "fresh-store.myshopify.com", accessToken: "t", scope: "" });
    await Shopifystore.updateOne({ _id: fresh._id }, { $set: { lastSyncAt: new Date() } });
    await Shopifystore.updateOne({ _id: store._id }, { $set: { lastSyncAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) } });
    await upsertShopifyProducts(store, [shopifyProduct(1), shopifyProduct(2)], new Date(Date.now() - 60_000));
    shopify.current = fakeShopify({ products: [shopifyProduct(1)] }); // 2 was deleted; its webhook never arrived

    const summary = await reconcileStaleStores();
    expect(summary).toMatchObject({ due: 1, synced: 1, failed: 0 });
    expect((await Product.findOne({ shopifyProductId: "2" }).lean()).archiveReason).toBe("deleted_in_shopify");
    expect((await Shopifystore.findById(store._id).lean()).lastSyncAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(user).toBeTruthy();
  });
});

describe("upsert guards", () => {
  it("accepts an authoritative product without updated_at", async () => {
    const { store } = await setup();
    const result = await upsertShopifyProducts(store, [shopifyProduct(11, { updated_at: null })], new Date(), { authoritative: true });
    expect(result.inserted).toBe(1);
  });

  it("a current Shopify listing restores a product a sync archived", async () => {
    const { store } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(12)], new Date(Date.now() - 60_000));
    await syncProducts(fakeShopify({ products: [] }), store);
    await syncProducts(fakeShopify({ products: [shopifyProduct(12)] }), store);
    expect((await Product.findOne({ shopifyProductId: "12" }).lean()).archivedAt).toBeNull();
  });
});
