import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import { LWA_TOKEN_URL } from "@/lib/amazon/config";
import { clearLwaCache } from "@/lib/amazon/lwa";
import { linkAmazonAccount } from "@/lib/amazon/accounts";
import { redactBuyerFields } from "@/lib/amazon/redact";
import { GET, POST } from "@/app/api/amazon/sandbox/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

// Amazon Sandbox Data Viewer API. The SP-API sandbox and LWA are faked with
// Amazon's official static-sandbox responses; nothing reaches the network.

const EXAMPLES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/static-sandbox-examples.json"), "utf8"));
const SANDBOX = "https://sandbox.sellingpartnerapi-na.amazon.com";
const BASE = "http://localhost:3000";
const APP = { id: "amzn1.application-oa2-client.viewer", secret: "viewer-client-secret", refresh: "Atzr|developer-sandbox-refresh" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const req = (method, p, cookie) => new NextRequest(`${BASE}${p}`, { method, headers: cookie ? { cookie } : {} });

let calls;
let answers;
function stubAmazon() {
  calls = { lwa: [], api: [] };
  answers = {
    lwa: () => json({ access_token: "Atza|viewer-access-token", expires_in: 3600 }),
    participations: () => json(EXAMPLES.getMarketplaceParticipations.response),
    listing: () => json(EXAMPLES.getListingsItem.response),
  };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const u = new URL(url);
    if (String(url) === LWA_TOKEN_URL) {
      calls.lwa.push(new URLSearchParams(init.body.toString()));
      return answers.lwa();
    }
    calls.api.push({ url: u, headers: init.headers });
    if (u.origin !== SANDBOX) throw new Error(`unexpected host ${u.origin}`);
    if (u.pathname === "/sellers/v1/marketplaceParticipations") return answers.participations();
    if (u.pathname.startsWith("/listings/2021-08-01/items/")) return answers.listing();
    return json({ errors: [{ code: "NotFound" }] }, 404);
  }));
}

let logs;
beforeEach(async () => {
  await resetDatabase();
  await Promise.all([AmazonAccount.init(), AmazonListing.init()]);
  clearLwaCache();
  process.env.AMAZON_SANDBOX_CLIENT_ID = APP.id;
  process.env.AMAZON_SANDBOX_CLIENT_SECRET = APP.secret;
  process.env.AMAZON_SANDBOX_REFRESH_TOKEN = APP.refresh;
  stubAmazon();
  logs = [];
  for (const level of ["error", "warn", "info"]) vi.spyOn(console, level).mockImplementation((...a) => logs.push(a.join(" ")));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const k of ["AMAZON_SANDBOX_CLIENT_ID", "AMAZON_SANDBOX_CLIENT_SECRET", "AMAZON_SANDBOX_REFRESH_TOKEN", "AMAZON_SANDBOX_VIEWER"]) delete process.env[k];
});

const SECRETS = [APP.secret, APP.refresh, "Atza|", "Atzr|", "refreshTokenEnc", "v1:"];
const expectNoSecrets = (text) => SECRETS.forEach((s) => expect(text).not.toContain(s));

describe("authentication and availability", () => {
  it("requires a session for viewing and connecting", async () => {
    expect((await GET(req("GET", "/api/amazon/sandbox"))).status).toBe(401);
    expect((await POST(req("POST", "/api/amazon/sandbox"))).status).toBe(401);
    expect(calls.api).toHaveLength(0);
  });

  it("is off (404) in a production build unless AMAZON_SANDBOX_VIEWER=true", async () => {
    const user = await createUser();
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)))).status).toBe(404);
    expect((await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(user)))).status).toBe(404);
    process.env.AMAZON_SANDBOX_VIEWER = "true";
    expect((await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)))).status).toBe(200);
  });

  it("is off when AMAZON_ENVIRONMENT is anything but sandbox", async () => {
    const user = await createUser();
    vi.stubEnv("AMAZON_ENVIRONMENT", "production");
    expect((await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)))).status).toBe(404);
    expect(calls.api).toHaveLength(0);
  });
});

