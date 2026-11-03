import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import Expense from "@/models/Expense";
import Shopifystore from "@/models/ShopifyStore";
import Order from "@/models/Order";
import { linkStore } from "@/lib/shopify/stores";
import { parseExpenseDate, validateExpense } from "@/lib/expenses";
import { upsertShopifyOrders } from "@/lib/shopify/ordersync";
import { getActiveStores } from "@/lib/catalog";
import { getDashboardSummary } from "@/lib/analytics/dashboard";
import { GET as list, POST as create } from "@/app/api/expenses/route";
import { PATCH as patch, DELETE as remove } from "@/app/api/expenses/[id]/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { shopifyOrder } from "./helpers/fakeShopify";

const BASE = "http://localhost:3000";
const req = (method, path, cookie, body) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

async function userWithStore(currency = "PKR") {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: `s${Math.floor(Math.random() * 1e9)}.myshopify.com`, accessToken: "t", scope: "" });
  await Shopifystore.updateOne({ _id: store._id }, { $set: { currency, timezone: "America/New_York" } });
  return { user, store, cookie: sessionCookieFor(user) };
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Expense.init(), Shopifystore.init(), Order.init()]);
});

describe("validation", () => {
  it("parses real calendar dates at 12:00 UTC only", () => {
    expect(parseExpenseDate("2026-11-01").toISOString()).toBe("2026-11-01T12:00:00.000Z");
    expect(parseExpenseDate("2026-02-30")).toBeNull();
    expect(parseExpenseDate("01/11/2026")).toBeNull();
    expect(parseExpenseDate({ $gt: "" })).toBeNull();
  });

  it("validates fields and defaults the currency", () => {
    const ok = validateExpense({ date: "2026-11-01", category: "shipping", amount: "12.5" }, { mode: "create", defaultCurrency: "PKR" });
    expect(ok.errors).toEqual({});
    expect(ok.value).toMatchObject({ category: "shipping", amount: 12.5, currency: "PKR", description: "" });

    const bad = validateExpense({ date: "nope", category: "bribes", amount: "-3", currency: "dollars" }, { mode: "create" });
    expect(Object.keys(bad.errors).sort()).toEqual(["amount", "category", "currency", "date"]);
    expect(validateExpense({ amount: "0" }, { mode: "update" }).errors.amount).toBeDefined();
    expect(validateExpense({ amount: "1.999" }, { mode: "update" }).errors.amount).toBeDefined();
    expect(validateExpense({ description: "x".repeat(501) }, { mode: "update" }).errors.description).toBeDefined();
  });
});

describe("routes", () => {
  it("require authentication", async () => {
    expect((await list(req("GET", "/api/expenses"))).status).toBe(401);
    expect((await create(req("POST", "/api/expenses", null, {}))).status).toBe(401);
    expect((await patch(req("PATCH", "/x", null, {}), params("507f1f77bcf86cd799439011"))).status).toBe(401);
    expect((await remove(req("DELETE", "/x"), params("507f1f77bcf86cd799439011"))).status).toBe(401);
  });

  it("creates with the store currency, lists, edits and deletes", async () => {
    const { cookie } = await userWithStore("PKR");

    const created = await create(req("POST", "/api/expenses", cookie, { date: "2026-11-01", category: "advertising", amount: "1500", description: "Ads" }));
    expect(created.status).toBe(201);
    const { expense } = await created.json();
    expect(expense).toMatchObject({ date: "2026-11-01", category: "advertising", amount: 1500, currency: "PKR", description: "Ads" });

    const listed = await (await list(req("GET", "/api/expenses", cookie))).json();
    expect(listed).toMatchObject({ storeCurrency: "PKR", data: [{ id: expense.id }] });

    const edited = await patch(req("PATCH", "/x", cookie, { amount: "2000" }), params(expense.id));
    expect((await edited.json()).expense.amount).toBe(2000);

    expect((await remove(req("DELETE", "/x", cookie), params(expense.id))).status).toBe(200);
    expect(await Expense.countDocuments()).toBe(0);
  });

  it("returns 400 with field errors", async () => {
    const { cookie } = await userWithStore();
    const res = await create(req("POST", "/api/expenses", cookie, { date: "2026-13-01", category: "x", amount: "" }));
    expect(res.status).toBe(400);
    expect(Object.keys((await res.json()).errors).sort()).toEqual(["amount", "category", "date"]);
  });

  it("requires a currency when the user has no store", async () => {
    const user = await createUser();
    const res = await create(req("POST", "/api/expenses", sessionCookieFor(user), { date: "2026-11-01", category: "rent", amount: "10" }));
    expect((await res.json()).errors.currency).toBeDefined();
  });

  it("users cannot see, edit or delete each other's expenses", async () => {
    const a = await userWithStore();
    const b = await userWithStore();
    const { expense } = await (await create(req("POST", "/api/expenses", a.cookie, { date: "2026-11-01", category: "rent", amount: "10" }))).json();

    expect((await (await list(req("GET", "/api/expenses", b.cookie))).json()).data).toEqual([]);
    expect((await patch(req("PATCH", "/x", b.cookie, { amount: "1" }), params(expense.id))).status).toBe(404);
    expect((await remove(req("DELETE", "/x", b.cookie), params(expense.id))).status).toBe(404);
    expect((await Expense.findById(expense.id)).amount).toBe(10);
  });
});

describe("dashboard expenses are calculated, not entered", () => {
  it("manually entered expenses no longer count toward the dashboard", async () => {
    const { user, store, cookie } = await userWithStore("PKR");
    await upsertShopifyOrders(store, [shopifyOrder(1, { created_at: "2026-11-01T15:00:00Z", current_total_price: "1000.00", currency: "PKR" })]);
    await create(req("POST", "/api/expenses", cookie, { date: "2026-11-01", category: "advertising", amount: "250" }));
    await create(req("POST", "/api/expenses", cookie, { date: "2026-11-02", category: "software", amount: "99", currency: "USD" }));

    const summary = await getDashboardSummary(user._id, await getActiveStores(user._id), { now: new Date("2026-11-03T12:00:00Z") });
    // No cost per item, fees or packaging rate: calculated expenses are 0.
    expect(summary.current).toMatchObject({ revenue: 1000, expense: 0, profit: 1000, ProfitMargin: 100, Roi: null });
  });
});
