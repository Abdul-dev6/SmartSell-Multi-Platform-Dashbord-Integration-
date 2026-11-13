import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EbayAccount from "@/models/EbayAccount";
import EbayProduct from "@/models/EbayProduct";
import { POST as create } from "@/app/api/ebay/products/route";
import { DELETE as remove, GET as read, PATCH as update } from "@/app/api/ebay/products/[id]/route";
import { POST as retry } from "@/app/api/ebay/products/[id]/retry/route";
import { GET as categories } from "@/app/api/ebay/options/categories/route";
import { linkEbayAccount } from "@/lib/ebay/accounts";
import { checkEbaySetup } from "@/lib/ebay/setup";
import { validateEbayProductInput } from "@/lib/ebay/products/validation";
import { clearApplicationTokenCache } from "@/lib/ebay/oauth";
import { createFakeEbay } from "./helpers/fakeEbay";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

const BASE = "http://localhost:3000";
let ebay;
let user;
let cookies;
let keySeq = 0;

function req(url, { method = "GET", body } = {}, as = cookies) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { cookie: as.join("; "), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const ctx = (id) => ({ params: Promise.resolve({ id: String(id) }) });

function form(overrides = {}) {
  keySeq += 1;
  return {
    idempotencyKey: `key-${Date.now()}-${keySeq}`,
    sku: `SKU-${keySeq}`,
    title: "Apple iPhone 15 128GB",
    description: "Brand new, sealed.",
    price: "699.99",
    quantity: 5,
    condition: "NEW",
    categoryId: "9355",
    categoryName: "Cell Phones & Smartphones",
    aspects: { Brand: ["Apple"], Model: ["iPhone 15"] },
    imageUrls: ["https://images.example.com/iphone.jpg"],
    publish: true,
    ...overrides,
  };
}

async function connectSeller(owner, fake = ebay) {
  const account = await linkEbayAccount({
    userId: owner._id,
    environment: "sandbox",
    marketplaceId: "EBAY_US",
    identity: { ebayUserId: fake.state.userId, username: fake.state.username },
    tokens: {
      accessToken: "v^1.1#user-access-0",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshToken: "v^1.1#refresh",
      refreshTokenExpiresAt: new Date(Date.now() + 86400_000),
    },
    scopes: [],
  });
  await checkEbaySetup(account);
  return account;
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([EbayAccount.init(), EbayProduct.init()]);
  clearApplicationTokenCache();
  ebay = createFakeEbay();
  vi.stubGlobal("fetch", ebay.fetch);
  user = await createUser();
  cookies = [sessionCookieFor(user)];
  await connectSeller(user);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validation", () => {
  it("requires what eBay needs to publish", () => {
    const { errors } = validateEbayProductInput(
      form({ categoryId: "", description: "", imageUrls: [], quantity: 0 }),
      { mode: "create" },
    );
    expect(Object.keys(errors).sort()).toEqual(["categoryId", "description", "imageUrls", "quantity"]);
  });

  it("allows a draft without category or images", () => {
    const { errors, value } = validateEbayProductInput(
      form({ categoryId: "", description: "", imageUrls: [], quantity: 0, publish: false }),
      { mode: "create" },
    );
    expect(errors).toEqual({});
    expect(value.publish).toBe(false);
  });

  it("rejects bad titles, prices, SKUs and non-https images", () => {
    const { errors } = validateEbayProductInput(
      form({ title: "x".repeat(81), price: "-1", sku: "bad sku!", imageUrls: ["http://insecure.example.com/a.jpg"] }),
      { mode: "create" },
    );
    expect(Object.keys(errors).sort()).toEqual(["imageUrls", "price", "sku", "title"]);
  });

  it("generates a SKU when none is given", () => {
    const { value } = validateEbayProductInput(form({ sku: "" }), { mode: "create" });
    expect(value.sku).toMatch(/^SS-[0-9A-F]{10}$/);
  });
});

