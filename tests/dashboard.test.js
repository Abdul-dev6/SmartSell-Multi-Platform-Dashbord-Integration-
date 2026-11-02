import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import Order from "@/models/Order";
import Product from "@/models/Products";
import Inventory from "@/models/Inventory";
import Shopifystore from "@/models/ShopifyUser";
import { linkStore } from "@/lib/Shopify/stores";
import { upsertShopifyOrders } from "@/lib/Shopify/ordersync";
import { upsertShopifyProducts } from "@/lib/Shopify/syncProduct";
import { getActiveStores } from "@/lib/catalog";
import { getDashboardSummary } from "@/lib/analytics/dashboard";
import { GET as inventoryRoute } from "@/app/api/inventory/route";
import { GET as summaryRoute } from "@/app/api/dashboard/summary/route";
import { POST as syncRoute } from "@/app/api/shopify/sync/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { shopifyOrder, shopifyProduct } from "./helpers/fakeShopify";

const BASE = "http://localhost:3000";
const req = (path, cookie, init = {}) =>
  new NextRequest(`${BASE}${path}`, { ...init, headers: cookie ? { cookie } : {} });

async function storeFor(user, shop, tz = "Asia/Karachi") {
  const store = await linkStore({ userId: user._id, shop, accessToken: "t", scope: "" });
  await Shopifystore.updateOne({ _id: store._id }, { $set: { timezone: tz, currency: "PKR" } });
  return store;
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Order.init(), Product.init(), Inventory.init(), Shopifystore.init()]);
});

describe("dashboard summary", () => {
  it("computes revenue from stored orders with clear rules", async () => {
    const user = await createUser();
    const store = await storeFor(user, "a.myshopify.com");
    const now = new Date("2026-11-02T12:00:00Z");

    await upsertShopifyOrders(store, [
      // November in Karachi (UTC+5) although still Oct 31 in UTC.
      shopifyOrder(1, { created_at: "2026-10-31T21:00:00Z", current_total_price: "80.00", total_price: "100.00" }),
      shopifyOrder(2, { created_at: "2026-10-10T10:00:00Z", total_price: "50.00", current_total_price: "50.00" }),
      shopifyOrder(3, { created_at: "2026-10-11T10:00:00Z", cancelled_at: "2026-10-12T10:00:00Z" }),
      shopifyOrder(4, { created_at: "2026-10-12T10:00:00Z", financial_status: "voided" }),
      shopifyOrder(5, { created_at: "2026-10-13T10:00:00Z", currency: "USD", total_price: "999.00", current_total_price: "999.00" }),
      shopifyOrder(6, { created_at: "2026-11-01T10:00:00Z", fulfillment_status: "fulfilled", current_total_price: "20.00" }),
    ]);

    const summary = await getDashboardSummary(user._id, await getActiveStores(user._id), { now });

    expect(summary.currency).toBe("PKR");
    expect(summary.otherCurrencies).toEqual([{ currency: "USD", orders: 1 }]);
    expect(summary.monthLabel).toBe("Nov");
    // Uses current_total_price (after refunds), excludes cancelled/voided/other currency.
    expect(summary.current).toMatchObject({ revenue: 100, orders: 2, averageOrderValue: 50 });
    expect(summary.previous).toMatchObject({ revenue: 50, orders: 1 });
    expect(summary.change.revenue).toBe(100);
    expect(summary.monthly.find((m) => m.month === "Oct").revenue).toBe(50);
    // No expenses recorded: ROI is unknown, not 0.
    expect(summary.current.Roi).toBeNull();

    const statuses = Object.fromEntries(summary.recentOrders.map((o) => [o.orderId, o.status]));
    expect(statuses["#1003"]).toBe("Cancelled");
    expect(statuses["#1006"]).toBe("Fulfilled");
    expect(statuses["#1002"]).toBe("Unfulfilled");

    expect(summary.topProducts[0]).toMatchObject({ productId: "1", units: 6 });
  });

  it("shows no percentage when there is no previous-month baseline", async () => {
    const user = await createUser();
    const store = await storeFor(user, "a.myshopify.com", "UTC");
    await upsertShopifyOrders(store, [shopifyOrder(1, { created_at: "2026-11-01T10:00:00Z" })]);
    const summary = await getDashboardSummary(user._id, await getActiveStores(user._id), {
      now: new Date("2026-11-02T00:00:00Z"),
    });
    expect(summary.change.revenue).toBeNull();
  });

  it("returns empty figures for a user without a store", async () => {
    const user = await createUser();
    const summary = await getDashboardSummary(user._id, []);
    expect(summary.hasStore).toBe(false);
    expect(summary.current.revenue).toBe(0);
    expect(summary.recentOrders).toEqual([]);
  });
});

describe("MongoDB-backed routes", () => {
  it("require authentication", async () => {
    expect((await inventoryRoute(req("/api/inventory"))).status).toBe(401);
    expect((await summaryRoute(req("/api/dashboard/summary"))).status).toBe(401);
    expect((await syncRoute(req("/api/shopify/sync", null, { method: "POST" }))).status).toBe(401);
  });

  it("/api/inventory returns only the user's rows, in the shape the pages render", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const aliceStore = await storeFor(alice, "alice.myshopify.com");
    const bobStore = await storeFor(bob, "bob.myshopify.com");
    await upsertShopifyProducts(aliceStore, [shopifyProduct(1)]);
    await upsertShopifyProducts(bobStore, [shopifyProduct(2)]);
    await Inventory.create({
      user: alice._id, shopifyStore: aliceStore._id, inventoryItemId: "100", locationId: "7", available: 4,
    });

    const body = await (await inventoryRoute(req("/api/inventory", sessionCookieFor(alice)))).json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      product_id: "1",
      title: "Product 1",
      sku: "SKU-1",
      price: "10.00",
      available: 4,
      location_id: "7",
      platform: "Shopify",
      row_id: "10:7",
    });
    expect(JSON.stringify(body)).not.toContain("Product 2");
  });

  it("/api/inventory hides archived products and shows untracked variants as null", async () => {
    const user = await createUser();
    const store = await storeFor(user, "a.myshopify.com");
    await upsertShopifyProducts(store, [shopifyProduct(1), shopifyProduct(2)]);
    await Product.updateOne({ shopifyProductId: "2" }, { $set: { archivedAt: new Date() } });

    const body = await (await inventoryRoute(req("/api/inventory", sessionCookieFor(user)))).json();
    expect(body.data.map((r) => r.product_id)).toEqual(["1"]);
    expect(body.data[0].available).toBeNull();
  });

  it("sync route returns 404 when the user has no store", async () => {
    const user = await createUser();
    const res = await syncRoute(req("/api/shopify/sync", sessionCookieFor(user), { method: "POST" }));
    expect(res.status).toBe(404);
  });
});
