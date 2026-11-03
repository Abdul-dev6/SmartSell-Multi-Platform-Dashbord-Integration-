import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebhookEvent from "@/models/WebhookEvent";
import CronRun from "@/models/CronRun";
import Order from "@/models/Order";
import Shopifystore from "@/models/ShopifyStore";
import { proxy } from "@/proxy";
import { logError, requestIdOf } from "@/lib/observability/log";
import { getStoreHealth } from "@/lib/observability/health";
import { apiErrorText } from "@/components/dashboard/shared/apiError";
import { linkStore } from "@/lib/shopify/stores";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { shopifyOrder } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/shopify/client", () => ({ createClient: () => shopify.current }));
const nextAuth = vi.hoisted(() => ({ session: null }));
vi.mock("@/auth", () => ({ auth: async () => nextAuth.session }));

const { POST: webhook } = await import("@/app/api/shopify/webhooks/route");
const { GET: worker } = await import("@/app/api/shopify/webhooks/process/route");
const { GET: health } = await import("@/app/api/shopify/health/route");
const { GET: dashboard } = await import("@/app/api/dashboard/summary/route");
const { completeSocialLogin } = await import("@/lib/auth/socialLogin");

const BASE = "http://localhost:3000";
const SECRET = process.env.SHOPIFY_CLIENT_SECRET;

