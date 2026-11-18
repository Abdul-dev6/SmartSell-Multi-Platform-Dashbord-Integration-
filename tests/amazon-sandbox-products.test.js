import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import { LWA_TOKEN_URL } from "@/lib/amazon/config";
import { clearLwaCache } from "@/lib/amazon/lwa";
import { linkAmazonAccount } from "@/lib/amazon/accounts";
import { GET as inventory } from "@/app/api/inventory/route";
import { POST as importListing } from "@/app/api/amazon/sandbox/listings/route";
import { DELETE as disconnect } from "@/app/api/amazon/accounts/[id]/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

// Amazon Sandbox sample listings in the Products section: imported from the
// (faked) static sandbox with Amazon's official example, shown as labelled,
// read-only sample rows, only for their owner, never in a production build.

const EXAMPLES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/static-sandbox-examples.json"), "utf8"));
const SANDBOX = "https://sandbox.sellingpartnerapi-na.amazon.com";
const BASE = "http://localhost:3000";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const get = (p, cookie) => new NextRequest(`${BASE}${p}`, { headers: cookie ? { cookie } : {} });
const post = (p, cookie, body) =>
  new NextRequest(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body ?? {}) });

let api;
let listingAnswer;
beforeEach(async () => {
  await resetDatabase();
  await Promise.all([AmazonAccount.init(), AmazonListing.init()]);
  clearLwaCache();
  process.env.AMAZON_SANDBOX_CLIENT_ID = "amzn1.application-oa2-client.products";
  process.env.AMAZON_SANDBOX_CLIENT_SECRET = "products-client-secret";
  api = [];
  listingAnswer = () => json(EXAMPLES.getListingsItem.response);
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (String(url) === LWA_TOKEN_URL) return json({ access_token: "Atza|products-access", expires_in: 3600 });
    const u = new URL(url);
    api.push(u);
    if (u.origin !== SANDBOX) throw new Error(`unexpected host ${u.origin}`);
    if (u.pathname.startsWith("/listings/2021-08-01/items/")) return listingAnswer();
    return json({ errors: [{ code: "NotFound" }] }, 404);
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete process.env.AMAZON_SANDBOX_CLIENT_ID;
  delete process.env.AMAZON_SANDBOX_CLIENT_SECRET;
});

async function sellerWithSandbox(sellingPartnerId = "A1SANDBOX") {
  const user = await createUser();
  const account = await linkAmazonAccount({ userId: user._id, environment: "sandbox", sellingPartnerId, marketplaceIds: ["ATVPDKIKX0DER"], refreshToken: "Atzr|products-refresh" });
  return { user, account, cookie: sessionCookieFor(user) };
}
const products = async (cookie, query = "?include=amazonSandbox") => (await inventory(get(`/api/inventory${query}`, cookie))).json();

