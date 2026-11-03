import fs from "node:fs";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import User from "@/models/User";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Notification from "@/models/Notification";
import Shopifystore from "@/models/ShopifyStore";
import CalendarEvent from "@/models/CalendarEvent";
import { linkStore } from "@/lib/shopify/stores";
import { upsertShopifyOrders, mapShopifyOrder } from "@/lib/shopify/ordersync";
import { upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { refreshOrderFees } from "@/lib/shopify/orderFees";
import { getActiveStores } from "@/lib/catalog";
import { getDashboardSummary, parsePeriod } from "@/lib/analytics/dashboard";
import { validateProductInput } from "@/lib/products/validation";
import { sessionStatus } from "@/lib/auth/sessionStatus";
import { nextCount } from "@/components/dashboard/shared/useIncrementalList";
import { formFromProduct, buildProductPayload } from "@/components/dashboard/listing-form/payload";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { fakeShopifyStore, shopifyOrder, shopifyProduct } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/shopify/client", () => ({ createClient: () => shopify.current }));

const { createProduct, updateProduct, toClientProduct } = await import("@/lib/products/service");
const { GET: statusRoute } = await import("@/app/api/shopify/status/route");
const { GET: listNotifications, PATCH: markRead } = await import("@/app/api/notifications/route");
const { POST: createProductRoute } = await import("@/app/api/products/route");
const { POST: createEventRoute } = await import("@/app/api/calendar-events/route");
const { DELETE: deleteEventRoute } = await import("@/app/api/calendar-events/[id]/route");
const { GET: meRoute, PATCH: updateMe } = await import("@/app/api/auth/me/route");
const { POST: changePassword } = await import("@/app/api/auth/password/route");
const { GET: summaryRoute } = await import("@/app/api/dashboard/summary/route");

const BASE = "http://localhost:3000";
const req = (method, path, cookie, body) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function setup() {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: `s${Math.floor(Math.random() * 1e9)}.myshopify.com`, accessToken: "t", scope: "write_products" });
  await Shopifystore.updateOne({ _id: store._id }, { $set: { timezone: "UTC", currency: "USD" } });
  shopify.current = fakeShopifyStore();
  return { user, store, cookie: sessionCookieFor(user) };
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([User.init(), Order.init(), Product.init(), Notification.init(), Shopifystore.init(), CalendarEvent.init()]);
});

describe("calendar: days 1–9 can be selected", () => {
  it("day options carry numeric values matching the selected day", () => {
    const page = fs.readFileSync("app/(dashboard)/Panel/Calendar/page.jsx", "utf8");
    expect(page).toContain("<option key={dd} value={dd}>{pad(dd)}</option>");
    expect(page).not.toMatch(/<option key=\{dd\}>\{pad\(dd\)\}<\/option>/);
  });

  it("an event on Nov 4 is accepted and stored in MongoDB", async () => {
    const { user, cookie } = await setup();
    const res = await createEventRoute(req("POST", "/api/calendar-events", cookie, {
      title: "Restock", description: "", date: "2026-11-04", endDate: "2026-11-04", time: "09:00 AM – 10:00 AM", color: "#6366f1",
    }));
    expect(res.status).toBe(201);
    expect(await CalendarEvent.countDocuments({ user: user._id, date: "2026-11-04" })).toBe(1);
  });
});

