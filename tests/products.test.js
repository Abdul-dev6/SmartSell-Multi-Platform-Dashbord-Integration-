import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Product";
import Order from "@/models/Order";
import Shopifystore from "@/models/ShopifyStore";
import { linkStore } from "@/lib/shopify/stores";
import { upsertShopifyProducts, syncProducts } from "@/lib/shopify/syncProduct";
import { validateProductInput } from "@/lib/products/validation";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { fakeShopifyStore, shopifyOrder, shopifyProduct } from "./helpers/fakeShopify";
import { upsertShopifyOrders } from "@/lib/shopify/ordersync";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/shopify/client", () => ({ createClient: () => shopify.current }));

const service = await import("@/lib/products/service");
const { createProduct, updateProduct, deleteProduct, retryProduct, reconcilePendingCreates } = service;
const productsRoute = await import("@/app/api/products/route");
const productRoute = await import("@/app/api/products/[id]/route");

const KEY = "key-0000000001";
const input = (overrides = {}) =>
  validateProductInput({ idempotencyKey: KEY, title: "Test Mug", price: "12.50", sku: "MUG-1", status: "draft", ...overrides }, { mode: "create" }).value;

async function setup(products = []) {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: `s${Math.floor(Math.random() * 1e9)}.myshopify.com`, accessToken: "t", scope: "write_products" });
  shopify.current = fakeShopifyStore({ products });
  return { user, store };
}

async function age(productId) {
  await Product.updateOne({ _id: productId }, { $set: { "pendingOperation.startedAt": new Date(Date.now() - 10 * 60 * 1000) } });
}

const shopifyProducts = () => shopify.current.state.products;

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Product.syncIndexes(), Shopifystore.init(), Order.init()]);
});

describe("validation", () => {
  it("accepts a valid create and whitelists fields", () => {
    const { value, errors, notSent } = validateProductInput(
      { idempotencyKey: KEY, title: " Mug ", price: "5", comparePrice: "7.5", tags: "a, b, a", status: "active", quantity: "3", cost: "2", hacker: "x" },
      { mode: "create" },
    );
    expect(errors).toEqual({});
    expect(value).toMatchObject({ title: "Mug", status: "ACTIVE", tags: ["a", "b"], variant: { price: "5.00", compareAtPrice: "7.50" } });
    expect(value.hacker).toBeUndefined();
    expect(notSent).toEqual(["cost per item"]); // a bare "quantity" key is ignored; stock goes in "inventory"
  });

  it.each([
    [{ title: "" }, "title"],
    [{ price: "-1" }, "price"],
    [{ price: "1.999" }, "price"],
    [{ price: "" }, "price"],
    [{ status: "published" }, "status"],
    [{ handle: "Bad Handle" }, "handle"],
    [{ idempotencyKey: "x" }, "idempotencyKey"],
    [{ title: { $gt: "" } }, "title"],
    [{ title: "x".repeat(256) }, "title"],
  ])("rejects %o", (bad, field) => {
    const { errors } = validateProductInput({ idempotencyKey: KEY, title: "Mug", price: "1", ...bad }, { mode: "create" });
    expect(errors[field]).toBeDefined();
  });

  it("update mode only includes fields that were sent", () => {
    const { value, errors } = validateProductInput({ title: "New" }, { mode: "update" });
    expect(errors).toEqual({});
    expect(value).toEqual({ title: "New" });
  });
});