describe("POST /api/ebay/products", () => {
  it("creates the inventory item and offer, publishes it and stores the product", async () => {
    const res = await create(req("/api/ebay/products", { method: "POST", body: form({ sku: "IPH-15" }) }));
    expect(res.status).toBe(201);
    const { product } = await res.json();
    expect(product.marketplace).toBe("ebay");
    expect(product.listingStatus).toBe("published");
    expect(product.listingId).toBe("9001");
    expect(product.listingUrl).toBe("https://sandbox.ebay.com/itm/9001");
    expect(product.syncStatus).toBe("synced");

    const item = ebay.state.items.get("IPH-15");
    expect(item.product.title).toBe("Apple iPhone 15 128GB");
    expect(item.availability.shipToLocationAvailability.quantity).toBe(5);
    const offer = [...ebay.state.offers.values()][0];
    expect(offer.pricingSummary.price).toEqual({ value: "699.99", currency: "USD" });
    expect(offer.listingPolicies).toEqual({ fulfillmentPolicyId: "F1", paymentPolicyId: "P1", returnPolicyId: "R1" });
    expect(offer.merchantLocationKey).toBe("warehouse-1");

    const saved = await EbayProduct.findById(product.id).lean();
    expect(saved.offerId).toBe(offer.offerId);
    expect(saved.pendingOperation).toBeUndefined();
    // A first create posts the offer without looking one up by SKU.
    expect(ebay.calls.some((c) => c.method === "GET" && c.path === "/sell/inventory/v1/offer")).toBe(false);
  });

  it("does not change any Shopify records", async () => {
    const Product = (await import("@/models/Product")).default;
    const Shopifystore = (await import("@/models/ShopifyStore")).default;
    const store = await Shopifystore.create({ user: user._id, shop: "iso.myshopify.com", status: "active" });
    await Product.create({ user: user._id, shopifyStore: store._id, shopifyProductId: "1", title: "Shopify item", variants: [] });
    const before = JSON.stringify(await Product.find().lean());

    const created = (await (await create(req("/api/ebay/products", { method: "POST", body: form({ sku: "ISO-1" }) }))).json()).product;
    await update(req(`/api/ebay/products/${created.id}`, { method: "PATCH", body: form({ title: "Changed" }) }), ctx(created.id));
    await remove(req(`/api/ebay/products/${created.id}`, { method: "DELETE" }), ctx(created.id));

    expect(JSON.stringify(await Product.find().lean())).toBe(before);
    expect(await Shopifystore.countDocuments()).toBe(1);
    expect(ebay.calls.every((c) => !c.path.includes("myshopify"))).toBe(true);
  });

  it("saves a draft without publishing", async () => {
    const res = await create(req("/api/ebay/products", { method: "POST", body: form({ publish: false }) }));
    const { product } = await res.json();
    expect(product.listingStatus).toBe("draft");
    expect(ebay.calls.some((c) => c.path.endsWith("/publish"))).toBe(false);
  });

  it("returns the same product when a request is repeated", async () => {
    const body = form();
    const first = await (await create(req("/api/ebay/products", { method: "POST", body }))).json();
    const again = await create(req("/api/ebay/products", { method: "POST", body }));
    expect(again.status).toBe(200);
    expect((await again.json()).product.id).toBe(first.product.id);
    expect(ebay.state.offers.size).toBe(1);
  });

  it("refuses to overwrite an item that already exists on eBay", async () => {
    ebay.state.items.set("EXISTING", { sku: "EXISTING", product: { title: "Seller's own item" } });
    const res = await create(req("/api/ebay/products", { method: "POST", body: form({ sku: "EXISTING" }) }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("sku_exists_on_ebay");
    expect(ebay.state.items.get("EXISTING").product.title).toBe("Seller's own item");
    expect(await EbayProduct.countDocuments()).toBe(0);
  });

  it("returns validation errors without calling eBay", async () => {
    const res = await create(req("/api/ebay/products", { method: "POST", body: form({ title: "" }) }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors.title).toBeTruthy();
    expect(ebay.calls.filter((c) => c.path.startsWith("/sell/inventory/v1/inventory_item"))).toHaveLength(0);
  });

  it("requires eBay setup before publishing", async () => {
    await EbayAccount.updateOne({ user: user._id }, { $set: { "setup.ready": false } });
    const res = await create(req("/api/ebay/products", { method: "POST", body: form() }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("setup_required");
  });

  it("requires a connected eBay account", async () => {
    const other = await createUser();
    const res = await create(req("/api/ebay/products", { method: "POST", body: form() }, [sessionCookieFor(other)]));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_ebay_account");
  });

  it("requires a session", async () => {
    const res = await create(req("/api/ebay/products", { method: "POST", body: form() }, []));
    expect(res.status).toBe(401);
  });

  it("records an eBay rejection and passes eBay's message through", async () => {
    ebay.fail({ method: "POST", path: /\/publish$/, status: 400, errorId: 25021, message: "Item specific Brand is missing." });
    const res = await create(req("/api/ebay/products", { method: "POST", body: form({ sku: "FAIL-1" }) }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toBe("Item specific Brand is missing.");
    expect(body.productId).toBeTruthy();
    const saved = await EbayProduct.findById(body.productId).lean();
    expect(saved.syncStatus).toBe("failed");
    expect(saved.pendingOperation.type).toBe("create");
    expect(saved.pendingOperation.outcome).toBe("rejected");
    expect(saved.offerId).toBeTruthy();

    // Retry completes the same create without a second offer.
    const retried = await retry(req(`/api/ebay/products/${body.productId}/retry`, { method: "POST" }), ctx(body.productId));
    expect(retried.status).toBe(200);
    const { product } = await retried.json();
    expect(product.listingStatus).toBe("published");
    expect(product.syncStatus).toBe("synced");
    expect(ebay.state.offers.size).toBe(1);
  });

  it("recovers an offer whose create response was lost", async () => {
    ebay.fail({ method: "POST", path: "/sell/inventory/v1/offer", networkError: true });
    const res = await create(req("/api/ebay/products", { method: "POST", body: form({ sku: "LOST-1" }) }));
    expect(res.status).toBe(502);
    const { productId } = await res.json();
    expect((await EbayProduct.findById(productId).lean()).pendingOperation.outcome).toBe("unknown");

    const retried = await (await retry(req(`/api/ebay/products/${productId}/retry`, { method: "POST" }), ctx(productId))).json();
    expect(retried.product.listingStatus).toBe("published");
    expect(ebay.state.offers.size).toBe(1);
  });
});

describe("GET/PATCH/DELETE /api/ebay/products/[id]", () => {
  async function createOne(overrides) {
    const res = await create(req("/api/ebay/products", { method: "POST", body: form(overrides) }));
    return (await res.json()).product;
  }

  it("reads only the owner's product", async () => {
    const product = await createOne();
    expect((await read(req(`/api/ebay/products/${product.id}`), ctx(product.id))).status).toBe(200);
    const other = await createUser();
    const denied = await read(req(`/api/ebay/products/${product.id}`, {}, [sessionCookieFor(other)]), ctx(product.id));
    expect(denied.status).toBe(404);
  });

  it("updates the item and offer on eBay", async () => {
    const product = await createOne({ sku: "UPD-1" });
    const res = await update(
      req(`/api/ebay/products/${product.id}`, { method: "PATCH", body: form({ title: "iPhone 15 (Renewed)", price: 599, quantity: 2, idempotencyKey: undefined }) }),
      ctx(product.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product.title).toBe("iPhone 15 (Renewed)");
    expect(body.product.sku).toBe("UPD-1");
    expect(ebay.state.items.get("UPD-1").product.title).toBe("iPhone 15 (Renewed)");
    const offer = [...ebay.state.offers.values()][0];
    expect(offer.pricingSummary.price.value).toBe("599.00");
    expect(offer.availableQuantity).toBe(2);
    expect(offer.status).toBe("PUBLISHED");
  });

  it("ends the listing when the seller switches to draft", async () => {
    const product = await createOne();
    const body = await (
      await update(req(`/api/ebay/products/${product.id}`, { method: "PATCH", body: form({ publish: false }) }), ctx(product.id))
    ).json();
    expect(body.product.listingStatus).toBe("ended");
    expect([...ebay.state.offers.values()][0].status).toBe("UNPUBLISHED");
  });

  it("refuses another user's product", async () => {
    const product = await createOne();
    const other = await createUser();
    await connectSeller(other, createFakeEbay({ userId: "ebay-user-2" }));
    const res = await update(
      req(`/api/ebay/products/${product.id}`, { method: "PATCH", body: form() }, [sessionCookieFor(other)]),
      ctx(product.id),
    );
    expect(res.status).toBe(404);
  });

  it("refuses a write while another one is in progress", async () => {
    const product = await createOne();
    await EbayProduct.updateOne({ _id: product.id }, { $set: { syncStatus: "pending", pendingOperation: { type: "update", startedAt: new Date() } } });
    const res = await update(req(`/api/ebay/products/${product.id}`, { method: "PATCH", body: form() }), ctx(product.id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("write_in_progress");
  });

  it("deletes from eBay and archives the record, freeing the SKU", async () => {
    const product = await createOne({ sku: "DEL-1" });
    const res = await remove(req(`/api/ebay/products/${product.id}`, { method: "DELETE" }), ctx(product.id));
    expect(res.status).toBe(200);
    expect(ebay.state.items.has("DEL-1")).toBe(false);
    expect(ebay.state.offers.size).toBe(0);
    const saved = await EbayProduct.findById(product.id).lean();
    expect(saved.archivedAt).toBeTruthy();
    expect(saved.archiveReason).toBe("deleted_in_smartsell");
    expect(saved.liveSku).toBeUndefined();

    const again = await create(req("/api/ebay/products", { method: "POST", body: form({ sku: "DEL-1" }) }));
    expect(again.status).toBe(201);
  });

  it("archives a product that was already removed on eBay", async () => {
    const product = await createOne({ sku: "GONE-1" });
    ebay.state.items.delete("GONE-1");
    const res = await remove(req(`/api/ebay/products/${product.id}`, { method: "DELETE" }), ctx(product.id));
    expect(res.status).toBe(200);
    expect((await EbayProduct.findById(product.id).lean()).archivedAt).toBeTruthy();
  });

  it("keeps the product and allows a retry when the delete fails", async () => {
    const product = await createOne({ sku: "DEL-2" });
    ebay.fail({ method: "DELETE", path: "/inventory_item/DEL-2", status: 500, times: 1 });
    const res = await remove(req(`/api/ebay/products/${product.id}`, { method: "DELETE" }), ctx(product.id));
    expect(res.status).toBe(502);
    let saved = await EbayProduct.findById(product.id).lean();
    expect(saved.archivedAt).toBeUndefined();
    expect(saved.pendingOperation.type).toBe("delete");

    await retry(req(`/api/ebay/products/${product.id}/retry`, { method: "POST" }), ctx(product.id));
    saved = await EbayProduct.findById(product.id).lean();
    expect(saved.archivedAt).toBeTruthy();
    expect(ebay.state.items.has("DEL-2")).toBe(false);
  });

  it("asks the seller to reconnect when the account already needs reauthorization", async () => {
    const product = await createOne();
    await EbayAccount.updateOne({ user: user._id }, { $set: { status: "reauth_required" } });
    const res = await update(req(`/api/ebay/products/${product.id}`, { method: "PATCH", body: form() }), ctx(product.id));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("reauth_required");
    expect(body.message).toMatch(/Reconnect eBay/);
  });

  it("asks the seller to reconnect when eBay revoked access", async () => {
    const product = await createOne();
    await EbayAccount.updateOne({ user: user._id }, { $set: { accessTokenExpiresAt: new Date(0) } });
    ebay.state.revoked = true;
    const res = await update(req(`/api/ebay/products/${product.id}`, { method: "PATCH", body: form() }), ctx(product.id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("reauth_required");
  });
});

describe("GET /api/ebay/options/categories", () => {
  it("suggests categories", async () => {
    const body = await (await categories(req("/api/ebay/options/categories?q=iphone"))).json();
    expect(body.categories[0]).toEqual({ id: "9355", name: "Cell Phones & Smartphones", path: "Cell Phones & Accessories > Cell Phones & Smartphones" });
  });

  it("returns item specifics (required first) and conditions", async () => {
    const body = await (await categories(req("/api/ebay/options/categories?categoryId=9355"))).json();
    expect(body.aspects.filter((a) => a.required).map((a) => a.name)).toEqual(["Brand", "Model"]);
    expect(body.conditions.map((c) => c.value)).toEqual(["NEW", "USED_EXCELLENT"]);
  });

  it("rejects an invalid category id", async () => {
    const res = await categories(req("/api/ebay/options/categories?categoryId=abc"));
    expect(res.status).toBe(400);
  });
});
