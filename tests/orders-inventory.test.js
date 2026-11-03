import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Order from "@/models/Order";
import Inventory from "@/models/Inventory";
import Product from "@/models/Product";
import WebhookEvent from "@/models/WebhookEvent";
import Shopifystore from "@/models/ShopifyStore";
import { linkStore } from "@/lib/shopify/stores";
import { reconcileDeletedOrders, upsertShopifyOrders } from "@/lib/shopify/ordersync";
import { syncInventory, upsertInventoryLevel } from "@/lib/shopify/syncinventory";
import { upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { getInventoryRows } from "@/lib/catalog";
import { getDashboardSummary } from "@/lib/analytics/dashboard";
import { WEBHOOK_TOPICS } from "@/lib/shopify/webhookRegistration";
import { SUPPORTED_TOPICS } from "@/lib/webhooks/handlers";
import { createUser, resetDatabase } from "./helpers/db";
import { fakeShopify, shopifyOrder, shopifyProduct } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/shopify/client", () => ({ createClient: () => shopify.current }));

const { POST: webhook } = await import("@/app/api/shopify/webhooks/route");
const { syncStore } = await import("@/lib/shopify/syncStore");

const SECRET = process.env.SHOPIFY_CLIENT_SECRET;
let seq = 0;

function delivery({ shop, topic, payload, triggeredAt }) {
  const body = JSON.stringify(payload);
  return new NextRequest("http://localhost:3000/api/shopify/webhooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": crypto.createHmac("sha256", SECRET).update(body).digest("base64"),
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": `oi-${++seq}`,
      ...(triggeredAt ? { "x-shopify-triggered-at": triggeredAt } : {}),
    },
    body,
  });
}

async function setup() {
  const user = await createUser();
  const shop = `s${Math.floor(Math.random() * 1e9)}.myshopify.com`;
  const store = await linkStore({ userId: user._id, shop, accessToken: "t", scope: "read_orders" });
  return { user, store, shop };
}

const level = (item, location, available, updated_at = "2026-10-01T00:00:00Z") => ({
  inventory_item_id: item,
  location_id: location,
  available,
  updated_at,
});

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Order.syncIndexes(), Inventory.syncIndexes(), Product.syncIndexes(), WebhookEvent.syncIndexes(), Shopifystore.init()]);
});

describe("webhook topics", () => {
  it("subscribes to and handles orders/delete and inventory connect/disconnect, but no location topics", () => {
    const topics = Object.values(WEBHOOK_TOPICS);
    for (const t of ["orders/delete", "inventory_levels/connect", "inventory_levels/disconnect"]) {
      expect(topics).toContain(t);
      expect(SUPPORTED_TOPICS.has(t)).toBe(true);
    }
    expect(topics.some((t) => t.startsWith("locations/"))).toBe(false);
  });
});

describe("orders/delete", () => {
  it("marks the order deleted, keeps the record, and removes it from the dashboard", async () => {
    const { user, store, shop } = await setup();
    await upsertShopifyOrders(store, [shopifyOrder(1), shopifyOrder(2)]);

    const res = await webhook(delivery({ shop, topic: "orders/delete", payload: { id: 1 }, triggeredAt: "2026-10-20T00:00:00Z" }));
    expect(res.status).toBe(200);
    expect(await Order.countDocuments()).toBe(2);
    const doc = await Order.findOne({ shopifyOrderId: "1" }).lean();
    expect(doc.deletedAt.toISOString()).toBe("2026-10-20T00:00:00.000Z");

    const summary = await getDashboardSummary(user._id, [store], { now: new Date("2026-10-25T00:00:00Z") });
    expect(summary.recentOrders.map((o) => o.orderId)).toEqual(["#1002"]);
    expect(summary.totals.orders).toBe(1);
  });

  it("a duplicate delete is harmless; a later orders/updated does not revive it", async () => {
    const { store, shop } = await setup();
    await upsertShopifyOrders(store, [shopifyOrder(3)]);
    await webhook(delivery({ shop, topic: "orders/delete", payload: { id: 3 } }));
    await webhook(delivery({ shop, topic: "orders/delete", payload: { id: 3 } }));
    await webhook(delivery({ shop, topic: "orders/updated", payload: shopifyOrder(3, { updated_at: "2026-10-30T00:00:00Z" }) }));

    const outcomes = (await WebhookEvent.find().sort({ createdAt: 1 }).lean()).map((e) => e.outcome);
    expect(outcomes).toEqual(["deleted", "already_deleted", "updated"]);
    expect((await Order.findOne({ shopifyOrderId: "3" }).lean()).deletedAt).toBeInstanceOf(Date);
  });

  it("a delete arriving before the create leaves a deleted placeholder the create cannot revive", async () => {
    const { store, shop } = await setup();
    await webhook(delivery({ shop, topic: "orders/delete", payload: { id: 4 } }));
    await webhook(delivery({ shop, topic: "orders/create", payload: shopifyOrder(4) }));
    const docs = await Order.find({ shopifyOrderId: "4" }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].deletedAt).toBeInstanceOf(Date);
    expect(docs[0].name).toBe("#1004");
    expect(String(docs[0].user)).toBe(String(store.user));
  });
});