describe("profile shows the connected store", () => {
  it("the status API includes success: true, so the profile's loader accepts it", async () => {
    const { cookie } = await setup();
    const body = await (await statusRoute(req("GET", "/api/shopify/status", cookie))).json();
    expect(body).toMatchObject({ success: true, connected: true });
    expect(body.stores.filter((s) => s.status === "active")).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("record success and failure of actions, per user, and can be marked read", async () => {
    const { user, cookie } = await setup();
    const other = await setup();

    const ok = await createProductRoute(req("POST", "/api/products", cookie, { idempotencyKey: "key-notify-0001", title: "Mug", price: "5" }));
    expect(ok.status).toBe(201);
    const bad = await createProductRoute(req("POST", "/api/products", cookie, { idempotencyKey: "key-notify-0002", title: "", price: "5" }));
    expect(bad.status).toBe(400);

    const body = await (await listNotifications(req("GET", "/api/notifications", cookie))).json();
    expect(body.unread).toBe(2);
    expect(body.notifications.map((n) => [n.type, n.title])).toEqual([
      ["error", "Product not created"],
      ["success", "“Mug” created in Shopify"],
    ]);
    expect(body.notifications[0].message).toMatch(/fix the highlighted fields/i);

    const theirs = await (await listNotifications(req("GET", "/api/notifications", other.cookie))).json();
    expect(theirs.notifications).toEqual([]);

    const after = body.notifications[1].createdAt;
    const newer = await (await listNotifications(req("GET", `/api/notifications?after=${encodeURIComponent(after)}`, cookie))).json();
    expect(newer.notifications.map((n) => n.title)).toEqual(["Product not created"]);

    await markRead(req("PATCH", "/api/notifications", cookie, { all: true }));
    expect((await (await listNotifications(req("GET", "/api/notifications", cookie))).json()).unread).toBe(0);
    expect(await Notification.countDocuments({ user: user._id })).toBe(2);
  });

  it("calendar add/delete are notified; requests without a session record nothing", async () => {
    const { user, cookie } = await setup();
    const created = await createEventRoute(req("POST", "/api/calendar-events", cookie, {
      title: "Sale", description: "", date: "2026-11-10", endDate: "2026-11-10", time: "09:00 AM – 10:00 AM", color: "#6366f1",
    }));
    const { event } = await created.json();
    await deleteEventRoute(req("DELETE", `/api/calendar-events/${event.id}`, cookie), { params: Promise.resolve({ id: event.id }) });
    await createEventRoute(req("POST", "/api/calendar-events", null, { title: "x" }));
    const titles = (await Notification.find({ user: user._id }).sort({ createdAt: 1 }).lean()).map((n) => n.title);
    expect(titles).toEqual(["Event “Sale” added", "Event deleted"]);
    expect(await Notification.countDocuments()).toBe(2);
  });
});

describe("notification options", () => {
  it("Clear removes all of the user's notifications, not other users'", async () => {
    const { user, cookie } = await setup();
    const other = await setup();
    await createProductRoute(req("POST", "/api/products", cookie, { idempotencyKey: "key-clear-0001", title: "Mug", price: "5" }));
    await createProductRoute(req("POST", "/api/products", other.cookie, { idempotencyKey: "key-clear-0002", title: "Cup", price: "5" }));
    const { DELETE: clearAll } = await import("@/app/api/notifications/route");
    const res = await clearAll(req("DELETE", "/api/notifications", cookie));
    expect(await res.json()).toEqual({ success: true, deleted: 1 });
    expect(await Notification.countDocuments({ user: user._id })).toBe(0);
    expect(await Notification.countDocuments({ user: other.user._id })).toBe(1);
  });

  it("saving a Cost per item says so in the notification", async () => {
    const { user, cookie } = await setup();
    await createProductRoute(req("POST", "/api/products", cookie, { idempotencyKey: "key-cost-note1", title: "Mug", price: "9", cost: "3" }));
    const note = await Notification.findOne({ user: user._id }).lean();
    expect(note).toMatchObject({ type: "success", title: "“Mug” created in Shopify" });
    expect(note.message).toMatch(/Cost per item saved .*expenses now include it/);
  });
});

describe("listing and inventory use the product table", () => {
  it("both render ProductTable (inventory with location, quantity and updated)", () => {
    const listing = fs.readFileSync("components/dashboard/listings/ListingTable.jsx", "utf8");
    const inventory = fs.readFileSync("components/dashboard/inventory/InventoryList.jsx", "utf8");
    expect(listing).toContain("<ProductTable ProductData={ListingData} onChanged={onChanged} />");
    expect(inventory).toContain("<ProductTable ProductData={inventorydata} onChanged={onChanged} showLocation />");
  });
});

describe("calculated expenses", () => {
  async function storeWithSales() {
    const ctx = await setup();
    await upsertShopifyProducts(ctx.store, [
      shopifyProduct(1, { variants: [{ id: 10, inventory_item_id: 100, unit_cost: 4 }] }),
      shopifyProduct(2, { variants: [{ id: 20, inventory_item_id: 200, unit_cost: null }] }),
    ]);
    await upsertShopifyOrders(ctx.store, [
      // Oct: 3 units of a product costing 4, all shipped.
      shopifyOrder(1, { created_at: "2026-10-05T10:00:00Z", currency: "USD", current_total_price: "30.00", line_items: [{ product_id: 1, variant_id: 10, quantity: 3, price: "10.00", fulfillable_quantity: 0 }] }),
      // Nov: 2 units of it (1 still to ship) + 1 unit without a cost.
      shopifyOrder(2, {
        created_at: "2026-11-02T10:00:00Z", currency: "USD", current_total_price: "50.00",
        line_items: [
          { product_id: 1, variant_id: 10, quantity: 2, price: "10.00", fulfillable_quantity: 1 },
          { product_id: 2, variant_id: 20, quantity: 1, price: "30.00", fulfillable_quantity: 0 },
        ],
      }),
    ]);
    await Order.updateOne({ shopifyOrderId: "2" }, { $set: { shopifyFees: 1.75 } });
    return ctx;
  }

  it("all time: product cost + Shopify fees", async () => {
    const { user } = await storeWithSales();
    const summary = await getDashboardSummary(user._id, await getActiveStores(user._id), { now: new Date("2026-11-03T00:00:00Z") });
    expect(summary.period).toEqual({ value: "all", label: "All time" });
    expect(summary.selected.costs).toEqual({ productCost: 20, shopifyFees: 1.75, unitsWithoutCost: 1 });
    expect(summary.selected).toMatchObject({ revenue: 80, orders: 2, expense: 21.75, profit: 58.25 });
    expect(summary.selectedChange).toBeNull();
    expect(summary.availableMonths.map((m) => m.value)).toEqual(["2026-11", "2026-10"]);
  });

  it("one month, compared with the month before", async () => {
    const { user } = await storeWithSales();
    const summary = await getDashboardSummary(user._id, await getActiveStores(user._id), { now: new Date("2026-11-03T00:00:00Z"), period: "2026-11" });
    expect(summary.period.label).toBe("Nov 2026");
    // 2 units × 4 + fees 1.75
    expect(summary.selected).toMatchObject({ revenue: 50, orders: 1, expense: 9.75 });
    expect(summary.selected.costs.unitsWithoutCost).toBe(1);
    expect(summary.selectedChange.revenue).toBeCloseTo(66.67, 1);
    // Oct: 3 × 4
    expect(summary.monthly.find((m) => m.month === "Oct").expense).toBe(12);
  });

  it("period parsing and the summary route", async () => {
    expect(parsePeriod("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parsePeriod("all")).toBeNull();
    expect(parsePeriod("2026-13")).toBeNull();

    const { cookie } = await storeWithSales();
    const body = await (await summaryRoute(req("GET", "/api/dashboard/summary?period=2026-10", cookie))).json();
    expect(body.data.period.value).toBe("2026-10");
    expect(body.data.selected.costs).toEqual({ productCost: 12, shopifyFees: 0, unitsWithoutCost: 0 });
  });
});

describe("order data for expenses", () => {
  it("stores the quantity still to ship per line", () => {
    const mapped = mapShopifyOrder(shopifyOrder(1, { line_items: [{ variant_id: 1, quantity: 3, price: "1", fulfillable_quantity: 1 }] }));
    expect(mapped.lineItems[0].fulfillableQuantity).toBe(1);
    expect(mapShopifyOrder(shopifyOrder(2)).lineItems[0].fulfillableQuantity).toBeNull();
  });

  it("reads payment fees in batches and stores them per order", async () => {
    const { store } = await setup();
    await upsertShopifyOrders(store, [shopifyOrder(1), shopifyOrder(2)]);
    const calls = [];
    const client = {
      async post(_url, body) {
        calls.push(body.variables.ids);
        return {
          data: {
            data: {
              nodes: [
                { legacyResourceId: "1", transactions: [{ fees: [{ amount: { amount: "1.20" } }, { amount: { amount: "0.30" } }] }] },
                { legacyResourceId: "2", transactions: [{ fees: [] }] },
              ],
            },
          },
        };
      },
    };
    expect(await refreshOrderFees(client, store, ["1", "2"])).toBe(2);
    expect(calls[0]).toEqual(["gid://shopify/Order/1", "gid://shopify/Order/2"]);
    const fees = Object.fromEntries((await Order.find().lean()).map((o) => [o.shopifyOrderId, o.shopifyFees]));
    expect(fees).toEqual({ 1: 1.5, 2: 0 });
  });
});

describe("backfill of orders stored before fees and shipped quantities", () => {
  it("re-reads only orders missing them, once", async () => {
    const { store } = await setup();
    // Stored by an older version: no fees, no shipped quantity.
    await Order.collection.insertMany([
      { user: store.user, shopifyStore: store._id, shopifyOrderId: "1", totalPrice: 10, lineItems: [{ variantId: "10", quantity: 2, price: 5 }], shopifyUpdatedAt: new Date("2026-10-01T00:00:00Z") },
      { user: store.user, shopifyStore: store._id, shopifyOrderId: "2", totalPrice: 0, lineItems: [{ variantId: "10", quantity: 1, price: 0 }], shopifyUpdatedAt: new Date("2026-10-01T00:00:00Z") },
    ]);
    const { backfillOrderDetails } = await import("@/lib/shopify/ordersync");
    const gets = [];
    const client = {
      async get(url, { params }) {
        gets.push(params.ids);
        // Shopify still has order 1 only (2 is outside its window).
        return { data: { orders: [shopifyOrder(1, { updated_at: "2026-10-01T00:00:00Z", line_items: [{ variant_id: 10, quantity: 2, price: "5.00", fulfillable_quantity: 0 }] })] } };
      },
      async post() {
        return { data: { data: { nodes: [{ legacyResourceId: "1", transactions: [{ fees: [{ amount: { amount: "0.40" } }] }] }] } } };
      },
    };
    expect(await backfillOrderDetails(client, store)).toEqual({ checked: 2 });
    expect(gets).toEqual(["1,2"]);
    const byId = Object.fromEntries((await Order.find().lean()).map((o) => [o.shopifyOrderId, o]));
    expect(byId["1"]).toMatchObject({ shopifyFees: 0.4 });
    expect(byId["1"].lineItems[0].fulfillableQuantity).toBe(0);
    expect(byId["2"]).toMatchObject({ shopifyFees: 0 });
    expect(byId["2"].lineItems[0].fulfillableQuantity).toBeNull();

    // Nothing left: no Shopify call.
    expect(await backfillOrderDetails(client, store)).toEqual({ checked: 0 });
    expect(gets).toHaveLength(1);
  });
});

describe("cost per item is saved to Shopify", () => {
  it("create sends it on the inventory item; edit updates it; the product shows it", async () => {
    const { user } = await setup();
    const { value } = validateProductInput({ idempotencyKey: "key-cost-00001", title: "Mug", price: "9.00", cost: "3.5" }, { mode: "create" });
    const { product } = await createProduct(user._id, value);
    expect(shopify.current.state.inputs.productSet[0].input.variants[0].inventoryItem).toMatchObject({ cost: "3.50" });

    await updateProduct(user._id, product._id, validateProductInput({ cost: "4" }, { mode: "update" }).value);
    expect(shopify.current.state.inputs.productVariantsBulkUpdate[0].variants[0].inventoryItem).toEqual({ cost: "4.00" });

    // The refreshed product records its cost (fake Shopify echoes unit_cost).
    await Product.updateOne({ _id: product._id }, { $set: { [`variantCosts.${product.variants[0].id}`]: 4 } });
    expect(toClientProduct(await Product.findById(product._id).lean()).cost).toBe("4.00");
  });

  it("the form sends cost only for single-variant products", () => {
    const baseline = formFromProduct({ title: "Mug", cost: "3.50" });
    expect(baseline.cost).toBe("3.50");
    expect(buildProductPayload({ ...baseline, cost: "4" }, baseline, { isEdit: true })).toEqual({ cost: "4" });
    expect(buildProductPayload({ ...baseline, cost: "4" }, baseline, { isEdit: true, shippingEditable: false })).toEqual({});
  });
});

describe("profile editing", () => {
  it("updates the name, validates input, and has no packaging setting", async () => {
    const { cookie } = await setup();
    let res = await updateMe(req("PATCH", "/api/auth/me", cookie, { name: "  Abdul  ", packagingCostPerItem: "0.75" }));
    expect(res.status).toBe(200);
    const saved = (await res.json()).user;
    expect(saved.name).toBe("Abdul");
    expect(saved).not.toHaveProperty("settings");

    res = await updateMe(req("PATCH", "/api/auth/me", cookie, { name: "x".repeat(81) }));
    expect(res.status).toBe(400);
    res = await updateMe(req("PATCH", "/api/auth/me", cookie, {}));
    expect(res.status).toBe(400);

    const me = await (await meRoute(req("GET", "/api/auth/me", cookie))).json();
    expect(me.user.name).toBe("Abdul");
  });

  it("changes the password, signs out other sessions and keeps this one", async () => {
    const user = await User.create({ email: "pw@example.com", password: await bcrypt.hash("old-password-1", 4) });
    const cookie = sessionCookieFor(user);
    const otherDevice = sessionCookieFor(user).split("=")[1];

    let res = await changePassword(req("POST", "/api/auth/password", cookie, { currentPassword: "wrong", newPassword: "new-password-1" }));
    expect(res.status).toBe(400);
    expect((await Notification.findOne({ user: user._id }).lean()).title).toBe("Password not changed");

    res = await changePassword(req("POST", "/api/auth/password", cookie, { currentPassword: "old-password-1", newPassword: "new-password-1" }));
    expect(res.status).toBe(200);
    const fresh = res.cookies.get("token").value;
    expect(await sessionStatus(fresh)).toBe("valid");
    expect(await sessionStatus(otherDevice)).toBe("invalid");
    const stored = await User.findById(user._id).lean();
    expect(await bcrypt.compare("new-password-1", stored.password)).toBe(true);
    expect((await Notification.find({ user: user._id }).sort({ createdAt: -1 }).lean())[0].title).toBe("Password changed");
  });

  it("refuses for Google/GitHub accounts", async () => {
    const { cookie } = await setup();
    const res = await changePassword(req("POST", "/api/auth/password", cookie, { currentPassword: "x", newPassword: "new-password-1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Google or GitHub/);
  });
});

describe("lists load 5 at a time", () => {
  it("adds 5 per step and never past the total", () => {
    expect(nextCount(5, 17)).toBe(10);
    expect(nextCount(15, 17)).toBe(17);
    expect(nextCount(5, 3)).toBe(3);
  });
});