describe("connect and view", () => {
  it("with no account: empty state, no Amazon calls", async () => {
    const user = await createUser();
    const res = await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(await res.json()).toEqual({ success: true, environment: "sandbox", sampleData: true, connected: false });
    expect(calls.api).toHaveLength(0);
    expect(calls.lwa).toHaveLength(0);
  });

  it("connect links an encrypted sandbox account to the user and returns no secrets", async () => {
    const user = await createUser();
    const res = await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(res.status).toBe(201);
    const text = await res.text();
    expectNoSecrets(text);
    expect(JSON.parse(text).account).toMatchObject({ environment: "sandbox", environmentLabel: "Sandbox", sellingPartnerId: "SANDBOX_SELLER" });
    const stored = await AmazonAccount.findOne({ user: user._id }).select("+refreshTokenEnc").lean();
    expect(stored.refreshTokenEnc).toMatch(/^v1:/);
    expect(stored.refreshTokenEnc).not.toContain("developer-sandbox-refresh");
  });

  it("shows the live sandbox responses, mapped and labelled as sample data, using the user's own account", async () => {
    const user = await createUser();
    await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(user)));
    const res = await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(res.status).toBe(200);
    const text = await res.text();
    expectNoSecrets(text);
    const body = JSON.parse(text);

    expect(body).toMatchObject({ success: true, connected: true, environment: "sandbox", sampleData: true, request: { sku: "GM-ZDPI-9B4E", marketplaceId: "ATVPDKIKX0DER" } });
    expect(body.participations.data).toEqual([
      { marketplaceId: "ATVPDKIKX0DER", countryCode: "US", name: "Amazon.com", defaultCurrencyCode: "USD", isParticipating: true, hasSuspendedListings: false },
    ]);
    expect(body.listing.data).toMatchObject({ sku: "GM-ZDPI-9B4E", asin: "B071VG5N9D", statuses: ["BUYABLE"], itemName: "Hardside Carry-On Spinner Suitcase Luggage" });
    // The raw view is Amazon's actual response.
    expect(body.participations.raw).toEqual(EXAMPLES.getMarketplaceParticipations.response);
    expect(body.listing.raw).toEqual(EXAMPLES.getListingsItem.response);

    // Called the sandbox host with the token issued for the account's own refresh token.
    expect(calls.lwa.at(-1).get("refresh_token")).toBe(APP.refresh);
    expect(calls.api.map((c) => c.url.origin)).toEqual([SANDBOX, SANDBOX]);
    expect(calls.api.every((c) => c.headers["User-Agent"] === "SmartSell/1.0")).toBe(true);
    // Viewing stores nothing.
    expect(await AmazonListing.countDocuments()).toBe(0);
  });

  it("each refresh fetches fresh responses from Amazon", async () => {
    const user = await createUser();
    await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(user)));
    await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)));
    await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(calls.api).toHaveLength(4);
  });

  it("rejects an invalid SKU before calling Amazon", async () => {
    const user = await createUser();
    await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect((await GET(req("GET", "/api/amazon/sandbox?sku=../../x", sessionCookieFor(user)))).status).toBe(400);
    expect(calls.api).toHaveLength(0);
  });
});

