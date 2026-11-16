import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CalendarEvent from "@/models/CalendarEvent";
import EbayAccount from "@/models/EbayAccount";
import EbayProduct from "@/models/EbayProduct";
import Expense from "@/models/Expense";
import Notification from "@/models/Notification";
import Product from "@/models/Product";
import Shopifystore from "@/models/ShopifyStore";
import User from "@/models/User";
import { linkStore } from "@/lib/shopify/stores";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

import * as productItem from "@/app/api/products/[id]/route";
import * as productImages from "@/app/api/products/[id]/images/route";
import * as productRetry from "@/app/api/products/[id]/retry/route";
import * as products from "@/app/api/products/route";
import * as ebayProductItem from "@/app/api/ebay/products/[id]/route";
import * as ebayProductRetry from "@/app/api/ebay/products/[id]/retry/route";
import * as ebayProducts from "@/app/api/ebay/products/route";
import * as ebayAccountItem from "@/app/api/ebay/accounts/[id]/route";
import * as ebaySync from "@/app/api/ebay/sync/route";
import * as ebaySetup from "@/app/api/ebay/setup/route";
import * as ebayStatus from "@/app/api/ebay/status/route";
import * as ebayCategories from "@/app/api/ebay/options/categories/route";
import * as ebayConnect from "@/app/api/ebay/connect/route";
import * as storeItem from "@/app/api/shopify/stores/[id]/route";
import * as shopifySync from "@/app/api/shopify/sync/route";
import * as shopifyStatus from "@/app/api/shopify/status/route";
import * as shopifyHealth from "@/app/api/shopify/health/route";
import * as shopifyInstall from "@/app/api/shopify/install/route";
import * as shopifyMonthly from "@/app/api/shopify/Montlycalculation/route";
import * as webhookRegister from "@/app/api/shopify/webhooks/register/route";
import * as optCategories from "@/app/api/shopify/options/categories/route";
import * as optCollections from "@/app/api/shopify/options/collections/route";
import * as optLocations from "@/app/api/shopify/options/locations/route";
import * as optPublications from "@/app/api/shopify/options/publications/route";
import * as expenseItem from "@/app/api/expenses/[id]/route";
import * as expenses from "@/app/api/expenses/route";
import * as calendarItem from "@/app/api/calendar-events/[id]/route";
import * as calendar from "@/app/api/calendar-events/route";
import * as notifications from "@/app/api/notifications/route";
import * as inventory from "@/app/api/inventory/route";
import * as dashboard from "@/app/api/dashboard/summary/route";
import * as me from "@/app/api/auth/me/route";
import * as password from "@/app/api/auth/password/route";
import * as logoutAll from "@/app/api/auth/logout-all/route";

// Every seller sees and changes only their own records: seller B, signed in,
// gets 404 for each of seller A's records and nothing of A's changes; no
// request reaches Shopify or eBay on B's behalf. Without a session, every
// protected route answers 401 (or sends the browser to /Login).

const BASE = "http://localhost:3000";
const req = (method, path, cookie, body) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });
// 1×1 transparent PNG, so the upload passes type checks and reaches the
// ownership check.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// A complete, valid eBay listing update, so validation passes and the
// request reaches the ownership check.
const VALID_EBAY_UPDATE = {
  title: "Hacked title",
  description: "Changed by someone else.",
  price: "1.00",
  quantity: 1,
  condition: "NEW",
  categoryId: "9355",
  categoryName: "Cell Phones & Smartphones",
  aspects: { Brand: ["Apple"] },
  imageUrls: ["https://images.example.com/x.jpg"],
  publish: true,
};

let outbound;
let A;
let B;

async function seedSellerA() {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: `a${Math.floor(Math.random() * 1e9)}.myshopify.com`, accessToken: "a-token", scope: "read_products,write_products" });
  const product = await Product.create({ user: user._id, shopifyStore: store._id, shopifyProductId: "101", title: "A's mug", syncStatus: "failed", variants: [{ shopifyVariantId: "1", price: 10 }] });
  const ebayAccount = await EbayAccount.create({ user: user._id, environment: "sandbox", ebayUserId: "A-EBAY", username: "seller_a", marketplaceId: "EBAY_US", status: "active", refreshTokenEnc: "enc" });
  const ebayProduct = await EbayProduct.create({ user: user._id, ebayAccount: ebayAccount._id, sku: "A-SKU", title: "A's listing", syncStatus: "failed", pendingOperation: { type: "update", input: { title: "x" } } });
  const expense = await Expense.create({ user: user._id, shopifyStore: store._id, category: "advertising", amount: 25, currency: "USD", date: new Date("2026-11-01T12:00:00Z") });
  const event = await CalendarEvent.create({ user: user._id, title: "A's event", date: "2026-11-20", endDate: "2026-11-20", time: "10:00", color: "blue" });
  const note = await Notification.create({ user: user._id, type: "info", title: "A's notice", expiresAt: new Date(Date.now() + 86400000) });
  return { user, store, product, ebayAccount, ebayProduct, expense, event, note, cookie: sessionCookieFor(user) };
}

