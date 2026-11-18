import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonOAuthState from "@/models/AmazonOAuthState";
import AmazonSyncJob from "@/models/AmazonSyncJob";
import Notification from "@/models/Notification";
import { clearLwaCache } from "@/lib/amazon/lwa";
import { createOAuthState } from "@/lib/amazon/oauth";
import { decryptSecret } from "@/lib/security/secrets";
import { GET as connect } from "@/app/api/amazon/connect/route";
import { GET as login } from "@/app/api/amazon/login/route";
import { GET as callback } from "@/app/api/amazon/callback/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { clearAmazonEnv, installFakeAmazon, json, productionEnv } from "./helpers/fakeAmazon";

// Amazon website authorization workflow (connect → Seller Central consent →
// log-in URI → Amazon callback URI → redirect URI), with LWA and SP-API faked.

const SANDBOX_EXAMPLES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/static-sandbox-examples.json"), "utf8"));
const BASE = "https://smartsell.example.com";
const AMAZON_CALLBACK = "https://sellercentral.amazon.com/apps/authorize/confirm/amzn1.sellerapps.app.test-app-id";
const SELLER = "A3FHEXAMPLEYWS";
const get = (p, cookie) => new NextRequest(`${BASE}${p}`, { headers: cookie ? { cookie } : {} });
const loc = (res) => new URL(res.headers.get("location"));

let amazon;
let logs;
beforeEach(async () => {
  await resetDatabase();
  await Promise.all([AmazonAccount.init(), AmazonOAuthState.init(), AmazonSyncJob.init()]);
  clearLwaCache();
  productionEnv();
  amazon = installFakeAmazon();
  amazon.on("GET /sellers/v1/marketplaceParticipations", () => SANDBOX_EXAMPLES.getMarketplaceParticipations.response);
  // LWA rejects a redirect_uri that differs from the registered one.
  const issue = amazon.lwa.authorization_code;
  amazon.lwa.authorization_code = (p) =>
    p.get("redirect_uri") === "https://smartsell.example.com/api/amazon/callback" ? issue(p) : json({ error: "invalid_request", error_description: "redirect_uri mismatch" }, 400);
  logs = [];
  for (const level of ["error", "warn", "info"]) vi.spyOn(console, level).mockImplementation((...a) => logs.push(a.join(" ")));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAmazonEnv();
});

async function signedIn() {
  const user = await createUser();
  return { user, cookie: sessionCookieFor(user) };
}
// Runs the log-in URI step and returns the state Amazon would send back.
async function loginStep(cookie, seller = SELLER) {
  const res = await login(get(`/api/amazon/login?amazon_callback_uri=${encodeURIComponent(AMAZON_CALLBACK)}&amazon_state=amz-state-1&selling_partner_id=${seller}`, cookie));
  return { res, state: res.status === 307 || res.status === 302 ? loc(res).searchParams.get("state") : null };
}
const callbackWith = (cookie, { state, seller = SELLER, code = "good-code" } = {}) =>
  callback(get(`/api/amazon/callback?state=${encodeURIComponent(state || "")}&selling_partner_id=${seller}&spapi_oauth_code=${code}`, cookie));
const amazonError = (res) => loc(res).searchParams.get("amazon_error");

describe("feature flag and configuration", () => {
  it("connect, log-in URI and callback are 404 while AMAZON_CONNECT_ENABLED is not true", async () => {
    productionEnv({ connect: false });
    const { cookie } = await signedIn();
    for (const res of [await connect(get("/api/amazon/connect", cookie)), await login(get("/api/amazon/login", cookie)), await callback(get("/api/amazon/callback", cookie))]) {
      expect(res.status).toBe(404);
      expect(await res.text()).not.toMatch(/amzn1|secret|client/i);
    }
  });

  it("is 404 when the production OAuth settings are incomplete or the redirect URI is not https", async () => {
    const { cookie } = await signedIn();
    delete process.env.AMAZON_APP_ID;
    expect((await connect(get("/api/amazon/connect", cookie))).status).toBe(404);
    productionEnv();
    process.env.AMAZON_REDIRECT_URI = "http://smartsell.example.com/api/amazon/callback";
    expect((await connect(get("/api/amazon/connect", cookie))).status).toBe(404);
    productionEnv();
    process.env.AMAZON_ENVIRONMENT = "sandbox";
    expect((await connect(get("/api/amazon/connect", cookie))).status).toBe(404);
  });
});

