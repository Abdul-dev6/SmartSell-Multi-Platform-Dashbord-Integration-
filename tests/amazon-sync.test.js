import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import AmazonInventory from "@/models/AmazonInventory";
import AmazonOrder from "@/models/AmazonOrder";
import AmazonFinancialEvent from "@/models/AmazonFinancialEvent";
import AmazonSyncJob from "@/models/AmazonSyncJob";
import AmazonSyncCheckpoint from "@/models/AmazonSyncCheckpoint";
import EbayAccount from "@/models/EbayAccount";
import Product from "@/models/Product";
import Notification from "@/models/Notification";
import { clearLwaCache } from "@/lib/amazon/lwa";
import { clientDefaults } from "@/lib/amazon/client";
import { disconnectAmazonAccount, linkAmazonAccount } from "@/lib/amazon/accounts";
import { enqueueSync, runJob } from "@/lib/amazon/sync";
import { linkStore } from "@/lib/shopify/stores";
import { GET as cron } from "@/app/api/amazon/sync/process/route";
import * as syncRoute from "@/app/api/amazon/sync/route";
import { GET as ordersRoute } from "@/app/api/amazon/orders/route";
import { GET as financesRoute } from "@/app/api/amazon/finances/route";
import { GET as inventoryRoute } from "@/app/api/amazon/inventory/route";
import { GET as pricingRoute } from "@/app/api/amazon/pricing/route";
import { DELETE as disconnectRoute } from "@/app/api/amazon/accounts/[id]/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { clearAmazonEnv, installFakeAmazon, json, productionEnv } from "./helpers/fakeAmazon";

// Initial and incremental Amazon sync (listings, FBA inventory, orders,
// transactions, settlement groups) against a faked SP-API answering with
// Amazon's official example responses where they exist.