// Everything of A's, as stored, to compare before and after B's attempts.
const snapshotA = async () => {
  const u = A.user._id;
  const [store, product, ebayAccount, ebayProduct, expense, event, notes] = await Promise.all([
    Shopifystore.findById(A.store._id).select("+accessToken").lean(),
    Product.findById(A.product._id).lean(),
    EbayAccount.findById(A.ebayAccount._id).select("+refreshTokenEnc").lean(),
    EbayProduct.findById(A.ebayProduct._id).lean(),
    Expense.findById(A.expense._id).lean(),
    CalendarEvent.findById(A.event._id).lean(),
    Notification.find({ user: u }).lean(),
  ]);
  return JSON.stringify({ store, product, ebayAccount, ebayProduct, expense, event, notes });
};

beforeEach(async () => {
  await resetDatabase();
  outbound = [];
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    outbound.push(String(url));
    throw new Error("no outbound requests in this test");
  }));
  A = await seedSellerA();
  const userB = await createUser();
  B = { user: userB, cookie: sessionCookieFor(userB) };
});
afterEach(() => vi.unstubAllGlobals());

describe("seller B cannot read or change seller A's records", () => {
  it("gets 404 for each of A's records by id, and A's data is unchanged", async () => {
    const before = await snapshotA();
    const c = B.cookie;
    const upload = () => {
      const form = new FormData();
      form.append("image", new File([PNG], "x.png", { type: "image/png" }));
      return new NextRequest(`${BASE}/api/products/${A.product._id}/images`, { method: "POST", headers: { cookie: c }, body: form });
    };

    const attempts = {
      "GET products/[id]": () => productItem.GET(req("GET", `/api/products/${A.product._id}`, c), params(A.product._id)),
      "PATCH products/[id]": () => productItem.PATCH(req("PATCH", `/api/products/${A.product._id}`, c, { title: "Hacked" }), params(A.product._id)),
      "DELETE products/[id]": () => productItem.DELETE(req("DELETE", `/api/products/${A.product._id}`, c, { confirm: true }), params(A.product._id)),
      "POST products/[id]/images": () => productImages.POST(upload(), params(A.product._id)),
      "POST products/[id]/retry": () => productRetry.POST(req("POST", `/api/products/${A.product._id}/retry`, c), params(A.product._id)),
      "GET ebay/products/[id]": () => ebayProductItem.GET(req("GET", `/api/ebay/products/${A.ebayProduct._id}`, c), params(A.ebayProduct._id)),
      "PATCH ebay/products/[id]": () => ebayProductItem.PATCH(req("PATCH", `/api/ebay/products/${A.ebayProduct._id}`, c, VALID_EBAY_UPDATE), params(A.ebayProduct._id)),
      "DELETE ebay/products/[id]": () => ebayProductItem.DELETE(req("DELETE", `/api/ebay/products/${A.ebayProduct._id}`, c), params(A.ebayProduct._id)),
      "POST ebay/products/[id]/retry": () => ebayProductRetry.POST(req("POST", `/api/ebay/products/${A.ebayProduct._id}/retry`, c), params(A.ebayProduct._id)),
      "DELETE ebay/accounts/[id]": () => ebayAccountItem.DELETE(req("DELETE", `/api/ebay/accounts/${A.ebayAccount._id}`, c), params(A.ebayAccount._id)),
      "GET ebay/setup?accountId": () => ebaySetup.GET(req("GET", `/api/ebay/setup?accountId=${A.ebayAccount._id}`, c)),
      "DELETE shopify/stores/[id]": () => storeItem.DELETE(req("DELETE", `/api/shopify/stores/${A.store._id}`, c), params(A.store._id)),
      "GET shopify/options/locations?storeId": () => optLocations.GET(req("GET", `/api/shopify/options/locations?storeId=${A.store._id}`, c)),
      "PATCH expenses/[id]": () => expenseItem.PATCH(req("PATCH", `/api/expenses/${A.expense._id}`, c, { amount: "1" }), params(A.expense._id)),
      "DELETE expenses/[id]": () => expenseItem.DELETE(req("DELETE", `/api/expenses/${A.expense._id}`, c), params(A.expense._id)),
      "DELETE calendar-events/[id]": () => calendarItem.DELETE(req("DELETE", `/api/calendar-events/${A.event._id}`, c), params(A.event._id)),
    };
    const statuses = {};
    for (const [name, call] of Object.entries(attempts)) statuses[name] = (await call()).status;
    expect(statuses).toEqual(Object.fromEntries(Object.keys(attempts).map((k) => [k, 404])));

    expect(outbound).toEqual([]);
    expect(await snapshotA()).toBe(before);
  });

  it("cannot reach A's store or eBay account through sync, and lists show only B's own data", async () => {
    const before = await snapshotA();
    const c = B.cookie;

    const ebay = await ebaySync.POST(req("POST", "/api/ebay/sync", c, { accountId: String(A.ebayAccount._id) }));
    expect(ebay.status).toBe(409); // B has no eBay account of their own
    const shop = await shopifySync.POST(req("POST", "/api/shopify/sync", c, { storeId: String(A.store._id) }));
    expect([404, 409]).toContain(shop.status);

    const text = JSON.stringify(await Promise.all([
      shopifyStatus.GET(req("GET", "/api/shopify/status", c)).then((r) => r.json()),
      ebayStatus.GET(req("GET", "/api/ebay/status", c)).then((r) => r.json()),
      expenses.GET(req("GET", "/api/expenses", c)).then((r) => r.json()),
      calendar.GET(req("GET", "/api/calendar-events", c)).then((r) => r.json()),
      notifications.GET(req("GET", "/api/notifications", c)).then((r) => r.json()),
      inventory.GET(req("GET", "/api/inventory", c)).then((r) => r.json()),
      dashboard.GET(req("GET", "/api/dashboard/summary", c)).then((r) => r.json()),
    ]));
    for (const id of [A.store._id, A.product._id, A.ebayAccount._id, A.ebayProduct._id, A.expense._id, A.event._id, A.note._id]) {
      expect(text).not.toContain(String(id));
    }
    for (const value of [A.store.shop, "seller_a", "A-EBAY", "A's mug", "A's listing", "A's event", "A's notice"]) {
      expect(text).not.toContain(value);
    }

    expect(outbound).toEqual([]);
    expect(await snapshotA()).toBe(before);
  });

  it("marking or clearing notifications affects only B's own", async () => {
    await notifications.PATCH(req("PATCH", "/api/notifications", B.cookie, { ids: [String(A.note._id)] }));
    await notifications.PATCH(req("PATCH", "/api/notifications", B.cookie, { all: true }));
    await notifications.DELETE(req("DELETE", "/api/notifications", B.cookie));
    const note = await Notification.findById(A.note._id).lean();
    expect(note).not.toBeNull();
    expect(note.readAt ?? null).toBeNull();
  });

  it("never returns password hashes, reset hashes or marketplace tokens", async () => {
    await User.updateOne({ _id: A.user._id }, { $set: { password: "$2b$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345", passwordResetHash: "reset-hash-secret" } });
    const c = A.cookie;
    const bodies = await Promise.all([
      me.GET(req("GET", "/api/auth/me", c)).then((r) => r.text()),
      shopifyStatus.GET(req("GET", "/api/shopify/status", c)).then((r) => r.text()),
      ebayStatus.GET(req("GET", "/api/ebay/status", c)).then((r) => r.text()),
      productItem.GET(req("GET", `/api/products/${A.product._id}`, c), params(A.product._id)).then((r) => r.text()),
      ebayProductItem.GET(req("GET", `/api/ebay/products/${A.ebayProduct._id}`, c), params(A.ebayProduct._id)).then((r) => r.text()),
      inventory.GET(req("GET", "/api/inventory", c)).then((r) => r.text()),
    ]);
    const text = bodies.join("\n");
    for (const secret of ["$2b$12$", "reset-hash-secret", "a-token", '"enc"', "refreshTokenEnc", "accessToken", "passwordResetHash"]) {
      expect(text).not.toContain(secret);
    }
    // The hash is not even loaded unless a query asks for it.
    expect((await User.findById(A.user._id).lean()).password).toBeUndefined();
  });
});