describe("create", () => {
  it("creates in Shopify and saves a linked, synced record", async () => {
    const { user } = await setup();
    const result = await createProduct(user._id, input());

    expect(result.status).toBe(201);
    expect(shopifyProducts()).toHaveLength(1);
    expect(shopifyProducts()[0].metafield).toBe(KEY);

    const doc = await Product.findById(result.product._id).lean();
    expect(doc).toMatchObject({
      shopifyProductId: String(shopifyProducts()[0].id),
      origin: "smartsell",
      idempotencyKey: KEY,
      syncStatus: "synced",
      title: "Test Mug",
      status: "draft",
    });
    expect(doc.variants[0]).toMatchObject({ price: "12.50", sku: "MUG-1" });
    expect(doc.pendingOperation).toBeUndefined();
  });

  it("a repeated request with the same key returns the same product", async () => {
    const { user } = await setup();
    const first = await createProduct(user._id, input());
    const second = await createProduct(user._id, input());

    expect(second).toMatchObject({ status: 200, replay: true });
    expect(String(second.product._id)).toBe(String(first.product._id));
    expect(shopifyProducts()).toHaveLength(1);
    expect(shopify.current.state.mutations.filter((m) => m === "productSet")).toHaveLength(1);
  });

  it("concurrent double submit creates one Shopify product", async () => {
    const { user } = await setup();
    const results = await Promise.allSettled([createProduct(user._id, input()), createProduct(user._id, input())]);
    // Depending on timing the second request either overlaps (409, in
    // progress) or arrives after the first finished (200 replay of the same
    // product). Either way there must be exactly one product.
    const fulfilled = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(new Set(fulfilled.map((r) => String(r.product._id))).size).toBe(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect(r.reason).toMatchObject({ status: 409 });
    }
    expect(shopifyProducts()).toHaveLength(1);
    expect(await Product.countDocuments()).toBe(1);
  });

  it("lost response: never resends blindly, finds the product by its key, and links it", async () => {
    const { user } = await setup();
    shopify.current.state.failNext.productSet = "lostResponse";

    await expect(createProduct(user._id, input())).rejects.toMatchObject({ status: 502, code: "outcome_unknown" });
    expect(shopifyProducts()).toHaveLength(1); // Shopify did create it
    const placeholder = await Product.findOne({ idempotencyKey: KEY }).lean();
    expect(placeholder).toMatchObject({ syncStatus: "pending", pendingOperation: { type: "create", outcome: "unknown" } });
    expect(placeholder.shopifyProductId).toBeUndefined();

    // Immediate retry: refused while the first attempt may still be landing.
    await expect(createProduct(user._id, input())).rejects.toMatchObject({ status: 409 });

    await age(placeholder._id);
    const result = await createProduct(user._id, input());
    expect(result).toMatchObject({ status: 200, replay: true });
    expect(shopifyProducts()).toHaveLength(1); // still exactly one
    expect(shopify.current.state.mutations.filter((m) => m === "productSet")).toHaveLength(1);
    expect((await Product.findById(placeholder._id).lean()).shopifyProductId).toBe(String(shopifyProducts()[0].id));
  });

  it("errors returned with mutation data count as maybe-applied, so no duplicate is created", async () => {
    const { user } = await setup();
    shopify.current.state.failNext.productSet = "errorAfterApply";

    await expect(createProduct(user._id, input())).rejects.toMatchObject({ code: "outcome_unknown" });
    expect(shopifyProducts()).toHaveLength(1);
    const placeholder = await Product.findOne({ idempotencyKey: KEY }).lean();
    expect(placeholder.pendingOperation.outcome).toBe("unknown");

    await age(placeholder._id);
    expect((await createProduct(user._id, input())).replay).toBe(true);
    expect(shopifyProducts()).toHaveLength(1);
  });

  it("timeout that never reached Shopify: lookup finds nothing, so it is safely resent", async () => {
    const { user } = await setup();
    shopify.current.state.failNext.productSet = "timeout";
    await expect(createProduct(user._id, input())).rejects.toMatchObject({ code: "outcome_unknown" });
    expect(shopifyProducts()).toHaveLength(0);

    await age((await Product.findOne({ idempotencyKey: KEY }))._id);
    expect((await createProduct(user._id, input())).status).toBe(201);
    expect(shopifyProducts()).toHaveLength(1);
    expect(await Product.countDocuments()).toBe(1);
  });

  it("Shopify validation errors are returned and the request can be corrected", async () => {
    const { user } = await setup();
    shopify.current.state.failNext.productSet = "userErrors";
    await expect(createProduct(user._id, input())).rejects.toMatchObject({
      status: 422,
      userErrors: [{ field: ["title"], message: "Title is too long" }],
    });
    const failed = await Product.findOne({ idempotencyKey: KEY }).lean();
    expect(failed).toMatchObject({ syncStatus: "failed", pendingOperation: { outcome: "rejected" } });

    // Known not created: resubmitting immediately is allowed.
    const fixed = await createProduct(user._id, input({ title: "Short" }));
    expect(fixed.status).toBe(201);
    expect(shopifyProducts()).toHaveLength(1);
    expect(await Product.countDocuments()).toBe(1);
  });

  it("reports missing permission and creates nothing", async () => {
    const { user } = await setup();
    shopify.current.state.failNext.productSet = "accessDenied";
    await expect(createProduct(user._id, input())).rejects.toMatchObject({ status: 403, code: "missing_permission" });
    expect(shopifyProducts()).toHaveLength(0);
  });

  it("retries after GraphQL throttling (waits ~1s for restored cost)", async () => {
    const { user } = await setup();
    shopify.current.state.failNext.productSet = "throttled";
    expect((await createProduct(user._id, input())).status).toBe(201);
    expect(shopify.current.state.mutations.filter((m) => m === "productSet")).toHaveLength(2);
    expect(shopifyProducts()).toHaveLength(1);
  });

  it("sync + reconciliation after a lost response leave exactly one local record", async () => {
    const { user, store } = await setup();
    shopify.current.state.failNext.productSet = "lostResponse";
    await createProduct(user._id, input()).catch(() => {});

    await syncProducts(shopify.current, store); // imports it as an ordinary product
    expect(await Product.countDocuments()).toBe(2);

    await age((await Product.findOne({ idempotencyKey: KEY }))._id);
    expect(await reconcilePendingCreates(shopify.current, store)).toEqual({ checked: 1, linked: 1 });

    const docs = await Product.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ origin: "smartsell", idempotencyKey: KEY, syncStatus: "synced" });
  });

  it("refuses when the user has no store", async () => {
    const user = await createUser();
    await expect(createProduct(user._id, input())).rejects.toMatchObject({ status: 404 });
  });
});

