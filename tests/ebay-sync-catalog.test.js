import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EbayAccount from "@/models/EbayAccount";
import EbayProduct from "@/models/EbayProduct";
import Shopifystore from "@/models/ShopifyStore";
import Product from "@/models/Product";
import { POST as sync } from "@/app/api/ebay/sync/route";
import { GET as inventory } from "@/app/api/inventory/route";
import { linkEbayAccount } from "@/lib/ebay/accounts";
import { checkEbaySetup } from "@/lib/ebay/setup";
import { syncEbayAccount } from "@/lib/ebay/sync";
import { createFakeEbay } from "./helpers/fakeEbay";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

const BASE = "http://localhost:3000";
let ebay;
let user;
let account;
let cookies;

const req = (url, { method = "GET", body } = {}, as = cookies) =>
  new NextRequest(`${BASE}${url}`, {
    method,
    headers: { cookie: as.join("; "), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

function sellerItem(sku, { title = `Item ${sku}`, quantity = 3, price = "19.99", published = true } = {}) {
  ebay.state.items.set(sku, {
    sku,
    condition: "USED_GOOD",
    availability: { shipToLocationAvailability: { quantity } },
    product: { title, description: "From eBay", aspects: { Brand: ["Acme"] }, imageUrls: ["https://i.ebayimg.com/a.jpg"] },
  });
  const offerId = String(500 + ebay.state.offers.size);
  ebay.state.offers.set(offerId, {
    offerId,
    sku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    categoryId: "9355",
    availableQuantity: quantity,
    pricingSummary: { price: { value: price, currency: "USD" } },
    status: published ? "PUBLISHED" : "UNPUBLISHED",
    ...(published ? { listing: { listingId: `L-${sku}`, listingStatus: "ACTIVE" } } : {}),
  });
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([EbayAccount.init(), EbayProduct.init(), Shopifystore.init(), Product.init()]);
  ebay = createFakeEbay();
  vi.stubGlobal("fetch", ebay.fetch);
  user = await createUser();
  cookies = [sessionCookieFor(user)];
  account = await linkEbayAccount({
    userId: user._id,
    environment: "sandbox",
    marketplaceId: "EBAY_US",
    identity: { ebayUserId: "ebay-user-1", username: "test_seller" },
    tokens: { accessToken: "v^1.1#user-access-0", accessTokenExpiresAt: new Date(Date.now() + 3600_000), refreshToken: "v^1.1#refresh", refreshTokenExpiresAt: null },
    scopes: [],
  });
  await checkEbaySetup(account);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("eBay import", () => {
  it("imports inventory items with their offers", async () => {
    sellerItem("A-1", { title: "Vintage lamp", price: "45.50" });
    sellerItem("A-2", { published: false, quantity: 0 });
    const res = await sync(req("/api/ebay/sync", { method: "POST", body: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()).imported).toBe(2);

    const lamp = await EbayProduct.findOne({ sku: "A-1" }).lean();
    expect(lamp).toMatchObject({
      origin: "ebay",
      title: "Vintage lamp",
      price: 45.5,
      currency: "USD",
      quantity: 3,
      condition: "USED_GOOD",
      listingStatus: "published",
      listingId: "L-A-1",
      categoryId: "9355",
      syncStatus: "synced",
    });
    expect((await EbayProduct.findOne({ sku: "A-2" }).lean()).listingStatus).toBe("draft");
    const saved = await EbayAccount.findById(account._id).lean();
    expect(saved.lastSyncStatus).toBe("success");
    expect(saved.syncLockedUntil).toBeUndefined();
  });

  it("updates existing products and archives ones deleted on eBay", async () => {
    sellerItem("B-1");
    sellerItem("B-2");
    await syncEbayAccount(account._id);
    ebay.state.items.get("B-1").availability.shipToLocationAvailability.quantity = 9;
    ebay.state.items.delete("B-2");
    const result = await syncEbayAccount(account._id);
    expect(result.counts).toEqual({ products: 1, archivedProducts: 1 });
    expect((await EbayProduct.findOne({ sku: "B-1" }).lean()).quantity).toBe(9);
    const gone = await EbayProduct.findOne({ sku: "B-2" }).lean();
    expect(gone.archiveReason).toBe("deleted_in_ebay");
    expect(gone.liveSku).toBeUndefined();
  });

  it("never overwrites a product with an unsent SmartSell change", async () => {
    sellerItem("C-1", { title: "On eBay" });
    await syncEbayAccount(account._id);
    await EbayProduct.updateOne({ sku: "C-1" }, { $set: { title: "Local edit", syncStatus: "failed" } });
    await syncEbayAccount(account._id);
    expect((await EbayProduct.findOne({ sku: "C-1" }).lean()).title).toBe("Local edit");
  });

  it("does not run two imports of the same account at once", async () => {
    await EbayAccount.updateOne({ _id: account._id }, { $set: { syncLockedUntil: new Date(Date.now() + 60_000) } });
    expect(await syncEbayAccount(account._id)).toEqual({ locked: true });
  });

  it("records a failed import and releases the lock", async () => {
    ebay.fail({ method: "GET", path: "/sell/inventory/v1/inventory_item", status: 500, times: 5 });
    const res = await sync(req("/api/ebay/sync", { method: "POST", body: {} }));
    expect(res.status).toBe(502);
    const saved = await EbayAccount.findById(account._id).lean();
    expect(saved.lastSyncStatus).toBe("failed");
    expect(saved.syncLockedUntil).toBeUndefined();
  });

  it("requires a connected account", async () => {
    const other = await createUser();
    const res = await sync(req("/api/ebay/sync", { method: "POST", body: {} }, [sessionCookieFor(other)]));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/inventory across marketplaces", () => {
  async function seedShopify() {
    const store = await Shopifystore.create({ user: user._id, shop: "s.myshopify.com", status: "active", currency: "USD" });
    await Product.create({
      user: user._id,
      shopifyStore: store._id,
      shopifyProductId: "111",
      title: "Shopify mug",
      status: "active",
      variants: [{ id: "v1", title: "Default Title", price: "9.00", sku: "MUG", inventoryItemId: "ii1" }],
    });
  }

  it("returns Shopify and eBay rows, each labelled with its marketplace", async () => {
    await seedShopify();
    sellerItem("D-1", { title: "eBay lamp" });
    await syncEbayAccount(account._id);

    const body = await (await inventory(req("/api/inventory"))).json();
    expect(body.hasStore).toBe(true);
    expect(body.hasEbay).toBe(true);
    expect(body.data.map((r) => [r.marketplace, r.platform, r.title]).sort()).toEqual([
      ["ebay", "eBay", "eBay lamp"],
      ["shopify", "Shopify", "Shopify mug"],
    ]);
    const lamp = body.data.find((r) => r.marketplace === "ebay");
    expect(lamp).toMatchObject({ sku: "D-1", status: "active", available: 3, vendor: "Acme", location_id: "ebay:warehouse-1", listing_url: "https://sandbox.ebay.com/itm/L-D-1" });
    expect(body.ebaySync[0].username).toBe("test_seller");
  });

  it("filters to one marketplace", async () => {
    await seedShopify();
    sellerItem("D-2");
    await syncEbayAccount(account._id);

    const shopifyOnly = await (await inventory(req("/api/inventory?marketplace=shopify"))).json();
    expect(shopifyOnly.data.every((r) => r.marketplace === "shopify")).toBe(true);
    expect(shopifyOnly.data).toHaveLength(1);
    const ebayOnly = await (await inventory(req("/api/inventory?marketplace=ebay"))).json();
    expect(ebayOnly.data.map((r) => r.sku)).toEqual(["D-2"]);
    const fallback = await (await inventory(req("/api/inventory?marketplace=nonsense"))).json();
    expect(fallback.marketplace).toBe("all");
    expect(fallback.data).toHaveLength(2);
  });

  it("lists failed eBay writes under needs attention and hides archived products", async () => {
    sellerItem("E-1");
    sellerItem("E-2");
    await syncEbayAccount(account._id);
    await EbayProduct.updateOne({ sku: "E-1" }, { $set: { syncStatus: "failed", lastSyncError: "Brand missing", pendingOperation: { type: "update" } } });
    await EbayProduct.updateOne({ sku: "E-2" }, { $set: { archivedAt: new Date() }, $unset: { liveSku: 1 } });

    const body = await (await inventory(req("/api/inventory?marketplace=ebay"))).json();
    expect(body.data.map((r) => r.sku)).toEqual(["E-1"]);
    expect(body.needsAttention).toEqual([expect.objectContaining({ marketplace: "ebay", error: "Brand missing", operation: "update" })]);
  });

  it("never shows another user's eBay products", async () => {
    sellerItem("F-1");
    await syncEbayAccount(account._id);
    const other = await createUser();
    const body = await (await inventory(req("/api/inventory", {}, [sessionCookieFor(other)]))).json();
    expect(body.data).toEqual([]);
    expect(body.hasEbay).toBe(false);
  });
});