describe("no session", () => {
  it("every protected route answers 401", async () => {
    const id = A.product._id;
    const calls = {
      "products POST": () => products.POST(req("POST", "/api/products", null, {})),
      "products/[id] GET": () => productItem.GET(req("GET", `/api/products/${id}`), params(id)),
      "products/[id] PATCH": () => productItem.PATCH(req("PATCH", `/api/products/${id}`, null, {}), params(id)),
      "products/[id] DELETE": () => productItem.DELETE(req("DELETE", `/api/products/${id}`), params(id)),
      "products/[id]/images POST": () => productImages.POST(req("POST", `/api/products/${id}/images`), params(id)),
      "products/[id]/retry POST": () => productRetry.POST(req("POST", `/api/products/${id}/retry`), params(id)),
      "ebay/products POST": () => ebayProducts.POST(req("POST", "/api/ebay/products", null, {})),
      "ebay/products/[id] GET": () => ebayProductItem.GET(req("GET", `/api/ebay/products/${id}`), params(id)),
      "ebay/products/[id] PATCH": () => ebayProductItem.PATCH(req("PATCH", `/api/ebay/products/${id}`, null, {}), params(id)),
      "ebay/products/[id] DELETE": () => ebayProductItem.DELETE(req("DELETE", `/api/ebay/products/${id}`), params(id)),
      "ebay/products/[id]/retry POST": () => ebayProductRetry.POST(req("POST", `/api/ebay/products/${id}/retry`), params(id)),
      "ebay/accounts/[id] DELETE": () => ebayAccountItem.DELETE(req("DELETE", `/api/ebay/accounts/${id}`), params(id)),
      "ebay/sync POST": () => ebaySync.POST(req("POST", "/api/ebay/sync", null, {})),
      "ebay/setup GET": () => ebaySetup.GET(req("GET", "/api/ebay/setup")),
      "ebay/setup POST": () => ebaySetup.POST(req("POST", "/api/ebay/setup", null, {})),
      "ebay/status GET": () => ebayStatus.GET(req("GET", "/api/ebay/status")),
      "ebay/options/categories GET": () => ebayCategories.GET(req("GET", "/api/ebay/options/categories?q=mug")),
      "shopify/stores/[id] DELETE": () => storeItem.DELETE(req("DELETE", `/api/shopify/stores/${id}`), params(id)),
      "shopify/sync POST": () => shopifySync.POST(req("POST", "/api/shopify/sync", null, {})),
      "shopify/status GET": () => shopifyStatus.GET(req("GET", "/api/shopify/status")),
      "shopify/health GET": () => shopifyHealth.GET(req("GET", "/api/shopify/health")),
      "shopify/Montlycalculation GET": () => shopifyMonthly.GET(req("GET", "/api/shopify/Montlycalculation")),
      "shopify/webhooks/register POST": () => webhookRegister.POST(req("POST", "/api/shopify/webhooks/register", null, {})),
      "shopify/options/categories GET": () => optCategories.GET(req("GET", "/api/shopify/options/categories?q=mug")),
      "shopify/options/collections GET": () => optCollections.GET(req("GET", "/api/shopify/options/collections")),
      "shopify/options/locations GET": () => optLocations.GET(req("GET", "/api/shopify/options/locations")),
      "shopify/options/publications GET": () => optPublications.GET(req("GET", "/api/shopify/options/publications")),
      "expenses GET": () => expenses.GET(req("GET", "/api/expenses")),
      "expenses POST": () => expenses.POST(req("POST", "/api/expenses", null, {})),
      "expenses/[id] PATCH": () => expenseItem.PATCH(req("PATCH", `/api/expenses/${id}`, null, {}), params(id)),
      "expenses/[id] DELETE": () => expenseItem.DELETE(req("DELETE", `/api/expenses/${id}`), params(id)),
      "calendar-events GET": () => calendar.GET(req("GET", "/api/calendar-events")),
      "calendar-events POST": () => calendar.POST(req("POST", "/api/calendar-events", null, {})),
      "calendar-events/[id] DELETE": () => calendarItem.DELETE(req("DELETE", `/api/calendar-events/${id}`), params(id)),
      "notifications GET": () => notifications.GET(req("GET", "/api/notifications")),
      "notifications PATCH": () => notifications.PATCH(req("PATCH", "/api/notifications", null, {})),
      "notifications DELETE": () => notifications.DELETE(req("DELETE", "/api/notifications")),
      "inventory GET": () => inventory.GET(req("GET", "/api/inventory")),
      "dashboard/summary GET": () => dashboard.GET(req("GET", "/api/dashboard/summary")),
      "auth/me GET": () => me.GET(req("GET", "/api/auth/me")),
      "auth/me PATCH": () => me.PATCH(req("PATCH", "/api/auth/me", null, {})),
      "auth/password POST": () => password.POST(req("POST", "/api/auth/password", null, {})),
      "auth/logout-all POST": () => logoutAll.POST(req("POST", "/api/auth/logout-all")),
    };
    const statuses = {};
    for (const [name, call] of Object.entries(calls)) statuses[name] = (await call()).status;
    expect(statuses).toEqual(Object.fromEntries(Object.keys(calls).map((k) => [k, 401])));
    expect(outbound).toEqual([]);
  });

  it("the connect flows send the browser to /Login instead", async () => {
    for (const res of [
      await shopifyInstall.GET(req("GET", `/api/shopify/install?shop=${A.store.shop}`)),
      await ebayConnect.GET(req("GET", "/api/ebay/connect")),
    ]) {
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      expect(new URL(res.headers.get("location")).pathname).toBe("/Login");
    }
  });
});