describe("connect (consent URL)", () => {
  it("requires a session", async () => {
    const res = await connect(get("/api/amazon/connect"));
    expect(loc(res).pathname).toBe("/Login");
  });

  it("redirects to Seller Central consent with application_id, a fresh state and version=beta, without a Referer", async () => {
    const { user, cookie } = await signedIn();
    const res = await connect(get("/api/amazon/connect", cookie));
    const url = loc(res);
    expect(url.origin + url.pathname).toBe("https://sellercentral.amazon.com/apps/authorize/consent");
    expect(url.searchParams.get("application_id")).toBe("amzn1.sellerapps.app.test-app-id");
    expect(url.searchParams.get("version")).toBe("beta");
    const state = url.searchParams.get("state");
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    // Stored server-side, hashed, bound to the user, ten minutes.
    const stored = await AmazonOAuthState.findOne({ user: user._id }).lean();
    expect(stored).toMatchObject({ purpose: "consent" });
    expect(stored.stateHash).not.toBe(state);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);
  });

  it("omits version=beta when AMAZON_AUTH_BETA is not true", async () => {
    process.env.AMAZON_AUTH_BETA = "false";
    const { cookie } = await signedIn();
    expect(loc(await connect(get("/api/amazon/connect", cookie))).searchParams.has("version")).toBe(false);
  });
});

describe("log-in URI", () => {
  it("sends the signed-in seller back to Amazon with amazon_state, a new state and the exact redirect URI", async () => {
    const { user, cookie } = await signedIn();
    const { res, state } = await loginStep(cookie);
    const url = loc(res);
    expect(url.origin + url.pathname).toBe(AMAZON_CALLBACK);
    expect(url.searchParams.get("amazon_state")).toBe("amz-state-1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://smartsell.example.com/api/amazon/callback");
    expect(url.searchParams.get("version")).toBe("beta");
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await AmazonOAuthState.findOne({ user: user._id, purpose: "callback" }).lean()).toMatchObject({ sellingPartnerId: SELLER });
  });

  it("never redirects to a non-Amazon callback URI (no open redirect)", async () => {
    const { cookie } = await signedIn();
    for (const bad of ["https://evil.example.com/apps/authorize/confirm/x", "http://sellercentral.amazon.com/apps/authorize/confirm/x", "https://amazon.com.evil.io/apps/authorize/confirm/x", "https://sellercentral.amazon.com/other"]) {
      const res = await login(get(`/api/amazon/login?amazon_callback_uri=${encodeURIComponent(bad)}&amazon_state=s&selling_partner_id=${SELLER}`, cookie));
      expect(loc(res).pathname).toBe("/Panel/Ecommerce/Integration");
      expect(amazonError(res)).toBe("invalid_request");
    }
    expect(await AmazonOAuthState.countDocuments()).toBe(0);
  });

  it("asks a signed-out seller to sign in first", async () => {
    const { res } = await loginStep(null);
    expect(loc(res).pathname).toBe("/Login");
    expect(loc(res).searchParams.get("next")).toBe("/Panel/Ecommerce/Integration?amazon_error=sign_in_required");
  });

  it("refuses a seller already linked to another SmartSell user", async () => {
    const other = await createUser();
    await AmazonAccount.create({ user: other._id, environment: "production", sellingPartnerId: SELLER, region: "na", marketplaceIds: ["ATVPDKIKX0DER"] });
    const { cookie } = await signedIn();
    expect(amazonError((await loginStep(cookie)).res)).toBe("linked_elsewhere");
  });
});