const EX = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/production-api-examples.json"), "utf8"));
const SANDBOX_EX = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/static-sandbox-examples.json"), "utf8"));
const BASE = "http://localhost:3000";
const MP = "ATVPDKIKX0DER";
const req = (method, p, cookie, body, headers = {}) =>
  new NextRequest(`${BASE}${p}`, { method, headers: { "content-type": "application/json", ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const PII = ["John Smith", "buyer-email@marketplace.amazon.co.jp", "123 Business Park", "150-0002", "4854564857", "34550454504545"];

// The official order example belongs to the JP marketplace; here it is the
// seller's US order (same structure, including the mock buyer data).
const usOrder = (over = {}) => ({ ...EX.searchOrders.orders[0], salesChannel: { ...EX.searchOrders.orders[0].salesChannel, marketplaceId: MP }, ...over });
const fba = (sku, fulfillable) => ({ asin: "B0FBA00001", fnSku: "X00FBA0001", sellerSku: sku, condition: "NewItem", productName: `FBA ${sku}`, totalQuantity: fulfillable + 2, lastUpdatedTime: "2026-11-10T00:00:00Z", inventoryDetails: { fulfillableQuantity: fulfillable, inboundWorkingQuantity: 1, inboundShippedQuantity: 1, inboundReceivingQuantity: 0, reservedQuantity: { totalReservedQuantity: 0 }, researchingQuantity: { totalResearchingQuantity: 0 }, unfulfillableQuantity: { totalUnfulfillableQuantity: 0 } } });

let amazon;
let seller;
let account;
function routes() {
  amazon
    .on("GET /sellers/v1/marketplaceParticipations", () => SANDBOX_EX.getMarketplaceParticipations.response)
    .on("GET /listings/2021-08-01/items/:seller", (r) =>
      r.query.get("pageToken") === "page-2"
        ? { numberOfResults: 2, items: [{ ...EX.searchListingsItems.items[0], sku: "SKU-B" }] }
        : { numberOfResults: 2, pagination: { nextToken: "page-2" }, items: [{ ...EX.searchListingsItems.items[0], sku: "SKU-A" }] },
    )
    .on("GET /fba/inventory/v1/summaries", (r) =>
      r.query.get("nextToken") === "fba-2"
        ? { payload: { granularity: { granularityType: "Marketplace", granularityId: MP }, inventorySummaries: [fba("FBA-2", 4)] } }
        : { payload: { granularity: { granularityType: "Marketplace", granularityId: MP }, inventorySummaries: [fba("FBA-1", 9)] }, pagination: { nextToken: "fba-2" } },
    )
    .on("GET /orders/2026-01-01/orders", (r) =>
      r.query.get("paginationToken") === EX.searchOrders.pagination.nextToken
        ? { orders: [usOrder({ orderId: "111-0000000-0000002" })], lastUpdatedBefore: "2026-11-15T12:00:00Z" }
        : { orders: [usOrder()], pagination: EX.searchOrders.pagination, lastUpdatedBefore: "2026-11-15T12:00:00Z" },
    )
    .on("GET /finances/2024-06-19/transactions", (r) => (r.query.get("nextToken") ? { payload: { transactions: [] } } : EX.listTransactions))
    .on("GET /finances/v0/financialEventGroups", (r) => (r.query.get("NextToken") ? { payload: { FinancialEventGroupList: [] } } : EX.listFinancialEventGroups));
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([AmazonAccount.init(), AmazonListing.init(), AmazonInventory.init(), AmazonOrder.init(), AmazonFinancialEvent.init(), AmazonSyncJob.init(), AmazonSyncCheckpoint.init()]);
  clearLwaCache();
  clientDefaults.sleep = async () => {};
  productionEnv();
  process.env.CRON_SECRET = "cron-test-secret";
  amazon = installFakeAmazon();
  routes();
  for (const level of ["error", "warn", "info"]) vi.spyOn(console, level).mockImplementation(() => {});
  const user = await createUser();
  seller = { user, cookie: sessionCookieFor(user) };
  account = await linkAmazonAccount({ userId: user._id, environment: "production", sellingPartnerId: "A1SELLERPROD", marketplaces: [{ id: MP, name: "Amazon.com", countryCode: "US", currency: "USD", isParticipating: true }], refreshToken: "Atzr|seller-token" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAmazonEnv();
  delete process.env.CRON_SECRET;
});

const initial = async () => (await enqueueSync(account, "initial")).job;
const counts = async () => ({
  listings: await AmazonListing.countDocuments(),
  fba: await AmazonInventory.countDocuments(),
  orders: await AmazonOrder.countDocuments(),
  financial: await AmazonFinancialEvent.countDocuments(),
});

describe("initial sync", () => {
  it("syncs every resource with pagination, tracks each one, and completes", async () => {
    const job = await initial();
    const result = await runJob(job._id);
    expect(result).toMatchObject({ ran: true, status: "completed" });
    const done = await AmazonSyncJob.findById(job._id).lean();
    expect(done).toMatchObject({ status: "completed", active: false });
    expect(Object.fromEntries(done.resources.map((r) => [r.name, [r.status, r.count]]))).toEqual({
      marketplaces: ["completed", 1],
      listings: ["completed", 2],
      fbaInventory: ["completed", 2],
      orders: ["completed", 2],
      transactions: ["completed", 1],
      eventGroups: ["completed", 1],
    });
    expect(await counts()).toEqual({ listings: 2, fba: 2, orders: 2, financial: 2 });
    expect((await AmazonAccount.findById(account._id).lean()).lastSuccessfulSyncAt).toBeInstanceOf(Date);
    expect(amazon.calls("GET /listings/2021-08-01/items/:seller").map((c) => c.query.get("pageToken"))).toEqual([null, "page-2"]);
    expect(amazon.calls("GET /fba/inventory/v1/summaries")[0].query.get("granularityType")).toBe("Marketplace");
  });

  it("maps FBA inventory states and listings' own offers; FBA stays read only", async () => {
    await runJob((await initial())._id);
    expect(await AmazonInventory.findOne({ sellerSku: "FBA-1" }).lean()).toMatchObject({ fulfillableQuantity: 9, inboundWorkingQuantity: 1, inboundShippedQuantity: 1, reservedQuantity: 0, totalQuantity: 11 });
    const inv = await (await inventoryRoute(req("GET", "/api/amazon/inventory", seller.cookie))).json();
    expect(inv.fbaWritable).toBe(false);
    expect(inv.fba.map((i) => i.sku).sort()).toEqual(["FBA-1", "FBA-2"]);
    const lib = fs.readdirSync(path.join(import.meta.dirname, "..", "lib", "amazon")).map((f) => fs.readFileSync(path.join(import.meta.dirname, "..", "lib", "amazon", f), "utf8")).join("\n");
    // No FBA write endpoint (Amazon's are sandbox-only) is ever called.
    expect(lib).not.toContain("/fba/inventory/v1/items");
    const pricing = await (await pricingRoute(req("GET", "/api/amazon/pricing", seller.cookie))).json();
    expect(pricing.items.map((i) => i.sku).sort()).toEqual(["SKU-A", "SKU-B"]);
  });
});

describe("orders (2026-01-01) and privacy", () => {
  it("requests only privacy-safe data and never stores buyer data, even when Amazon sends it", async () => {
    await runJob((await initial())._id);
    for (const call of amazon.calls("GET /orders/2026-01-01/orders")) {
      expect(call.query.get("includedData")).toBe("PROCEEDS,FULFILLMENT,CANCELLATION");
      expect(call.query.get("marketplaceIds")).toBe(MP);
    }
    const order = await AmazonOrder.findOne({ orderId: "250-1234567-8901234" }).lean();
    expect(order).toMatchObject({ status: "SHIPPED", marketplaceId: MP });
    expect(order.items[0]).toMatchObject({ asin: "B08C1W5N87", sellerSku: "ECHO-DOT-4-JP-CHARCOAL", quantityOrdered: 1, unitPrice: { amount: 5980, currency: "JPY" } });
    const everything = JSON.stringify([await AmazonOrder.find().lean(), await AmazonFinancialEvent.find().lean()]);
    for (const pii of PII) expect(everything).not.toContain(pii);
    for (const key of ["buyer", "recipient", "deliveryAddress", "serialNumbers", "packages", "AccountTail", "TraceId", "contexts"]) expect(everything).not.toContain(`"${key}"`);
    const api = await (await ordersRoute(req("GET", "/api/amazon/orders", seller.cookie))).text();
    for (const pii of PII) expect(api).not.toContain(pii);
  });

  it("incremental sync continues from Amazon's lastUpdatedBefore and updates orders without duplicates", async () => {
    await runJob((await initial())._id);
    const first = amazon.calls("GET /orders/2026-01-01/orders")[0].query.get("lastUpdatedAfter");
    expect(new Date(first).getTime()).toBeLessThan(Date.now() - 29 * 86400000);

    amazon.on("GET /orders/2026-01-01/orders", () => ({ orders: [usOrder({ fulfillment: { ...EX.searchOrders.orders[0].fulfillment, fulfillmentStatus: "CANCELLED" } })], lastUpdatedBefore: "2026-11-16T12:00:00Z" }));
    await runJob((await enqueueSync(account, "incremental", ["orders"])).job._id);
    expect(amazon.calls("GET /orders/2026-01-01/orders").at(-1).query.get("lastUpdatedAfter")).toBe("2026-11-15T12:00:00.000Z");
    expect(await AmazonOrder.countDocuments({ orderId: "250-1234567-8901234" })).toBe(1);
    expect((await AmazonOrder.findOne({ orderId: "250-1234567-8901234" }).lean()).status).toBe("CANCELLED");
    expect((await AmazonSyncCheckpoint.findOne({ resource: "orders" }).lean()).watermark.toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });
});

describe("finances", () => {
  it("stores transactions and settlement groups idempotently with allowlisted fields", async () => {
    await runJob((await initial())._id);
    await runJob((await enqueueSync(account, "incremental", ["transactions", "eventGroups"])).job._id);
    expect(await AmazonFinancialEvent.countDocuments({ kind: "transaction" })).toBe(1);
    expect(await AmazonFinancialEvent.countDocuments({ kind: "event_group" })).toBe(1);
    const txn = await AmazonFinancialEvent.findOne({ kind: "transaction" }).lean();
    expect(txn).toMatchObject({ transactionType: "Shipment", orderId: "8129762527551", total: { amount: 10, currency: "USD" } });
    expect(txn.eventId).toMatch(/^derived:[0-9a-f]{40}$/); // the official example has no transactionId
    const group = await AmazonFinancialEvent.findOne({ kind: "event_group" }).lean();
    expect(group).toMatchObject({ eventId: "1", processingStatus: "PROCESSED", fundTransferStatus: "TRANSFERED", originalTotal: { amount: 10.34, currency: "USD" } });
    const fin = await (await financesRoute(req("GET", "/api/amazon/finances", seller.cookie))).json();
    expect(fin.totals).toEqual([{ currency: "USD", type: "Shipment", amount: 10, count: 1 }]);
    expect(fin.netProfit).toBeNull();
    expect(fin.netProfitNote).toMatch(/not calculated/);
  });

  it("a failing finances call fails only that resource: the job is partial, not completed", async () => {
    amazon.on("GET /finances/2024-06-19/transactions", () => json({ errors: [{ code: "Unauthorized", message: "Access to requested resource is denied." }] }, 403));
    const job = await initial();
    expect((await runJob(job._id)).status).toBe("partial");
    const done = await AmazonSyncJob.findById(job._id).lean();
    expect(done.resources.find((r) => r.name === "transactions")).toMatchObject({ status: "failed", error: "Unauthorized" });
    expect(done.resources.filter((r) => r.status === "completed")).toHaveLength(5);
    expect((await AmazonAccount.findById(account._id).lean()).lastSuccessfulSyncAt).toBeUndefined();
  });
});

describe("durability", () => {
  it("throttling pauses the sync with a checkpoint; the next run resumes from the saved page token", async () => {
    let throttle = true;
    amazon.on("GET /orders/2026-01-01/orders", (r) => {
      if (r.query.get("paginationToken") && throttle) return json({ errors: [{ code: "QuotaExceeded" }] }, 429);
      return r.query.get("paginationToken")
        ? { orders: [usOrder({ orderId: "111-0000000-0000002" })], lastUpdatedBefore: "2026-11-15T12:00:00Z" }
        : { orders: [usOrder()], pagination: { nextToken: "orders-page-2" }, lastUpdatedBefore: "2026-11-15T12:00:00Z" };
    });
    const job = await initial();
    expect(await runJob(job._id)).toMatchObject({ status: "queued", resumable: true });
    const paused = await AmazonSyncJob.findById(job._id).lean();
    expect(paused).toMatchObject({ active: true, status: "queued" });
    expect(paused.resources.find((r) => r.name === "orders")).toMatchObject({ status: "pending", error: "throttled_will_retry" });
    const cp = await AmazonSyncCheckpoint.findOne({ resource: "orders" }).lean();
    expect(cp.cursor).toBe("orders-page-2");
    expect(await AmazonOrder.countDocuments()).toBe(1);

    throttle = false;
    const firstWindow = amazon.calls("GET /orders/2026-01-01/orders")[0].query.get("lastUpdatedAfter");
    expect((await runJob(job._id)).status).toBe("completed");
    const resumed = amazon.calls("GET /orders/2026-01-01/orders").at(-1);
    expect(resumed.query.get("paginationToken")).toBe("orders-page-2");
    expect(resumed.query.get("lastUpdatedAfter")).toBe(firstWindow);
    expect(await AmazonOrder.countDocuments()).toBe(2);
  });

  it("prevents duplicate jobs and concurrent runs of the same job", async () => {
    const a = await enqueueSync(account, "manual");
    const b = await enqueueSync(account, "manual");
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(String(b.job._id)).toBe(String(a.job._id));
    expect(await AmazonSyncJob.countDocuments({ active: true })).toBe(1);

    let release;
    const gate = new Promise((r) => (release = r));
    amazon.on("GET /sellers/v1/marketplaceParticipations", async () => {
      await gate;
      return SANDBOX_EX.getMarketplaceParticipations.response;
    });
    const first = runJob(a.job._id);
    await vi.waitFor(async () => expect((await AmazonSyncJob.findById(a.job._id).lean()).status).toBe("running"));
    expect(await runJob(a.job._id)).toMatchObject({ ran: false, reason: "locked_or_finished" });
    release();
    expect((await first).status).toBe("completed");
  });

  it("an account disconnected during the sync stops it and leaves no records behind", async () => {
    amazon.on("GET /orders/2026-01-01/orders", async () => {
      await disconnectAmazonAccount(seller.user._id, account._id);
      return { orders: [usOrder()], lastUpdatedBefore: "2026-11-15T12:00:00Z" };
    });
    const job = await initial();
    expect(await runJob(job._id)).toMatchObject({ status: "cancelled" });
    expect(await counts()).toEqual({ listings: 0, fba: 0, orders: 0, financial: 0 });
    expect(await AmazonSyncCheckpoint.countDocuments()).toBe(0);
    expect(await AmazonAccount.countDocuments()).toBe(0);
  });

  it("invalid_grant marks the account reconnect_required, stops syncing, notifies, and keeps history", async () => {
    await runJob((await initial())._id);
    const before = await counts();
    clearLwaCache();
    amazon.lwa.refresh_token = () => json({ error: "invalid_grant", error_description: "The refresh token is invalid" }, 400);
    const job = (await enqueueSync(account, "incremental")).job;
    expect(await runJob(job._id)).toMatchObject({ status: "cancelled", reason: "reconnect_required" });
    expect(await AmazonAccount.findById(account._id).lean()).toMatchObject({ status: "reconnect_required" });
    expect(await AmazonSyncJob.findById(job._id).lean()).toMatchObject({ active: false });
    expect(await Notification.countDocuments({ user: seller.user._id, title: "Reconnect Amazon" })).toBe(1);
    expect(await counts()).toEqual(before);
    // No new sync is scheduled or run for it.
    expect((await enqueueSync(account, "manual")).created).toBe(true);
    const refused = await (await syncRoute.POST(req("POST", "/api/amazon/sync", seller.cookie, { accountId: String(account._id) }))).json();
    expect(refused.code).toBe("reconnect_required");
  });
});

describe("cron worker and sync routes", () => {
  it("the cron endpoint requires CRON_SECRET, then schedules and runs incremental syncs", async () => {
    expect((await cron(req("GET", "/api/amazon/sync/process"))).status).toBe(401);
    expect((await cron(req("GET", "/api/amazon/sync/process", null, undefined, { authorization: "Bearer wrong" }))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await cron(req("GET", "/api/amazon/sync/process", null, undefined, { authorization: "Bearer cron-test-secret" }))).status).toBe(503);
    process.env.CRON_SECRET = "cron-test-secret";
    const res = await cron(req("GET", "/api/amazon/sync/process", null, undefined, { authorization: "Bearer cron-test-secret" }));
    expect(await res.json()).toMatchObject({ success: true, scheduled: 1, processed: 1 });
    expect(await counts()).toEqual({ listings: 2, fba: 2, orders: 2, financial: 2 });
  });

  it("manual sync and status are per seller: 401 without a session, 404 for another seller's account", async () => {
    expect((await syncRoute.POST(req("POST", "/api/amazon/sync", null, {}))).status).toBe(401);
    expect((await syncRoute.GET(req("GET", "/api/amazon/sync"))).status).toBe(401);
    const other = await createUser();
    expect((await syncRoute.POST(req("POST", "/api/amazon/sync", sessionCookieFor(other), { accountId: String(account._id) }))).status).toBe(404);
    expect(amazon.requests).toHaveLength(0);

    const res = await syncRoute.POST(req("POST", "/api/amazon/sync", seller.cookie, { accountId: String(account._id), resources: ["listings"] }));
    expect(res.status).toBe(202);
    expect((await res.json()).job).toMatchObject({ kind: "manual", status: "completed", resources: [{ name: "listings", status: "completed", count: 2 }] });
    const status = await (await syncRoute.GET(req("GET", `/api/amazon/sync?accountId=${account._id}`, seller.cookie))).json();
    expect(status.history[0]).toMatchObject({ kind: "manual", status: "completed" });
  });
});

describe("disconnect", () => {
  it("deletes every Amazon record of that account only, invalidates jobs, and keeps other sellers and marketplaces", async () => {
    await runJob((await initial())._id);
    await enqueueSync(account, "manual"); // pending job
    const other = await createUser();
    const otherAccount = await linkAmazonAccount({ userId: other._id, environment: "production", sellingPartnerId: "A2OTHERSELLER", marketplaceIds: [MP], refreshToken: "Atzr|other" });
    await AmazonOrder.create({ user: other._id, amazonAccount: otherAccount._id, environment: "production", orderId: "999-OTHER" });
    const store = await linkStore({ userId: seller.user._id, shop: `s${Date.now()}.myshopify.com`, accessToken: "t", scope: "" });
    await Product.create({ user: seller.user._id, shopifyStore: store._id, shopifyProductId: "1", title: "Shopify mug" });
    await EbayAccount.create({ user: seller.user._id, environment: "sandbox", ebayUserId: "E1", marketplaceId: "EBAY_US" });

    expect((await disconnectRoute(req("DELETE", `/api/amazon/accounts/${account._id}`), { params: Promise.resolve({ id: String(account._id) }) })).status).toBe(401);
    expect((await disconnectRoute(req("DELETE", `/api/amazon/accounts/${account._id}`, sessionCookieFor(other)), { params: Promise.resolve({ id: String(account._id) }) })).status).toBe(404);

    const res = await disconnectRoute(req("DELETE", `/api/amazon/accounts/${account._id}`, seller.cookie), { params: Promise.resolve({ id: String(account._id) }) });
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toMatchObject({ accounts: 1, listings: 2, orders: 2, inventory: 2, financialEvents: 2, syncJobs: 2 });
    const scoped = { amazonAccount: account._id };
    for (const Model of [AmazonListing, AmazonInventory, AmazonOrder, AmazonFinancialEvent, AmazonSyncJob, AmazonSyncCheckpoint]) expect(await Model.countDocuments(scoped)).toBe(0);
    expect(await AmazonOrder.countDocuments({ amazonAccount: otherAccount._id })).toBe(1);
    expect(await AmazonAccount.exists({ _id: otherAccount._id })).not.toBeNull();
    expect(await Product.countDocuments({ user: seller.user._id })).toBe(1);
    expect(await EbayAccount.countDocuments({ user: seller.user._id })).toBe(1);
  });
});