describe("update", () => {
  it("updates Shopify and the local record", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, input());

    const result = await updateProduct(user._id, product._id, { title: "Big Mug", variant: { price: "15.00", sku: "MUG-2" } });
    expect(result.status).toBe(200);
    expect(shopifyProducts()[0]).toMatchObject({ title: "Big Mug" });
    expect(shopifyProducts()[0].variants[0]).toMatchObject({ price: "15.00", sku: "MUG-2" });

    const doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ title: "Big Mug", syncStatus: "synced" });
    expect(doc.variants[0]).toMatchObject({ price: "15.00", sku: "MUG-2" });
    expect(doc.pendingOperation).toBeUndefined();
  });

  it("refuses variant edits on multi-variant products", async () => {
    const multi = shopifyProduct(1, { variants: [{ id: 10, price: "1" }, { id: 11, price: "2" }] });
    const { user, store } = await setup([multi]);
    await upsertShopifyProducts(store, [multi]);
    const doc = await Product.findOne({ shopifyProductId: "1" });
    await expect(updateProduct(user._id, doc._id, { variant: { price: "9.00" } })).rejects.toMatchObject({ status: 422, code: "multiple_variants" });
  });

  it("partial failure is recorded, local copy shows what Shopify saved, and retry completes it", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, input());
    shopify.current.state.failNext.productVariantsBulkUpdate = "http500";

    await expect(updateProduct(user._id, product._id, { title: "Renamed", variant: { price: "99.00" } })).rejects.toMatchObject({ status: 502 });
    let doc = await Product.findById(product._id).lean();
    expect(doc.title).toBe("Renamed"); // productUpdate did apply
    expect(doc.variants[0].price).toBe("12.50"); // variant update did not
    expect(doc).toMatchObject({ syncStatus: "failed", pendingOperation: { type: "update" } });

    // A sync in between must not hide the failure.
    await syncProducts(shopify.current, (await Shopifystore.findById(doc.shopifyStore)));
    expect((await Product.findById(product._id).lean()).syncStatus).toBe("failed");

    await retryProduct(user._id, product._id);
    doc = await Product.findById(product._id).lean();
    expect(doc.variants[0].price).toBe("99.00");
    expect(doc.syncStatus).toBe("synced");
    expect(doc.pendingOperation).toBeUndefined();
  });

  it("another user's product is not found", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, input());
    const other = await createUser();
    await expect(updateProduct(other._id, product._id, { title: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteProduct(other._id, product._id)).rejects.toMatchObject({ status: 404 });
    expect(shopifyProducts()[0].title).toBe("Test Mug");
  });
});