function delivery(shop, topic, payload) {
  const body = JSON.stringify(payload);
  return new NextRequest(`${BASE}/api/shopify/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": crypto.createHmac("sha256", SECRET).update(body).digest("base64"),
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop,
      "x-shopify-webhook-id": crypto.randomUUID(),
    },
    body,
  });
}

let errorLog;
beforeEach(async () => {
  await resetDatabase();
  await Promise.all([WebhookEvent.syncIndexes(), CronRun.syncIndexes(), Order.syncIndexes(), Shopifystore.init()]);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const loggedEntries = () => errorLog.mock.calls.map(([line]) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);

describe("request IDs", () => {
  it("the proxy gives every API request an ID and returns it, also on blocked requests", async () => {
    const ok = await proxy(new NextRequest(`${BASE}/api/inventory`));
    const id = ok.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // forwarded to the route as a request header
    expect(ok.headers.get("x-middleware-override-headers")).toContain("x-request-id");
    expect(ok.headers.get("x-middleware-request-x-request-id")).toBe(id);

    const blocked = await proxy(new NextRequest(`${BASE}/api/products`, { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("x-request-id")).toBeTruthy();

    const vercel = await proxy(new NextRequest(`${BASE}/api/inventory`, { headers: { "x-vercel-id": "iad1::abc-123" } }));
    expect(vercel.headers.get("x-request-id")).toBe("iad1::abc-123");
  });

  it("route errors are logged as one JSON line carrying that ID", async () => {
    const user = await createUser();
    await linkStore({ userId: user._id, shop: "obs-store.myshopify.com", accessToken: "t", scope: "" });
    const spy = vi.spyOn(await import("@/lib/analytics/dashboard"), "getDashboardSummary").mockRejectedValue(Object.assign(new Error("boom"), { code: 42 }));
    const res = await dashboard(new NextRequest(`${BASE}/api/dashboard/summary`, { headers: { cookie: sessionCookieFor(user), "x-request-id": "req-123" } }));
    expect(res.status).toBe(500);
    expect(loggedEntries()).toContainEqual(expect.objectContaining({ level: "error", requestId: "req-123", error: "Error", code: "42", message: "boom" }));
    spy.mockRestore();
  });

  it("logError can omit the message, and requestIdOf tolerates a missing request", () => {
    logError(null, "x", new Error("contains secret@example.com"), { message: false, provider: "github" });
    expect(loggedEntries().at(-1)).toEqual({ level: "error", event: "x", requestId: null, error: "Error", provider: "github" });
    expect(requestIdOf(undefined)).toBeNull();
  });

  it("the UI shows the reference for server errors only", () => {
    const res = (status) => ({ status, headers: new Headers({ "x-request-id": "ref-9" }) });
    expect(apiErrorText(res(500), { message: "Something went wrong." })).toBe("Something went wrong. (Reference: ref-9)");
    expect(apiErrorText(res(404), { message: "Not found." })).toBe("Not found.");
    expect(apiErrorText(res(502), {}, "Sync failed.")).toBe("Sync failed. (Reference: ref-9)");
  });
});

describe("no personal data in logs", () => {
  it("a failed social sign-in logs the error type, never the message", async () => {
    nextAuth.session = { user: { email: "person@example.com" }, emailVerified: true };
    const User = (await import("@/models/User")).default;
    vi.spyOn(User, "create").mockRejectedValue(Object.assign(new Error('E11000 duplicate key { email: "person@example.com" }'), { code: 11000 }));
    const res = await completeSocialLogin(new NextRequest(`${BASE}/api/auth/google`), "google");
    expect(new URL(res.headers.get("location")).searchParams.get("error")).toBe("google_login_failed");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("person@example.com");
    expect(loggedEntries()).toContainEqual(expect.objectContaining({ event: "social_login_failed", code: "11000", provider: "google" }));
  });

  it("a processed order event keeps no customer details; the order keeps name and email", async () => {
    const user = await createUser();
    shopify.current = null;
    const store = await linkStore({ userId: user._id, shop: "pii-store.myshopify.com", accessToken: "t", scope: "" });
    expect((await webhook(delivery(store.shop, "orders/create", shopifyOrder(1)))).status).toBe(200);

    const event = await WebhookEvent.findOne({ topic: "orders/create" }).lean();
    expect(event.status).toBe("completed");
    expect(event.payload.customer).toBeUndefined();
    expect(event.payload.id).toBe(1);
    expect((await Order.findOne({ shopifyOrderId: "1" }).lean()).customer).toEqual({ name: "Ada Lovelace", email: "ada@example.com" });
  });
});

describe("sync health", () => {
  it("reports this user's failed and stuck webhook events and the last daily run", async () => {
    const user = await createUser();
    const other = await createUser();
    const store = await linkStore({ userId: user._id, shop: "health-a.myshopify.com", accessToken: "t", scope: "" });
    const otherStore = await linkStore({ userId: other._id, shop: "health-b.myshopify.com", accessToken: "t", scope: "" });
    const now = new Date();
    const event = (s, extra) => ({ webhookId: crypto.randomUUID(), topic: "products/update", shop: s.shop, shopifyStore: s._id, user: s.user, payload: {}, ...extra });
    await WebhookEvent.create([
      event(store, { status: "failed", attempts: 8, lastError: "MongoServerError" }),
      event(store, { status: "pending", receivedAt: new Date(now - 60 * 60 * 1000) }),
      event(store, { status: "completed" }),
      event(otherStore, { status: "failed", attempts: 8 }),
    ]);
    await CronRun.create({ startedAt: new Date(now - 3600000), status: "success", processed: 99, expiresAt: new Date(now.getTime() + 86400000) });

    const res = await health(new NextRequest(`${BASE}/api/shopify/health`, { headers: { cookie: sessionCookieFor(user) } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.stores).toHaveLength(1);
    expect(body.stores[0].webhooks).toMatchObject({ failedLast7Days: 1, pending: 1, stuck: true });
    expect(body.stores[0].webhooks.recentFailures).toEqual([expect.objectContaining({ topic: "products/update", attempts: 8, error: "MongoServerError" })]);
    expect(body.cron).toMatchObject({ status: "success", overdue: false });
    // Only when the worker ran and whether it succeeded; never its global totals.
    expect(Object.keys(body.cron).sort()).toEqual(["lastRunAt", "overdue", "status"]);
  });

  it("flags a missing or overdue daily run", async () => {
    expect((await getStoreHealth([])).cron).toMatchObject({ lastRunAt: null, overdue: true });
    await CronRun.create({ startedAt: new Date(Date.now() - 30 * 3600000), status: "success", expiresAt: new Date(Date.now() + 86400000) });
    expect((await getStoreHealth([])).cron.overdue).toBe(true);
  });

  it("the daily worker records each run", async () => {
    process.env.CRON_SECRET = "cron-secret-value";
    try {
      const res = await worker(new NextRequest(`${BASE}/api/shopify/webhooks/process`, { headers: { authorization: "Bearer cron-secret-value" } }));
      expect(res.status).toBe(200);
      const run = await CronRun.findOne().lean();
      expect(run).toMatchObject({ status: "success", processed: 0, reconciliation: { due: 0 } });
      expect(run.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it("requires a session", async () => {
    expect((await health(new NextRequest(`${BASE}/api/shopify/health`))).status).toBe(401);
  });
});
