import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Products";
import WebhookEvent from "@/models/WebhookEvent";
import Shopifystore from "@/models/ShopifyUser";
import { linkStore } from "@/lib/Shopify/stores";
import { verifyWebhookHmac } from "@/lib/webhooks/verify";
import { processDueEvents } from "@/lib/webhooks/queue";
import { ensureWebhookSubscriptions, getWebhookCallbackUrl } from "@/lib/Shopify/webhookRegistration";
import { createUser, resetDatabase } from "./helpers/db";
import { fakeShopifyStore, shopifyProduct } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/Shopify/client", () => ({ createClient: () => shopify.current }));

const { POST: webhook } = await import("@/app/api/shopify/webhooks/route");
const { GET: worker } = await import("@/app/api/shopify/webhooks/process/route");
const { createProduct } = await import("@/lib/products/service");
const { validateProductInput } = await import("@/lib/products/validation");

const SECRET = process.env.SHOPIFY_CLIENT_SECRET;
let seq = 0;

function sign(body, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

function delivery({ shop, topic = "products/update", payload, webhookId = `wh-${++seq}`, hmac, triggeredAt, rawBody } = {}) {
  const body = rawBody ?? JSON.stringify(payload);
  return new NextRequest("http://localhost:3000/api/shopify/webhooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac ?? sign(body),
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": webhookId,
      "x-shopify-api-version": "2026-07",
      ...(triggeredAt ? { "x-shopify-triggered-at": triggeredAt } : {}),
    },
    body,
  });
}

async function newStore(shop = `s${Math.floor(Math.random() * 1e9)}.myshopify.com`) {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop, accessToken: "t", scope: "read_products" });
  return { user, store, shop };
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Product.syncIndexes(), WebhookEvent.syncIndexes(), Shopifystore.init()]);
  shopify.current = fakeShopifyStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HMAC verification", () => {
  const body = Buffer.from('{"id":1,"title":"x"}');

  it("accepts the exact signed bytes only", () => {
    expect(verifyWebhookHmac(body, sign(body), SECRET)).toBe(true);
    expect(verifyWebhookHmac(Buffer.from('{"id":1,"title":"y"}'), sign(body), SECRET)).toBe(false);
    // Re-serialized JSON (different whitespace) does not match.
    expect(verifyWebhookHmac(Buffer.from('{"id": 1, "title": "x"}'), sign(body), SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, null, SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, "not base64 !!", SECRET)).toBe(false);
    expect(verifyWebhookHmac(body, sign(body), "")).toBe(false);
  });
});

