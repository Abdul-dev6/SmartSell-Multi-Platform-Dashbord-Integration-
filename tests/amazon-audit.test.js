import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import AmazonOrder from "@/models/AmazonOrder";
import AmazonSyncJob from "@/models/AmazonSyncJob";
import AmazonSyncCheckpoint from "@/models/AmazonSyncCheckpoint";
import { clearLwaCache, getAccessToken } from "@/lib/amazon/lwa";
import { clientDefaults } from "@/lib/amazon/client";
import { disconnectAmazonAccount, getAmazonAccountForUser, linkAmazonAccount } from "@/lib/amazon/accounts";
import { enqueueSync, MAX_JOB_RUNS, processDueJobs, runJob } from "@/lib/amazon/sync";
import * as syncRoute from "@/app/api/amazon/sync/route";
import * as listingItem from "@/app/api/amazon/listings/[id]/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { clearAmazonEnv, installFakeAmazon, json, productionEnv } from "./helpers/fakeAmazon";

// Regression tests for the production-readiness audit fixes.

const EX = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/production-api-examples.json"), "utf8"));
const SANDBOX_EX = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/static-sandbox-examples.json"), "utf8"));
const MP = "ATVPDKIKX0DER";
const req = (method, p, cookie, body) =>
  new NextRequest(`http://localhost:3000${p}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const usOrder = (over = {}) => ({ ...EX.searchOrders.orders[0], salesChannel: { ...EX.searchOrders.orders[0].salesChannel, marketplaceId: MP }, ...over });

let amazon;
let seller;
let account;
const link = (user, id, token = "Atzr|t") =>
  linkAmazonAccount({ userId: user._id, environment: "production", sellingPartnerId: id, marketplaces: [{ id: MP, name: "Amazon.com", countryCode: "US", currency: "USD", isParticipating: true }], refreshToken: token });

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([AmazonAccount.init(), AmazonListing.init(), AmazonOrder.init(), AmazonSyncJob.init(), AmazonSyncCheckpoint.init()]);
  clearLwaCache();
  clientDefaults.sleep = async () => {};
  productionEnv();
  amazon = installFakeAmazon();
  amazon
    .on("GET /sellers/v1/marketplaceParticipations", () => SANDBOX_EX.getMarketplaceParticipations.response)
    .on("GET /listings/2021-08-01/items/:seller", () => ({ numberOfResults: 1, items: [{ ...EX.searchListingsItems.items[0], sku: "SKU-A" }] }))
    .on("GET /fba/inventory/v1/summaries", () => ({ payload: { inventorySummaries: [] } }))
    .on("GET /orders/2026-01-01/orders", () => ({ orders: [usOrder()], lastUpdatedBefore: "2026-11-15T12:00:00Z" }))
    .on("GET /finances/2024-06-19/transactions", () => ({ payload: { transactions: [] } }))
    .on("GET /finances/v0/financialEventGroups", () => ({ payload: { FinancialEventGroupList: [] } }));
  for (const level of ["error", "warn", "info"]) vi.spyOn(console, level).mockImplementation(() => {});
  const user = await createUser();
  seller = { user, cookie: sessionCookieFor(user) };
  account = await link(user, "A1SELLERPROD");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAmazonEnv();
});

describe("sync reliability", () => {
  it("an account whose token cannot be decrypted fails its own job, is unlocked, and does not stop other accounts", async () => {
    await AmazonAccount.updateOne({ _id: account._id }, { $set: { refreshTokenEnc: "v1:broken:token:value" } });
    const other = await createUser();
    const healthy = await link(other, "A2HEALTHY");
    const broken = (await enqueueSync(account, "initial")).job;
    const good = (await enqueueSync(healthy, "initial")).job;

    const summary = await processDueJobs();
    expect(summary.processed).toBe(2);
    expect(await AmazonSyncJob.findById(broken._id).lean()).toMatchObject({ status: "failed", active: false });
    expect((await AmazonSyncJob.findById(broken._id).lean()).lockedUntil).toBeUndefined();
    expect(await AmazonSyncJob.findById(good._id).lean()).toMatchObject({ status: "completed" });
    // A new sync can be queued for the failed account.
    expect((await enqueueSync(account, "manual")).created).toBe(true);
  });

  it("a resource deferred on every run gives up after the run cap instead of blocking the account forever", async () => {
    amazon.on("GET /orders/2026-01-01/orders", () => json({ errors: [{ code: "InternalFailure" }] }, 503));
    const job = (await enqueueSync(account, "initial")).job;
    let last;
    // A temporary 5xx (Amazon's own code InternalFailure) is deferred, not failed…
    expect(await runJob(job._id)).toMatchObject({ status: "queued", resumable: true });
    // …until the run cap.
    for (let i = 1; i <= MAX_JOB_RUNS; i += 1) last = await runJob(job._id);
    expect(last.status).toBe("partial");
    const done = await AmazonSyncJob.findById(job._id).lean();
    expect(done.active).toBe(false);
    expect(done.resources.find((r) => r.name === "orders")).toMatchObject({ status: "failed", error: "gave_up_after_retries" });
    expect(done.resources.find((r) => r.name === "listings").status).toBe("completed");
  });

  it("orders without lastUpdatedBefore continue from two minutes ago, not the old window start", async () => {
    amazon.on("GET /orders/2026-01-01/orders", () => ({ orders: [usOrder()] }));
    await runJob((await enqueueSync(account, "initial", ["orders"])).job._id);
    const watermark = (await AmazonSyncCheckpoint.findOne({ resource: "orders" }).lean()).watermark.getTime();
    expect(watermark).toBeGreaterThan(Date.now() - 3 * 60_000);
    expect(watermark).toBeLessThanOrEqual(Date.now());
  });

  it("a saved page token for a marketplace no longer authorized restarts at the first marketplace", async () => {
    await AmazonSyncCheckpoint.create({ user: seller.user._id, amazonAccount: account._id, resource: "listings", cursor: JSON.stringify({ mp: "A2EUQ1WTGCTBG2", t: "stale-token" }), cursorStart: new Date() });
    await runJob((await enqueueSync(account, "manual", ["listings"])).job._id);
    const call = amazon.calls("GET /listings/2021-08-01/items/:seller")[0];
    expect(call.query.get("pageToken")).toBeNull();
    expect(call.query.get("marketplaceIds")).toBe(MP);
  });
});

describe("disconnect races", () => {
  it("records written by a sync after the disconnect deleted everything are removed again", async () => {
    const original = AmazonListing.bulkWrite.bind(AmazonListing);
    vi.spyOn(AmazonListing, "bulkWrite").mockImplementation(async (ops) => {
      await disconnectAmazonAccount(seller.user._id, account._id); // completes first…
      return original(ops); // …then the sync's write lands
    });
    const job = (await enqueueSync(account, "manual", ["listings"])).job;
    expect(await runJob(job._id)).toMatchObject({ status: "cancelled", reason: "account_disconnected" });
    expect(await AmazonListing.countDocuments({ amazonAccount: account._id })).toBe(0);
    expect(await AmazonAccount.exists({ _id: account._id })).toBeNull();
  });

  it("a disconnect that fails part-way leaves the account 'disconnecting' (unusable) and can be repeated", async () => {
    await AmazonOrder.create({ user: seller.user._id, amazonAccount: account._id, environment: "production", orderId: "111-1" });
    const realDeleteMany = AmazonOrder.deleteMany.bind(AmazonOrder);
    vi.spyOn(AmazonOrder, "deleteMany").mockRejectedValueOnce(new Error("db hiccup"));
    await expect(disconnectAmazonAccount(seller.user._id, account._id)).rejects.toThrow("db hiccup");
    expect(await AmazonAccount.findById(account._id).lean()).toMatchObject({ status: "disconnecting" });
    expect(await getAmazonAccountForUser(seller.user._id, { accountId: account._id })).toBeNull();
    AmazonOrder.deleteMany.mockImplementation(realDeleteMany);
    expect(await disconnectAmazonAccount(seller.user._id, account._id)).toMatchObject({ deleted: { accounts: 1, orders: 1 } });
  });
});

describe("environment isolation", () => {
  it("a production account cannot call Amazon while AMAZON_ENVIRONMENT=sandbox", async () => {
    const listing = await AmazonListing.create({ user: seller.user._id, amazonAccount: account._id, environment: "production", marketplaceId: MP, sku: "SKU-P", productType: "LUGGAGE" });
    process.env.AMAZON_ENVIRONMENT = "sandbox";
    const sync = await syncRoute.POST(req("POST", "/api/amazon/sync", seller.cookie, { accountId: String(account._id) }));
    expect(sync.status).toBe(202);
    expect((await sync.json()).job).toMatchObject({ status: "failed", error: "environment_inactive" });
    const refresh = await listingItem.GET(req("GET", `/api/amazon/listings/${listing._id}?refresh=1`, seller.cookie), { params: Promise.resolve({ id: String(listing._id) }) });
    expect(refresh.status).toBe(409);
    expect((await refresh.json()).code).toBe("environment_inactive");
    expect(amazon.requests).toHaveLength(0);
    expect(amazon.lwaCalls).toHaveLength(0);
  });
});

describe("token refresh", () => {
  it("concurrent forced refreshes (after 401s) share one LWA request", async () => {
    const creds = { environment: "production", clientId: "c", clientSecret: "s", refreshToken: "Atzr|r" };
    let calls = 0;
    let release;
    const gate = new Promise((r) => (release = r));
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      await gate;
      return json({ access_token: `Atza|${calls}`, expires_in: 3600 });
    });
    const all = Promise.all([1, 2, 3].map(() => getAccessToken(creds, { fetchImpl, forceRefresh: true })));
    release();
    expect(new Set(await all).size).toBe(1);
    expect(calls).toBe(1);
  });
});

describe("OAuth hardening", () => {
  it("limits how many OAuth states one user can create", async () => {
    const { GET: connect } = await import("@/app/api/amazon/connect/route");
    let last;
    for (let i = 0; i < 31; i += 1) last = await connect(req("GET", "/api/amazon/connect", seller.cookie));
    expect(new URL(last.headers.get("location")).searchParams.get("amazon_error")).toBe("rate_limited");
    const { default: AmazonOAuthState } = await import("@/models/AmazonOAuthState");
    expect(await AmazonOAuthState.countDocuments({ user: seller.user._id })).toBe(30);
  });
});