describe("delete", () => {
  it("deletes in Shopify, archives locally, keeps orders, and is idempotent", async () => {
    const { user, store } = await setup();
    const { product } = await createProduct(user._id, input());
    await upsertShopifyOrders(store, [shopifyOrder(1, { line_items: [{ product_id: Number(product.shopifyProductId), quantity: 1, price: "12.50", title: "Test Mug" }] })]);

    const result = await deleteProduct(user._id, product._id);
    expect(result.status).toBe(200);
    expect(shopifyProducts()).toHaveLength(0);
    const doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ archiveReason: "deleted_in_smartsell", syncStatus: "synced" });
    expect(doc.archivedAt).toBeInstanceOf(Date);
    expect(await Order.countDocuments()).toBe(1);

    expect(await deleteProduct(user._id, product._id)).toMatchObject({ alreadyDeleted: true });
  });

  it("treats a product already gone from Shopify as deleted", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, input());
    shopify.current.state.products = [];
    expect((await deleteProduct(user._id, product._id)).status).toBe(200);
    expect((await Product.findById(product._id).lean()).archiveReason).toBe("deleted_in_smartsell");
  });

  it("a failed delete is recorded and can be retried", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, input());
    shopify.current.state.failNext.productDelete = "timeout";
    await expect(deleteProduct(user._id, product._id)).rejects.toMatchObject({ code: "outcome_unknown" });
    expect((await Product.findById(product._id).lean()).archivedAt).toBeFalsy();

    await retryProduct(user._id, product._id);
    expect(shopifyProducts()).toHaveLength(0);
    expect((await Product.findById(product._id).lean()).archiveReason).toBe("deleted_in_smartsell");
  });

  it("a stale Shopify payload never brings a deleted product back", async () => {
    const { user, store } = await setup();
    const { product } = await createProduct(user._id, input());
    const snapshot = structuredClone(shopifyProducts()[0]);
    await deleteProduct(user._id, product._id);

    await upsertShopifyProducts(store, [snapshot]);
    const docs = await Product.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].archiveReason).toBe("deleted_in_smartsell");
  });
});

describe("routes", () => {
  const BASE = "http://localhost:3000";
  const json = (path, method, body, cookie) =>
    new NextRequest(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("require authentication", async () => {
    expect((await productsRoute.POST(json("/api/products", "POST", {}))).status).toBe(401);
    const params = { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) };
    expect((await productRoute.PATCH(json("/x", "PATCH", {}), params)).status).toBe(401);
    expect((await productRoute.DELETE(json("/x", "DELETE", { confirm: true }), params)).status).toBe(401);
  });

  it("POST validates, creates and reports fields not sent", async () => {
    const { user } = await setup();
    const cookie = sessionCookieFor(user);

    const bad = await productsRoute.POST(json("/api/products", "POST", { idempotencyKey: KEY, title: "" }, cookie));
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors).toMatchObject({ title: "Required", price: "Required" });
    expect(shopifyProducts()).toHaveLength(0);

    const ok = await productsRoute.POST(json("/api/products", "POST", { idempotencyKey: KEY, title: "Mug", price: "3", cost: "1" }, cookie));
    const body = await ok.json();
    expect(ok.status).toBe(201);
    expect(body.product).toMatchObject({ title: "Mug", price: "3.00", syncStatus: "synced" });
    expect(body.notSent).toContain("cost per item");
    expect(JSON.stringify(body)).not.toMatch(/accessToken|"t"/);
  });

  it("DELETE requires explicit confirmation", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, input());
    const params = { params: Promise.resolve({ id: String(product._id) }) };

    const res = await productRoute.DELETE(json("/x", "DELETE", {}, sessionCookieFor(user)), params);
    expect(res.status).toBe(400);
    expect(shopifyProducts()).toHaveLength(1);
  });

  it("GET of another user's product is 404", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, input());
    const other = await createUser();
    const res = await productRoute.GET(json("/x", "GET", undefined, sessionCookieFor(other)), {
      params: Promise.resolve({ id: String(product._id) }),
    });
    expect(res.status).toBe(404);
  });
});