describe("importing the sandbox sample listing", () => {
  it("requires a session, is off in a production build, and needs a connected sandbox account", async () => {
    expect((await importListing(post("/api/amazon/sandbox/listings"))).status).toBe(401);
    const { cookie } = await sellerWithSandbox();
    vi.stubEnv("NODE_ENV", "production");
    expect((await importListing(post("/api/amazon/sandbox/listings", cookie))).status).toBe(404);
    vi.unstubAllEnvs();
    const lonely = await createUser();
    const res = await importListing(post("/api/amazon/sandbox/listings", sessionCookieFor(lonely)));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("not_connected");
    expect(api).toHaveLength(0);
  });

  it("imports Amazon's sample listing for the user's own account, without duplicates or secrets", async () => {
    const { user, account, cookie } = await sellerWithSandbox();
    const res = await importListing(post("/api/amazon/sandbox/listings", cookie, { accountId: String(account._id) }));
    expect(res.status).toBe(201);
    const text = await res.text();
    for (const secret of ["Atza|", "Atzr|", "products-client-secret", "refreshTokenEnc"]) expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toMatchObject({ sampleData: true, product: { marketplace: "amazon", sample: true, sku: "GM-ZDPI-9B4E", asin: "B071VG5N9D", local_id: null } });
    expect(api[0].pathname).toBe("/listings/2021-08-01/items/A1SANDBOX/GM-ZDPI-9B4E");

    await importListing(post("/api/amazon/sandbox/listings", cookie));
    expect(await AmazonListing.countDocuments({ user: user._id })).toBe(1);
    expect(await AmazonListing.findOne({ user: user._id }).lean()).toMatchObject({ environment: "sandbox", amazonAccount: account._id });
  });

  it("cannot import into another user's account", async () => {
    const a = await sellerWithSandbox("A1OWNER");
    const b = await createUser();
    const res = await importListing(post("/api/amazon/sandbox/listings", sessionCookieFor(b), { accountId: String(a.account._id) }));
    expect(res.status).toBe(409);
    expect(await AmazonListing.countDocuments()).toBe(0);
    expect(api).toHaveLength(0);
  });

  it("an Amazon failure is a 502 with a safe message and stores nothing", async () => {
    const { cookie } = await sellerWithSandbox();
    listingAnswer = () => json({ errors: [{ code: "InternalFailure", message: "internal detail" }] }, 500);
    const res = await importListing(post("/api/amazon/sandbox/listings", cookie));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, code: "InternalFailure" });
    expect(body.message).not.toContain("internal detail");
    expect(await AmazonListing.countDocuments()).toBe(0);
  });

  it("rejects an invalid SKU before calling Amazon", async () => {
    const { cookie } = await sellerWithSandbox();
    expect((await importListing(post("/api/amazon/sandbox/listings", cookie, { sku: "../x" }))).status).toBe(400);
    expect(api).toHaveLength(0);
  });

  it("leaves no listing behind if the account is disconnected during the import", async () => {
    const { user, cookie } = await sellerWithSandbox();
    vi.spyOn(AmazonAccount, "exists").mockResolvedValueOnce(null);
    const res = await importListing(post("/api/amazon/sandbox/listings", cookie));
    expect(res.status).toBe(409);
    expect(await AmazonListing.countDocuments({ user: user._id })).toBe(0);
  });
});

describe("sample rows in the Products data", () => {
  it("are included only when the Products page asks, labelled and read-only", async () => {
    const { cookie } = await sellerWithSandbox();
    await importListing(post("/api/amazon/sandbox/listings", cookie));

    const body = await products(cookie);
    const rows = body.data.filter((r) => r.marketplace === "amazon");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      platform: "Amazon (Sandbox)",
      sample: true,
      environment: "sandbox",
      local_id: null,
      title: "Hardside Carry-On Spinner Suitcase Luggage",
      sku: "GM-ZDPI-9B4E",
      asin: "B071VG5N9D",
      status: "active",
      listing_status: "BUYABLE",
      price: null,
      available: null,
    });
    expect(body.amazonSandbox).toMatchObject({ connected: true, listings: 1 });

    // The Inventory page (no include) is unchanged.
    const inv = await products(cookie, "");
    expect(inv.data.some((r) => r.marketplace === "amazon")).toBe(false);
    expect(inv).not.toHaveProperty("amazonSandbox");
    // Narrowed views never include them either.
    expect((await products(cookie, "?include=amazonSandbox&marketplace=shopify")).data).toHaveLength(0);
  });

  it("show only the user's own sample listings", async () => {
    const a = await sellerWithSandbox("A1OWNER");
    const b = await sellerWithSandbox("B1OTHER");
    await importListing(post("/api/amazon/sandbox/listings", a.cookie));
    const bBody = await products(b.cookie);
    expect(bBody.data.filter((r) => r.marketplace === "amazon")).toHaveLength(0);
    expect(JSON.stringify(bBody)).not.toContain(String(a.account._id));
    expect(JSON.stringify(bBody)).not.toContain("A1OWNER");
  });

  it("never appear in a production build, even with the include flag", async () => {
    const { cookie } = await sellerWithSandbox();
    await importListing(post("/api/amazon/sandbox/listings", cookie));
    vi.stubEnv("NODE_ENV", "production");
    const body = await products(cookie);
    expect(body.data.some((r) => r.marketplace === "amazon")).toBe(false);
    expect(body).not.toHaveProperty("amazonSandbox");
  });

  it("disappear when the sandbox account is disconnected", async () => {
    const { account, cookie } = await sellerWithSandbox();
    await importListing(post("/api/amazon/sandbox/listings", cookie));
    const res = await disconnect(new NextRequest(`${BASE}/api/amazon/accounts/${account._id}`, { method: "DELETE", headers: { cookie } }), { params: Promise.resolve({ id: String(account._id) }) });
    expect(res.status).toBe(200);
    expect((await products(cookie)).data.some((r) => r.marketplace === "amazon")).toBe(false);
  });
});
