import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EbayAccount from "@/models/EbayAccount";
import { GET as connect } from "@/app/api/ebay/connect/route";
import { GET as callback } from "@/app/api/ebay/callback/route";
import { GET as status } from "@/app/api/ebay/status/route";
import { GET as setupGet, POST as setupPost } from "@/app/api/ebay/setup/route";
import { DELETE as disconnect } from "@/app/api/ebay/accounts/[id]/route";
import { createEbayOAuthState, EBAY_OAUTH_STATE_COOKIE } from "@/lib/ebay/oauth";
import { decryptSecret, encryptSecret } from "@/lib/ebay/crypto";
import { createEbayClient, getUserAccessToken } from "@/lib/ebay/client";
import { getEbayConfig } from "@/lib/ebay/config";
import { createFakeEbay } from "./helpers/fakeEbay";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

const BASE = "http://localhost:3000";
let ebay;

function request(url, { cookies = [], method = "GET", body } = {}) {
  return new NextRequest(url, {
    method,
    headers: { cookie: cookies.join("; "), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const location = (res) => new URL(res.headers.get("location"));

async function connectViaCallback(user, { code = "good-code" } = {}) {
  const { nonce, cookieValue } = createEbayOAuthState({ userId: user._id, environment: "sandbox" });
  const url = `${BASE}/api/ebay/callback?state=${nonce}${code ? `&code=${encodeURIComponent(code)}` : ""}`;
  return callback(request(url, { cookies: [sessionCookieFor(user), `${EBAY_OAUTH_STATE_COOKIE}=${cookieValue}`] }));
}

beforeEach(async () => {
  await resetDatabase();
  await EbayAccount.init();
  ebay = createFakeEbay();
  vi.stubGlobal("fetch", ebay.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("config and token encryption", () => {
  it("reads sandbox credentials and default scopes", () => {
    const config = getEbayConfig();
    expect(config.environment).toBe("sandbox");
    expect(config.apiBase).toBe("https://api.sandbox.ebay.com");
    expect(config.scopes).toContain("https://api.ebay.com/oauth/api_scope/sell.inventory");
  });

  it("returns null when a credential is missing", () => {
    const saved = process.env.EBAY_SANDBOX_RU_NAME;
    delete process.env.EBAY_SANDBOX_RU_NAME;
    try {
      expect(getEbayConfig()).toBeNull();
    } finally {
      process.env.EBAY_SANDBOX_RU_NAME = saved;
    }
  });

  it("round-trips secrets and rejects tampering", () => {
    const enc = encryptSecret("refresh-token-value");
    expect(enc).not.toContain("refresh-token-value");
    expect(decryptSecret(enc)).toBe("refresh-token-value");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
});

describe("GET /api/ebay/connect", () => {
  it("sends anonymous visitors to login", async () => {
    const res = await connect(request(`${BASE}/api/ebay/connect`));
    expect(location(res).pathname).toBe("/Login");
  });

  it("redirects to eBay consent with the RuName, scopes and a signed state cookie", async () => {
    const user = await createUser();
    const res = await connect(request(`${BASE}/api/ebay/connect`, { cookies: [sessionCookieFor(user)] }));
    const url = location(res);
    expect(url.origin).toBe("https://auth.sandbox.ebay.com");
    expect(url.searchParams.get("redirect_uri")).toBe("Test-RuName-SmartSell");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("sell.inventory");
    expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    const cookie = res.cookies.get(EBAY_OAUTH_STATE_COOKIE);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.path).toBe("/api/ebay/callback");
  });

  it("reports missing configuration without contacting eBay", async () => {
    const user = await createUser();
    const saved = process.env.EBAY_SANDBOX_CLIENT_SECRET;
    delete process.env.EBAY_SANDBOX_CLIENT_SECRET;
    try {
      const res = await connect(request(`${BASE}/api/ebay/connect`, { cookies: [sessionCookieFor(user)] }));
      expect(location(res).searchParams.get("error")).toBe("ebay_not_configured");
    } finally {
      process.env.EBAY_SANDBOX_CLIENT_SECRET = saved;
    }
  });
});

describe("GET /api/ebay/callback", () => {
  it("links the seller's account with encrypted tokens and checks setup", async () => {
    const user = await createUser();
    const res = await connectViaCallback(user);
    expect(location(res).searchParams.get("connected")).toBe("ebay");
    expect(res.cookies.get(EBAY_OAUTH_STATE_COOKIE).value).toBe("");

    const account = await EbayAccount.findOne({ user: user._id }).select("+refreshTokenEnc +accessTokenEnc").lean();
    expect(account.ebayUserId).toBe("ebay-user-1");
    expect(account.username).toBe("test_seller");
    expect(account.status).toBe("active");
    expect(account.refreshTokenEnc).not.toContain("refresh");
    expect(decryptSecret(account.refreshTokenEnc)).toBe("v^1.1#refresh");
    expect(account.setup.ready).toBe(true);
    expect(account.setup.merchantLocationKey).toBe("warehouse-1");
    expect(account.setup.fulfillmentPolicyId).toBe("F1");
  });

  it("rejects a missing or forged state", async () => {
    const user = await createUser();
    const res = await callback(
      request(`${BASE}/api/ebay/callback?state=abc&code=good-code`, { cookies: [sessionCookieFor(user)] }),
    );
    expect(location(res).searchParams.get("error")).toBe("invalid_state");
    expect(ebay.calls).toHaveLength(0);
  });

  it("rejects a state issued to another user", async () => {
    const owner = await createUser();
    const other = await createUser();
    const { nonce, cookieValue } = createEbayOAuthState({ userId: owner._id, environment: "sandbox" });
    const res = await callback(
      request(`${BASE}/api/ebay/callback?state=${nonce}&code=good-code`, {
        cookies: [sessionCookieFor(other), `${EBAY_OAUTH_STATE_COOKIE}=${cookieValue}`],
      }),
    );
    expect(location(res).searchParams.get("error")).toBe("session_mismatch");
  });

  it("handles a declined consent", async () => {
    const user = await createUser();
    const res = await connectViaCallback(user, { code: null });
    expect(location(res).searchParams.get("error")).toBe("ebay_authorization_declined");
  });

  it("reports a declined consent even when eBay omits the state", async () => {
    const user = await createUser();
    const res = await callback(request(`${BASE}/api/ebay/callback`, { cookies: [sessionCookieFor(user)] }));
    expect(location(res).searchParams.get("error")).toBe("ebay_authorization_declined");
    expect(ebay.calls).toHaveLength(0);
    expect(await EbayAccount.countDocuments()).toBe(0);
  });

  it("handles a rejected authorization code", async () => {
    const user = await createUser();
    const res = await connectViaCallback(user, { code: "expired" });
    expect(location(res).searchParams.get("error")).toBe("ebay_connection_failed");
    expect(await EbayAccount.countDocuments()).toBe(0);
  });

  it("never moves an eBay account to a different SmartSell user", async () => {
    const owner = await createUser();
    const other = await createUser();
    await connectViaCallback(owner);
    const res = await connectViaCallback(other);
    expect(location(res).searchParams.get("error")).toBe("ebay_account_owned_by_another_account");
    const account = await EbayAccount.findOne().lean();
    expect(String(account.user)).toBe(String(owner._id));
  });
});

describe("status and disconnect", () => {
  it("lists the user's accounts without tokens", async () => {
    const user = await createUser();
    await connectViaCallback(user);
    const res = await status(request(`${BASE}/api/ebay/status`, { cookies: [sessionCookieFor(user)] }));
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.environment).toBe("sandbox");
    expect(body.connected).toBe(true);
    expect(body.accounts[0].username).toBe("test_seller");
    expect(JSON.stringify(body)).not.toMatch(/refresh|user-access|TokenEnc/);
  });

  it("requires a session", async () => {
    const res = await status(request(`${BASE}/api/ebay/status`));
    expect(res.status).toBe(401);
  });

  it("disconnects only the owner's account and deletes its tokens", async () => {
    const user = await createUser();
    const other = await createUser();
    await connectViaCallback(user);
    const account = await EbayAccount.findOne({ user: user._id });

    const denied = await disconnect(
      request(`${BASE}/api/ebay/accounts/${account._id}`, { method: "DELETE", cookies: [sessionCookieFor(other)] }),
      { params: Promise.resolve({ id: String(account._id) }) },
    );
    expect(denied.status).toBe(404);

    const res = await disconnect(
      request(`${BASE}/api/ebay/accounts/${account._id}`, { method: "DELETE", cookies: [sessionCookieFor(user)] }),
      { params: Promise.resolve({ id: String(account._id) }) },
    );
    expect(res.status).toBe(200);
    const after = await EbayAccount.findById(account._id).select("+refreshTokenEnc +accessTokenEnc").lean();
    expect(after.status).toBe("disconnected");
    expect(after.refreshTokenEnc).toBeUndefined();
    expect(after.accessTokenEnc).toBeUndefined();
  });
});

describe("access token refresh", () => {
  it("refreshes an expired access token and stores it encrypted", async () => {
    const user = await createUser();
    await connectViaCallback(user);
    await EbayAccount.updateOne({ user: user._id }, { $set: { accessTokenExpiresAt: new Date(Date.now() - 1000) } });
    const account = await EbayAccount.findOne({ user: user._id }).select("+refreshTokenEnc +accessTokenEnc");
    const before = ebay.state.accessTokenSeq;
    const token = await getUserAccessToken(account);
    expect(ebay.state.accessTokenSeq).toBe(before + 1);
    expect(token).toBe(`v^1.1#user-access-${before + 1}`);
    const saved = await EbayAccount.findById(account._id).select("+accessTokenEnc").lean();
    expect(decryptSecret(saved.accessTokenEnc)).toBe(token);
  });

  it("marks the account for reauthorization when eBay revokes the refresh token", async () => {
    const user = await createUser();
    await connectViaCallback(user);
    await EbayAccount.updateOne({ user: user._id }, { $set: { accessTokenExpiresAt: new Date(0) } });
    ebay.state.revoked = true;
    const account = await EbayAccount.findOne({ user: user._id }).select("+refreshTokenEnc +accessTokenEnc");
    await expect(getUserAccessToken(account)).rejects.toMatchObject({ code: "reauth_required" });
    expect((await EbayAccount.findById(account._id).lean()).status).toBe("reauth_required");
  });

  it("retries once with a fresh token after a 401", async () => {
    const user = await createUser();
    await connectViaCallback(user);
    const account = await EbayAccount.findOne({ user: user._id }).select("+refreshTokenEnc +accessTokenEnc");
    ebay.fail({ method: "GET", path: "/sell/inventory/v1/location", status: 401 });
    const client = createEbayClient(account, { retryDelayMs: 0 });
    const data = await client.get("/sell/inventory/v1/location");
    expect(data.locations).toHaveLength(1);
  });

  it("refreshes only once when a 401 is followed by read retries", async () => {
    const user = await createUser();
    await connectViaCallback(user);
    const account = await EbayAccount.findOne({ user: user._id }).select("+refreshTokenEnc +accessTokenEnc");
    ebay.fail({ method: "GET", path: "/sell/inventory/v1/location", status: 401 });
    ebay.fail({ method: "GET", path: "/sell/inventory/v1/location", status: 503, times: 1 });
    const before = ebay.state.accessTokenSeq;
    const data = await createEbayClient(account, { retryDelayMs: 0 }).get("/sell/inventory/v1/location");
    expect(data.locations).toHaveLength(1);
    expect(ebay.state.accessTokenSeq).toBe(before + 1);
  });
});

describe("seller setup", () => {
  it("reports missing policies when business policies are not enabled, then opts in", async () => {
    ebay = createFakeEbay({ optedIn: false, withSetup: false });
    vi.stubGlobal("fetch", ebay.fetch);
    const user = await createUser();
    await connectViaCallback(user);
    const cookies = [sessionCookieFor(user)];

    let body = await (await setupGet(request(`${BASE}/api/ebay/setup`, { cookies }))).json();
    expect(body.account.setup.ready).toBe(false);
    expect(body.account.setup.issues).toEqual(["business_policies_not_enabled", "missing_location"]);

    body = await (await setupPost(request(`${BASE}/api/ebay/setup`, { method: "POST", cookies, body: { action: "opt_in" } }))).json();
    expect(body.account.setup.issues).toContain("missing_payment_policy");

    body = await (await setupPost(request(`${BASE}/api/ebay/setup`, { method: "POST", cookies, body: { action: "create_policies" } }))).json();
    expect(body.account.setup.issues).toEqual(["missing_location"]);

    const invalid = await setupPost(
      request(`${BASE}/api/ebay/setup`, { method: "POST", cookies, body: { action: "create_location", location: { country: "USA" } } }),
    );
    expect(invalid.status).toBe(400);

    body = await (
      await setupPost(
        request(`${BASE}/api/ebay/setup`, {
          method: "POST",
          cookies,
          body: { action: "create_location", location: { key: "home", name: "Home", postalCode: "95125", country: "US" } },
        }),
      )
    ).json();
    expect(body.account.setup.ready).toBe(true);
    expect(body.account.setup.merchantLocationKey).toBe("home");
  });

  it("only accepts policy choices that exist on the eBay account", async () => {
    const user = await createUser();
    await connectViaCallback(user);
    const cookies = [sessionCookieFor(user)];
    const res = await setupPost(
      request(`${BASE}/api/ebay/setup`, { method: "POST", cookies, body: { action: "select", fulfillmentPolicyId: "NOT-MINE" } }),
    );
    expect(res.status).toBe(400);
  });
});