describe("POST /api/shopify/webhooks", () => {
  it("rejects an invalid signature and stores nothing", async () => {
    const { shop } = await newStore();
    const res = await webhook(delivery({ shop, payload: shopifyProduct(1), hmac: sign("other body") }));
    expect(res.status).toBe(401);
    expect(await WebhookEvent.countDocuments()).toBe(0);
    expect(await Product.countDocuments()).toBe(0);
  });

  it("stores, processes and acknowledges a product update", async () => {
    const { shop, store } = await newStore();
    const res = await webhook(delivery({ shop, payload: shopifyProduct(1, { title: "From Shopify" }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, status: "completed" });

    const product = await Product.findOne({ shopifyStore: store._id, shopifyProductId: "1" }).lean();
    expect(product.title).toBe("From Shopify");
    const event = await WebhookEvent.findOne().lean();
    expect(event).toMatchObject({ status: "completed", outcome: "created", attempts: 1, topic: "products/update", resourceId: "1" });
    expect(event.expiresAt).toBeInstanceOf(Date);
  });

  it("a duplicate delivery (same webhook ID) is acknowledged without reprocessing", async () => {
    const { shop } = await newStore();
    const payload = shopifyProduct(1);
    expect((await webhook(delivery({ shop, payload, webhookId: "same" }))).status).toBe(200);
    const res = await webhook(delivery({ shop, payload, webhookId: "same" }));
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(await WebhookEvent.countDocuments()).toBe(1);
    expect(await Product.countDocuments()).toBe(1);
  });

  it("separate deliveries of the same change never create a duplicate product", async () => {
    const { shop } = await newStore();
    const payload = shopifyProduct(1);
    await webhook(delivery({ shop, topic: "products/create", payload }));
    await webhook(delivery({ shop, topic: "products/update", payload }));
    expect(await Product.countDocuments()).toBe(1);
  });

  it("ignores out-of-order (older) updates", async () => {
    const { shop } = await newStore();
    await webhook(delivery({ shop, payload: shopifyProduct(1, { title: "Newer", updated_at: "2026-10-05T00:00:00Z" }) }));
    await webhook(delivery({ shop, payload: shopifyProduct(1, { title: "Older", updated_at: "2026-10-01T00:00:00Z" }) }));
    expect((await Product.findOne({ shopifyProductId: "1" })).title).toBe("Newer");
    expect((await WebhookEvent.find().sort({ createdAt: 1 }).lean()).map((e) => e.outcome)).toEqual(["created", "skipped_stale"]);
  });

  it("delete archives the record; a late update cannot revive it", async () => {
    const { shop } = await newStore();
    await webhook(delivery({ shop, payload: shopifyProduct(1, { updated_at: "2026-10-01T00:00:00Z" }) }));
    await webhook(delivery({ shop, topic: "products/delete", payload: { id: 1 }, triggeredAt: "2026-10-02T00:00:00Z" }));

    let doc = await Product.findOne({ shopifyProductId: "1" }).lean();
    expect(doc).toMatchObject({ archiveReason: "deleted_in_shopify" });
    expect(doc.archivedAt).toBeInstanceOf(Date);

    await webhook(delivery({ shop, payload: shopifyProduct(1, { title: "Late", updated_at: "2026-10-01T12:00:00Z" }) }));
    doc = await Product.findOne({ shopifyProductId: "1" }).lean();
    expect(doc.archivedAt).toBeInstanceOf(Date);
    expect(doc.title).not.toBe("Late");
  });

  it("delete arriving before create leaves a tombstone, so the late create is ignored", async () => {
    const { shop } = await newStore();
    await webhook(delivery({ shop, topic: "products/delete", payload: { id: 7 }, triggeredAt: "2026-10-03T00:00:00Z" }));
    await webhook(delivery({ shop, topic: "products/create", payload: shopifyProduct(7, { updated_at: "2026-10-01T00:00:00Z" }) }));

    const docs = await Product.find({ shopifyProductId: "7" }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].archiveReason).toBe("deleted_in_shopify");
  });

  it("a SmartSell product deleted in SmartSell stays archived on the echo webhook", async () => {
    const { user, shop } = await newStore();
    const value = validateProductInput({ idempotencyKey: "key-webhook-01", title: "Mug", price: "1" }, { mode: "create" }).value;
    const { product } = await createProduct(user._id, value);
    const { deleteProduct } = await import("@/lib/products/service");
    await deleteProduct(user._id, product._id);

    await webhook(delivery({ shop, topic: "products/delete", payload: { id: Number(product.shopifyProductId) } }));
    const doc = await Product.findById(product._id).lean();
    expect(doc.archiveReason).toBe("deleted_in_smartsell");
  });

  it("the echo of a SmartSell edit causes no loop and no duplicate", async () => {
    const { user, shop } = await newStore();
    const value = validateProductInput({ idempotencyKey: "key-webhook-02", title: "Mug", price: "1" }, { mode: "create" }).value;
    const { product } = await createProduct(user._id, value);
    const mutationsBefore = shopify.current.state.mutations.length;

    const echo = shopify.current.state.products[0];
    await webhook(delivery({ shop, topic: "products/create", payload: echo }));
    await webhook(delivery({ shop, topic: "products/update", payload: echo }));

    expect(shopify.current.state.mutations.length).toBe(mutationsBefore); // nothing sent back to Shopify
    expect(await Product.countDocuments()).toBe(1);
    expect((await Product.findById(product._id).lean()).origin).toBe("smartsell");
  });

  it("only touches the store named in the (signed) shop header", async () => {
    const a = await newStore();
    const b = await newStore();
    await webhook(delivery({ shop: a.shop, payload: shopifyProduct(1, { title: "A" }) }));
    await webhook(delivery({ shop: b.shop, payload: shopifyProduct(1, { title: "B" }) }));

    expect((await Product.findOne({ shopifyStore: a.store._id })).title).toBe("A");
    expect((await Product.findOne({ shopifyStore: b.store._id })).title).toBe("B");
    expect(String((await Product.findOne({ shopifyStore: b.store._id })).user)).toBe(String(b.user._id));
  });

  it("acknowledges but ignores unknown shops and unsupported topics", async () => {
    const res1 = await webhook(delivery({ shop: "unknown.myshopify.com", payload: shopifyProduct(1) }));
    expect(await res1.json()).toMatchObject({ ignored: "unknown_shop" });
    const { shop } = await newStore();
    const res2 = await webhook(delivery({ shop, topic: "customers/create", payload: { id: 1 } }));
    expect(await res2.json()).toMatchObject({ ignored: "topic" });
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });

  it("rejects missing headers, bad shop domains and invalid payloads", async () => {
    const { shop } = await newStore();
    expect((await webhook(delivery({ shop: "evil.com", payload: shopifyProduct(1) }))).status).toBe(400);
    expect((await webhook(delivery({ shop, rawBody: "not json" }))).status).toBe(400);
    expect((await webhook(delivery({ shop, payload: { title: "no id" } }))).status).toBe(400);
  });

  it("app/uninstalled disconnects the store and stores no shop details", async () => {
    const { shop, store } = await newStore();
    await webhook(delivery({ shop, topic: "app/uninstalled", payload: { id: 1, email: "owner@example.com", phone: "123" } }));

    const saved = await Shopifystore.findById(store._id).select("+accessToken").lean();
    expect(saved.status).toBe("disconnected");
    expect(saved.accessToken).toBeUndefined();
    const event = await WebhookEvent.findOne().lean();
    expect(event.payload).toEqual({ id: 1 });
    expect(JSON.stringify(event)).not.toMatch(/owner@example.com|"phone"/);

    // Further events for the uninstalled shop are ignored.
    const res = await webhook(delivery({ shop, payload: shopifyProduct(1) }));
    expect(await res.json()).toMatchObject({ ignored: "unknown_shop" });
  });

  it("returns 503 (so Shopify retries) when the event cannot be stored", async () => {
    const { shop } = await newStore();
    vi.spyOn(WebhookEvent, "create").mockRejectedValueOnce(Object.assign(new Error("db down"), { name: "MongoNetworkError" }));
    expect((await webhook(delivery({ shop, payload: shopifyProduct(1) }))).status).toBe(503);
  });

  it("a processing failure is kept for retry and acknowledged to Shopify", async () => {
    const { shop } = await newStore();
    vi.spyOn(Product, "bulkWrite").mockRejectedValueOnce(Object.assign(new Error("db hiccup"), { name: "MongoNetworkError" }));

    const res = await webhook(delivery({ shop, payload: shopifyProduct(1) }));
    expect(res.status).toBe(200);
    let event = await WebhookEvent.findOne().lean();
    expect(event).toMatchObject({ status: "pending", attempts: 1, lastError: "MongoNetworkError" });
    expect(event.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await Product.countDocuments()).toBe(0);

    await WebhookEvent.updateOne({ _id: event._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await processDueEvents()).toMatchObject({ processed: 1, completed: 1 });
    event = await WebhookEvent.findOne().lean();
    expect(event).toMatchObject({ status: "completed", attempts: 2 });
    expect(await Product.countDocuments()).toBe(1);
  });

  it("recovers an event whose worker stopped mid-processing (expired lock)", async () => {
    const { shop, store } = await newStore();
    await WebhookEvent.create({
      webhookId: "stuck", topic: "products/update", shop, shopifyStore: store._id, user: store.user,
      payload: shopifyProduct(1), status: "processing", attempts: 1, lockedUntil: new Date(Date.now() - 1000),
    });
    expect(await processDueEvents()).toMatchObject({ completed: 1 });
    expect(await Product.countDocuments()).toBe(1);
  });

  it("does not steal an event another worker holds", async () => {
    const { shop, store } = await newStore();
    await WebhookEvent.create({
      webhookId: "held", topic: "products/update", shop, shopifyStore: store._id, user: store.user,
      payload: shopifyProduct(1), status: "processing", attempts: 1, lockedUntil: new Date(Date.now() + 60000),
    });
    expect(await processDueEvents()).toMatchObject({ processed: 0 });
  });

  it("gives up after the maximum attempts and keeps the event for inspection", async () => {
    const { shop, store } = await newStore();
    await WebhookEvent.create({
      webhookId: "doomed", topic: "products/update", shop, shopifyStore: store._id, user: store.user,
      payload: shopifyProduct(1), attempts: 7,
    });
    vi.spyOn(Product, "bulkWrite").mockRejectedValue(new Error("still down"));
    await processDueEvents();
    const event = await WebhookEvent.findOne({ webhookId: "doomed" }).lean();
    expect(event).toMatchObject({ status: "failed", attempts: 8 });
    expect(event.expiresAt).toBeInstanceOf(Date);
  });
});

describe("order and inventory webhooks", () => {
  const order = (overrides = {}) => ({
    id: 501,
    name: "#1501",
    order_number: 1501,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    cancelled_at: null,
    financial_status: "paid",
    fulfillment_status: null,
    total_price: "50.00",
    current_total_price: "50.00",
    currency: "USD",
    note: "leave at the back door",
    phone: "+15551234567",
    customer: { first_name: "Ada", last_name: "L", email: "ada@example.com", phone: "+1555", default_address: { address1: "1 Secret St" } },
    shipping_address: { address1: "1 Secret St" },
    billing_address: { address1: "1 Secret St" },
    payment_details: { credit_card_number: "•••• 4242" },
    line_items: [{ product_id: 1, variant_id: 10, title: "Mug", quantity: 2, price: "25.00", properties: [{ name: "gift note", value: "hi" }] }],
    ...overrides,
  });

  it("orders/create stores the order and keeps no addresses or payment details", async () => {
    const { shop, store } = await newStore();
    const res = await webhook(delivery({ shop, topic: "orders/create", payload: order() }));
    expect(await res.json()).toMatchObject({ status: "completed" });

    const Order = (await import("@/models/Order")).default;
    const saved = await Order.findOne({ shopifyStore: store._id, shopifyOrderId: "501" }).lean();
    expect(saved).toMatchObject({ name: "#1501", totalPrice: 50, financialStatus: "paid", customer: { name: "Ada L", email: "ada@example.com" } });

    const event = await WebhookEvent.findOne({ topic: "orders/create" }).lean();
    const stored = JSON.stringify(event.payload);
    expect(stored).not.toMatch(/Secret St|back door|4242|\+1555|gift note/);
    expect(event).toMatchObject({ outcome: "created", resourceId: "501" });
  });

  it("orders/updated applies cancellation; an older update is ignored", async () => {
    const { shop, store } = await newStore();
    await webhook(delivery({ shop, topic: "orders/create", payload: order() }));
    await webhook(delivery({ shop, topic: "orders/updated", payload: order({ updated_at: "2026-11-02T00:00:00Z", cancelled_at: "2026-11-02T00:00:00Z", financial_status: "refunded", current_total_price: "0.00" }) }));
    await webhook(delivery({ shop, topic: "orders/updated", payload: order({ updated_at: "2026-11-01T12:00:00Z", financial_status: "paid" }) }));

    const Order = (await import("@/models/Order")).default;
    const saved = await Order.findOne({ shopifyStore: store._id, shopifyOrderId: "501" }).lean();
    expect(saved.cancelledAt).toBeInstanceOf(Date);
    expect(saved.financialStatus).toBe("refunded");
    expect(await Order.countDocuments()).toBe(1);
  });

  it("inventory_levels/update stores the level linked to its product; untracked stays null; older is ignored", async () => {
    const { shop, store } = await newStore();
    await webhook(delivery({ shop, payload: shopifyProduct(1) })); // variant inventory_item_id 100
    const Inventory = (await import("@/models/Inventory")).default;

    await webhook(delivery({ shop, topic: "inventory_levels/update", payload: { inventory_item_id: 100, location_id: 7, available: 12, updated_at: "2026-11-02T00:00:00Z" } }));
    let level = await Inventory.findOne({ shopifyStore: store._id, inventoryItemId: "100", locationId: "7" }).lean();
    expect(level).toMatchObject({ available: 12, productId: "1", variantId: "10" });

    await webhook(delivery({ shop, topic: "inventory_levels/update", payload: { inventory_item_id: 100, location_id: 7, available: 99, updated_at: "2026-11-01T00:00:00Z" } }));
    level = await Inventory.findOne({ inventoryItemId: "100" }).lean();
    expect(level.available).toBe(12);

    await webhook(delivery({ shop, topic: "inventory_levels/update", payload: { inventory_item_id: 100, location_id: 7, available: null, updated_at: "2026-11-03T00:00:00Z" } }));
    expect((await Inventory.findOne({ inventoryItemId: "100" }).lean()).available).toBeNull();
    expect(await Inventory.countDocuments()).toBe(1);

    const event = await WebhookEvent.findOne({ topic: "inventory_levels/update" }).lean();
    expect(event.resourceId).toBe("100:7");
  });

  it("rejects inventory payloads without item or location", async () => {
    const { shop } = await newStore();
    const res = await webhook(delivery({ shop, topic: "inventory_levels/update", payload: { available: 1 } }));
    expect(res.status).toBe(400);
  });
});

describe("webhook registration", () => {
  function fakeSubscriptionsClient(initial = []) {
    const subs = [...initial];
    let next = 1;
    const calls = [];
    return {
      subs,
      calls,
      async post(_url, { query, variables }) {
        const op = query.match(/webhookSubscription(Create|Update|Delete)|webhookSubscriptions/)[0];
        calls.push(op);
        if (op === "webhookSubscriptions") return { data: { data: { webhookSubscriptions: { nodes: subs.map((s) => ({ ...s })) } } } };
        if (op === "webhookSubscriptionCreate") {
          subs.push({ id: `gid://${next++}`, topic: variables.topic, uri: variables.uri });
          return { data: { data: { webhookSubscriptionCreate: { webhookSubscription: { id: "x" }, userErrors: [] } } } };
        }
        if (op === "webhookSubscriptionUpdate") {
          subs.find((s) => s.id === variables.id).uri = variables.uri;
          return { data: { data: { webhookSubscriptionUpdate: { webhookSubscription: { id: variables.id }, userErrors: [] } } } };
        }
        subs.splice(subs.findIndex((s) => s.id === variables.id), 1);
        return { data: { data: { webhookSubscriptionDelete: { deletedWebhookSubscriptionId: variables.id, userErrors: [] } } } };
      },
    };
  }

  const URL_A = "https://app.example.com/api/shopify/webhooks";

  it("creates one subscription per topic and is idempotent", async () => {
    const client = fakeSubscriptionsClient();
    expect(await ensureWebhookSubscriptions(client, URL_A)).toEqual({ created: 7, updated: 0, deleted: 0, unchanged: 0, failed: [] });
    expect(await ensureWebhookSubscriptions(client, URL_A)).toEqual({ created: 0, updated: 0, deleted: 0, unchanged: 7, failed: [] });
    expect(client.subs.map((s) => s.topic).sort()).toEqual([
      "APP_UNINSTALLED", "INVENTORY_LEVELS_UPDATE", "ORDERS_CREATE", "ORDERS_UPDATED",
      "PRODUCTS_CREATE", "PRODUCTS_DELETE", "PRODUCTS_UPDATE",
    ]);
  });

  it("moves stale subscriptions to the new URL and removes duplicates", async () => {
    const client = fakeSubscriptionsClient([
      { id: "1", topic: "PRODUCTS_UPDATE", uri: "https://old-tunnel.trycloudflare.com/api/shopify/webhooks" },
      { id: "2", topic: "PRODUCTS_UPDATE", uri: "https://older.example.com/api/shopify/webhooks" },
    ]);
    const summary = await ensureWebhookSubscriptions(client, URL_A);
    expect(summary).toMatchObject({ created: 6, updated: 1, deleted: 1, failed: [] });
    expect(client.subs.filter((s) => s.topic === "PRODUCTS_UPDATE")).toEqual([{ id: "1", topic: "PRODUCTS_UPDATE", uri: URL_A }]);
  });

  it("a topic Shopify refuses is reported without stopping the others", async () => {
    const client = fakeSubscriptionsClient();
    const original = client.post.bind(client);
    client.post = async (url, body) => {
      if (body.variables?.topic === "ORDERS_CREATE") {
        return { data: { data: { webhookSubscriptionCreate: { webhookSubscription: null, userErrors: [{ field: ["topic"], message: "Not approved for protected customer data" }] } } } };
      }
      return original(url, body);
    };
    const summary = await ensureWebhookSubscriptions(client, URL_A);
    expect(summary.created).toBe(6);
    expect(summary.failed).toEqual([{ topic: "orders/create", error: "Not approved for protected customer data" }]);
  });

  it("only accepts public HTTPS base URLs", () => {
    const original = process.env.SHOPIFY_WEBHOOK_BASE_URL;
    try {
      for (const bad of ["", "http://app.example.com", "https://localhost:3000", "not a url"]) {
        process.env.SHOPIFY_WEBHOOK_BASE_URL = bad;
        expect(getWebhookCallbackUrl()).toBeNull();
      }
      process.env.SHOPIFY_WEBHOOK_BASE_URL = "https://app.example.com/";
      expect(getWebhookCallbackUrl()).toBe(URL_A);
    } finally {
      process.env.SHOPIFY_WEBHOOK_BASE_URL = original ?? "";
    }
  });
});

describe("recovery worker (cron)", () => {
  const call = (auth) =>
    worker(new NextRequest("http://localhost:3000/api/shopify/webhooks/process", { headers: auth ? { authorization: auth } : {} }));

  it("requires CRON_SECRET and the matching bearer token", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer x")).status).toBe(503);
    process.env.CRON_SECRET = "cron-secret-value";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    const res = await call("Bearer cron-secret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, processed: 0 });
    delete process.env.CRON_SECRET;
  });
});