describe("callback (redirect URI)", () => {
  it("exchanges the code, verifies marketplaces, saves the encrypted account and queues the initial sync", async () => {
    const { user, cookie } = await signedIn();
    const { state } = await loginStep(cookie);
    const res = await callbackWith(cookie, { state });
    expect(loc(res).pathname).toBe("/Panel/Ecommerce/Integration");
    expect(loc(res).searchParams.get("amazon")).toBe("connected");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");

    const exchange = amazon.lwaCalls.find((p) => p.get("grant_type") === "authorization_code");
    expect(Object.fromEntries(exchange)).toEqual({
      grant_type: "authorization_code",
      code: "good-code",
      redirect_uri: "https://smartsell.example.com/api/amazon/callback",
      client_id: "amzn1.application-oa2-client.prod-test",
      client_secret: "prod-client-secret-value",
    });
    expect(amazon.lwaCalls.some((p) => p.get("grant_type") === "refresh_token" && p.get("refresh_token") === "Atzr|seller-refresh-token")).toBe(true);
    expect(amazon.calls("GET /sellers/v1/marketplaceParticipations")).toHaveLength(1);

    const account = await AmazonAccount.findOne({ user: user._id }).select("+refreshTokenEnc").lean();
    expect(account).toMatchObject({ environment: "production", sellingPartnerId: SELLER, region: "na", status: "active", marketplaceIds: ["ATVPDKIKX0DER"] });
    expect(account.marketplaces[0]).toMatchObject({ id: "ATVPDKIKX0DER", currency: "USD" });
    expect(account.refreshTokenEnc).not.toContain("seller-refresh-token");
    expect(decryptSecret(account.refreshTokenEnc)).toBe("Atzr|seller-refresh-token");
    expect(await AmazonSyncJob.findOne({ amazonAccount: account._id }).lean()).toMatchObject({ kind: "initial", status: "queued", active: true });
    expect(await Notification.countDocuments({ user: user._id, title: "Amazon connected" })).toBe(1);
    // The state is gone (single use).
    expect(await AmazonOAuthState.countDocuments({ purpose: "callback" })).toBe(0);
    // Never logged: the code, tokens or secrets.
    for (const secret of ["good-code", "Atzr|", "Atza|", "prod-client-secret-value"]) expect(logs.join("\n")).not.toContain(secret);
  });

  it.each([
    ["an unknown state", () => "x".repeat(43)],
    ["a malformed state", () => "short"],
    ["a missing state", () => ""],
  ])("rejects %s", async (_label, make) => {
    const { cookie } = await signedIn();
    expect(amazonError(await callbackWith(cookie, { state: make() }))).toBe("invalid_state");
    expect(amazon.lwaCalls).toHaveLength(0);
    expect(await AmazonAccount.countDocuments()).toBe(0);
  });

  it("rejects a tampered state", async () => {
    const { cookie } = await signedIn();
    const { state } = await loginStep(cookie);
    const tampered = (state[0] === "A" ? "B" : "A") + state.slice(1);
    expect(amazonError(await callbackWith(cookie, { state: tampered }))).toBe("invalid_state");
    expect(amazon.lwaCalls).toHaveLength(0);
  });

  it("rejects an expired state", async () => {
    const { user, cookie } = await signedIn();
    const state = await createOAuthState(user._id, "callback", { sellingPartnerId: SELLER, now: Date.now() - 11 * 60_000 });
    expect(amazonError(await callbackWith(cookie, { state }))).toBe("invalid_state");
  });

  it("rejects a reused state", async () => {
    const { cookie } = await signedIn();
    const { state } = await loginStep(cookie);
    expect(loc(await callbackWith(cookie, { state })).searchParams.get("amazon")).toBe("connected");
    expect(amazonError(await callbackWith(cookie, { state }))).toBe("invalid_state");
  });

  it("rejects another user's state, which stays usable by its owner", async () => {
    const owner = await signedIn();
    const attacker = await signedIn();
    const { state } = await loginStep(owner.cookie);
    expect(amazonError(await callbackWith(attacker.cookie, { state }))).toBe("invalid_state");
    expect(await AmazonAccount.countDocuments()).toBe(0);
    expect(loc(await callbackWith(owner.cookie, { state })).searchParams.get("amazon")).toBe("connected");
  });

  it("rejects a state issued for a different seller or purpose", async () => {
    const { user, cookie } = await signedIn();
    const { state } = await loginStep(cookie, "A1OTHERSELLER");
    expect(amazonError(await callbackWith(cookie, { state }))).toBe("invalid_state");
    const consent = await createOAuthState(user._id, "consent");
    expect(amazonError(await callbackWith(cookie, { state: consent }))).toBe("invalid_state");
  });

  it("handles a declined authorization and a missing code", async () => {
    const { cookie } = await signedIn();
    expect(amazonError(await callback(get("/api/amazon/callback?error=access_denied", cookie)))).toBe("authorization_declined");
    const { state } = await loginStep(cookie);
    expect(amazonError(await callback(get(`/api/amazon/callback?state=${state}&selling_partner_id=${SELLER}`, cookie)))).toBe("missing_code");
    expect(amazon.lwaCalls).toHaveLength(0);
  });

  it("reports a token exchange failure and saves nothing", async () => {
    const { cookie } = await signedIn();
    const { state } = await loginStep(cookie);
    expect(amazonError(await callbackWith(cookie, { state, code: "expired-code" }))).toBe("token_exchange_failed");
    expect(await AmazonAccount.countDocuments()).toBe(0);
    expect(logs.join("\n")).not.toContain("expired-code");
  });

  it("fails the exchange when the redirect URI does not exactly match the registered one", async () => {
    process.env.AMAZON_REDIRECT_URI = "https://smartsell.example.com/api/amazon/callback/";
    const { cookie } = await signedIn();
    const { state } = await loginStep(cookie);
    expect(amazonError(await callbackWith(cookie, { state }))).toBe("token_exchange_failed");
    expect(await AmazonAccount.countDocuments()).toBe(0);
  });

  it("does not save the account when the new authorization cannot read marketplaces", async () => {
    amazon.on("GET /sellers/v1/marketplaceParticipations", () => json({ errors: [{ code: "Unauthorized" }] }, 403));
    const { cookie } = await signedIn();
    const { state } = await loginStep(cookie);
    expect(amazonError(await callbackWith(cookie, { state }))).toBe("verification_failed");
    expect(await AmazonAccount.countDocuments()).toBe(0);
  });

  it("refuses a seller with no North America marketplace", async () => {
    amazon.on("GET /sellers/v1/marketplaceParticipations", () => ({ payload: [{ marketplace: { id: "A1PA6795UKMFR9", name: "Amazon.de", countryCode: "DE", defaultCurrencyCode: "EUR" }, participation: { isParticipating: true } }] }));
    const { cookie } = await signedIn();
    const { state } = await loginStep(cookie);
    expect(amazonError(await callbackWith(cookie, { state }))).toBe("no_supported_marketplace");
  });

  it("reconnecting the same seller updates the account instead of duplicating it, and clears reconnect_required", async () => {
    const { user, cookie } = await signedIn();
    await callbackWith(cookie, { state: (await loginStep(cookie)).state });
    await AmazonAccount.updateOne({ user: user._id }, { $set: { status: "reconnect_required", reconnectRequiredAt: new Date() } });
    await AmazonSyncJob.updateMany({}, { $set: { active: false, status: "completed" } });
    await callbackWith(cookie, { state: (await loginStep(cookie)).state });
    const accounts = await AmazonAccount.find({ user: user._id }).lean();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].status).toBe("active");
    expect(accounts[0].reconnectRequiredAt).toBeUndefined();
  });
});