describe("ownership isolation", () => {
  it("another user never sees or uses someone else's sandbox account", async () => {
    const a = await createUser();
    const b = await createUser();
    await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(a)));
    const aAccount = await AmazonAccount.findOne({ user: a._id }).lean();

    const res = await GET(req("GET", `/api/amazon/sandbox?accountId=${aAccount._id}`, sessionCookieFor(b)));
    expect(await res.json()).toMatchObject({ connected: false });
    expect(calls.api).toHaveLength(0);

    // The sandbox seller ID can belong to one SmartSell user only.
    const taken = await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(b)));
    expect(taken.status).toBe(409);
    expect(await AmazonAccount.countDocuments({ user: b._id })).toBe(0);
  });

  it("uses the requested account only when it belongs to the user", async () => {
    const a = await createUser();
    await linkAmazonAccount({ userId: a._id, environment: "sandbox", sellingPartnerId: "A1FIRST", marketplaceIds: ["ATVPDKIKX0DER"], refreshToken: "Atzr|first" });
    const second = await linkAmazonAccount({ userId: a._id, environment: "sandbox", sellingPartnerId: "A2SECOND", marketplaceIds: ["ATVPDKIKX0DER"], refreshToken: "Atzr|second" });
    const body = await (await GET(req("GET", `/api/amazon/sandbox?accountId=${second._id}`, sessionCookieFor(a)))).json();
    expect(body.account.sellingPartnerId).toBe("A2SECOND");
    expect(calls.api.find((c) => c.url.pathname.startsWith("/listings/")).url.pathname).toContain("/A2SECOND/");
    expect(calls.lwa.at(-1).get("refresh_token")).toBe("Atzr|second");
  });
});

describe("Amazon failures", () => {
  async function connected() {
    const user = await createUser();
    await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(user)));
    return user;
  }

  it("one failing call shows that section's error and keeps the other", async () => {
    const user = await connected();
    answers.listing = () => json({ errors: [{ code: "InternalFailure", message: "boom" }] }, 500);
    const body = await (await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)))).json();
    expect(body.participations.ok).toBe(true);
    expect(body.listing).toMatchObject({ ok: false, data: null, raw: null, error: { code: "InternalFailure", status: 500 } });
    expect(body.listing.error.message).not.toContain("boom");
  });

  it("both calls failing is a 502 with a safe message", async () => {
    const user = await connected();
    answers.listing = () => json({ errors: [{ code: "QuotaExceeded" }] }, 403);
    answers.participations = () => json({ errors: [{ code: "QuotaExceeded" }] }, 403);
    const res = await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ success: false, code: "amazon_sandbox_unavailable" });
  });

  it("an LWA failure is reported without secrets, in the response or the logs", async () => {
    const user = await connected();
    answers.lwa = () => json({ error: "invalid_client", error_description: `bad secret ${APP.secret}` }, 401);
    const res = await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("invalid_client");
    expectNoSecrets(text);
    expectNoSecrets(logs.join("\n"));
    expect(logs.join("\n")).not.toContain("bad secret");
  });

  it("missing sandbox credentials: connect answers 503 naming the missing variable", async () => {
    delete process.env.AMAZON_SANDBOX_REFRESH_TOKEN;
    const user = await createUser();
    const res = await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(res.status).toBe(503);
    expect((await res.json()).message).toContain("AMAZON_SANDBOX_REFRESH_TOKEN");
    expect(await AmazonAccount.countDocuments()).toBe(0);
  });

  it("missing TOKEN_ENCRYPTION_KEY: connect and view say so instead of a generic error", async () => {
    const user = await connected();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    const view = await GET(req("GET", "/api/amazon/sandbox", sessionCookieFor(user)));
    expect(view.status).toBe(503);
    expect((await view.json()).code).toBe("encryption_not_configured");
    const other = await createUser();
    const res = await POST(req("POST", "/api/amazon/sandbox", sessionCookieFor(other)));
    expect(res.status).toBe(503);
    expect((await res.json()).message).toContain("TOKEN_ENCRYPTION_KEY");
    expect(calls.api).toHaveLength(0);
  });
});

describe("raw JSON redaction", () => {
  it("removes buyer-like fields at any depth and keeps listing data", () => {
    const raw = {
      sku: "X",
      summaries: [{ itemName: "Mug", BuyerInfo: { BuyerEmail: "b@example.com" } }],
      shippingAddress: { line: "1 Main St" },
      nested: { deeper: [{ buyerPhone: "555", ok: 1 }] },
    };
    expect(redactBuyerFields(raw)).toEqual({ sku: "X", summaries: [{ itemName: "Mug" }], nested: { deeper: [{ ok: 1 }] } });
  });
});