describe("order deletion reconciliation", () => {
  const now = new Date("2026-11-03T00:00:00Z");

  it("marks orders inside the window that Shopify no longer lists; never touches older ones", async () => {
    const { store } = await setup();
    await upsertShopifyOrders(
      store,
      [
        shopifyOrder(1, { created_at: "2026-10-15T00:00:00Z" }),
        shopifyOrder(2, { created_at: "2026-10-16T00:00:00Z" }), // deleted in Shopify, webhook missed
        shopifyOrder(3, { created_at: "2026-07-01T00:00:00Z" }), // older than the 60-day listing
      ],
      new Date("2026-11-01T00:00:00Z"),
    );
    const client = fakeShopify({ orders: [shopifyOrder(1)] });

    const result = await reconcileDeletedOrders(client, store, { now });
    expect(result).toMatchObject({ checked: 1, deleted: 1, restored: 0 });
    const byId = Object.fromEntries((await Order.find().lean()).map((o) => [o.shopifyOrderId, o]));
    expect(byId["1"].deletedAt).toBeUndefined();
    expect(byId["2"].deletedAt).toEqual(now);
    expect(byId["3"].deletedAt).toBeUndefined();

    const call = client.calls.find((c) => c.url === "/orders.json");
    expect(call.params).toMatchObject({ status: "any", fields: "id" });
    expect(new Date(call.params.created_at_min).getTime()).toBe(now.getTime() - 55 * 86400000);
  });

  it("leaves orders stored after the check started, and un-marks orders Shopify still lists", async () => {
    const { store } = await setup();
    await upsertShopifyOrders(store, [shopifyOrder(5, { created_at: "2026-10-20T00:00:00Z" })], new Date("2026-11-03T00:00:05Z"));
    await upsertShopifyOrders(store, [shopifyOrder(6, { created_at: "2026-10-20T00:00:00Z" })], new Date("2026-11-01T00:00:00Z"));
    await Order.updateOne({ shopifyOrderId: "6" }, { $set: { deletedAt: new Date("2026-11-02T00:00:00Z") } });

    const result = await reconcileDeletedOrders(fakeShopify({ orders: [shopifyOrder(6)] }), store, { now });
    expect(result).toMatchObject({ deleted: 0, restored: 1 });
    expect((await Order.findOne({ shopifyOrderId: "5" }).lean()).deletedAt).toBeUndefined();
    expect((await Order.findOne({ shopifyOrderId: "6" }).lean()).deletedAt).toBeUndefined();
  });

  it("a failed listing marks nothing", async () => {
    const { store } = await setup();
    await upsertShopifyOrders(store, [shopifyOrder(7, { created_at: "2026-10-20T00:00:00Z" })], new Date("2026-11-01T00:00:00Z"));
    await expect(reconcileDeletedOrders(fakeShopify({ fail: { orders: 503 } }), store, { now })).rejects.toThrow();
    expect((await Order.findOne({ shopifyOrderId: "7" }).lean()).deletedAt).toBeUndefined();
  });

  it("runs as part of a store sync", async () => {
    const { user, store } = await setup();
    const recent = new Date(Date.now() - 5 * 86400000).toISOString();
    await upsertShopifyOrders(store, [shopifyOrder(8, { created_at: recent })], new Date(Date.now() - 60000));
    shopify.current = fakeShopify({ products: [], orders: [] });
    const result = await syncStore(store._id, user._id);
    expect(result.counts.deletedOrders).toBe(1);
    expect((await Order.findOne({ shopifyOrderId: "8" }).lean()).deletedAt).toBeInstanceOf(Date);
  });
});

describe("inventory connect / disconnect", () => {
  it("disconnect hides the level from inventory rows; other levels and items stay", async () => {
    const { user, store, shop } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(1)]);
    await upsertInventoryLevel(store, level(100, 7, 5));
    await upsertInventoryLevel(store, level(100, 8, 2));
    await upsertInventoryLevel(store, level(999, 7, 1)); // unrelated item

    await webhook(delivery({ shop, topic: "inventory_levels/disconnect", payload: { inventory_item_id: 100, location_id: 8 }, triggeredAt: "2026-10-05T00:00:00Z" }));

    expect(await Inventory.countDocuments()).toBe(3);
    const { rows } = await getInventoryRows(user._id, [store._id]);
    expect(rows.map((r) => `${r.inventory_item_id}:${r.location_id}`)).toEqual(["100:7"]);
    expect((await Inventory.findOne({ inventoryItemId: "999" }).lean()).disconnectedAt).toBeNull();
  });

  it("a delayed older update cannot bring a disconnected level back; a newer connect does", async () => {
    const { store, shop } = await setup();
    await upsertInventoryLevel(store, level(100, 8, 2, "2026-10-01T00:00:00Z"));
    await webhook(delivery({ shop, topic: "inventory_levels/disconnect", payload: { inventory_item_id: 100, location_id: 8 }, triggeredAt: "2026-10-05T00:00:00Z" }));

    await webhook(delivery({ shop, topic: "inventory_levels/update", payload: level(100, 8, 9, "2026-10-03T00:00:00Z") }));
    let doc = await Inventory.findOne({ inventoryItemId: "100", locationId: "8" }).lean();
    expect(doc.disconnectedAt).toBeInstanceOf(Date);

    await webhook(delivery({ shop, topic: "inventory_levels/connect", payload: { inventory_item_id: 100, location_id: 8, available: 0 }, triggeredAt: "2026-10-06T00:00:00Z" }));
    doc = await Inventory.findOne({ inventoryItemId: "100", locationId: "8" }).lean();
    expect(doc.disconnectedAt).toBeNull();
    expect(doc.available).toBe(0);
  });

  it("an older disconnect does not hide a newer level", async () => {
    const { store, shop } = await setup();
    await upsertInventoryLevel(store, level(100, 8, 4, "2026-10-10T00:00:00Z"));
    await webhook(delivery({ shop, topic: "inventory_levels/disconnect", payload: { inventory_item_id: 100, location_id: 8 }, triggeredAt: "2026-10-05T00:00:00Z" }));
    expect((await Inventory.findOne({ inventoryItemId: "100" }).lean()).disconnectedAt).toBeNull();
    expect((await WebhookEvent.findOne({ topic: "inventory_levels/disconnect" }).lean()).outcome).toBe("skipped_stale");
  });

  it("a disconnect before any level is stored leaves a hidden placeholder an older update cannot revive", async () => {
    const { user, store, shop } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(1)]);
    await webhook(delivery({ shop, topic: "inventory_levels/disconnect", payload: { inventory_item_id: 100, location_id: 9 }, triggeredAt: "2026-10-05T00:00:00Z" }));
    await webhook(delivery({ shop, topic: "inventory_levels/update", payload: level(100, 9, 3, "2026-10-04T00:00:00Z") }));
    const { rows } = await getInventoryRows(user._id, [store._id]);
    expect(rows.filter((r) => r.location_id === "9")).toHaveLength(0);
  });
});

describe("full inventory sync", () => {
  it("hides levels Shopify no longer lists for fetched items only, and restores ones that return", async () => {
    const { store } = await setup();
    await upsertInventoryLevel(store, level(100, 7, 5));
    await upsertInventoryLevel(store, level(100, 8, 2)); // no longer stocked at 8
    await upsertInventoryLevel(store, level(555, 7, 1)); // item of an archived product: not fetched
    await Inventory.updateMany({}, { $set: { lastSyncedAt: new Date(Date.now() - 60000) } });

    const items = new Map([["100", { productId: "1", variantId: "10" }]]);
    const result = await syncInventory(fakeShopify({ inventoryLevels: [level(100, 7, 6)] }), store, items);
    expect(result).toMatchObject({ count: 1, disconnected: 1 });
    const byKey = Object.fromEntries((await Inventory.find().lean()).map((l) => [`${l.inventoryItemId}:${l.locationId}`, l]));
    expect(byKey["100:7"]).toMatchObject({ available: 6, disconnectedAt: null });
    expect(byKey["100:8"].disconnectedAt).toBeInstanceOf(Date);
    expect(byKey["555:7"].disconnectedAt).toBeNull();

    await syncInventory(fakeShopify({ inventoryLevels: [level(100, 7, 6), level(100, 8, 2)] }), store, items);
    expect((await Inventory.findOne({ inventoryItemId: "100", locationId: "8" }).lean()).disconnectedAt).toBeNull();
  });

  it("does not hide a level a webhook stored while the sync was running", async () => {
    const { store } = await setup();
    await upsertInventoryLevel(store, level(100, 8, 2));
    const base = fakeShopify({ inventoryLevels: [level(100, 7, 6)] });
    const client = {
      ...base,
      async get(url, options) {
        const answer = await base.get(url, options);
        await upsertInventoryLevel(store, level(100, 8, 3, new Date().toISOString())); // connect webhook mid-sync
        return answer;
      },
    };
    const result = await syncInventory(client, store, new Map([["100", {}]]));
    expect(result.disconnected).toBe(0);
    expect((await Inventory.findOne({ locationId: "8" }).lean()).disconnectedAt).toBeNull();
  });

  it("a failed fetch hides nothing", async () => {
    const { store } = await setup();
    await upsertInventoryLevel(store, level(100, 8, 2));
    await expect(syncInventory(fakeShopify({ fail: { inventory: 503 } }), store, new Map([["100", {}]]))).rejects.toThrow();
    expect((await Inventory.findOne({}).lean()).disconnectedAt).toBeNull();
  });
});
