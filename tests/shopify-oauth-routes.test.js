import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Shopifystore from "@/models/ShopifyUser";
import { GET as install } from "@/app/api/shopify/install/route";
import { GET as callback } from "@/app/api/shopify/callback/route";
import { GET as status } from "@/app/api/shopify/status/route";
import { DELETE as disconnect } from "@/app/api/shopify/stores/[id]/route";
import { GET as monthly } from "@/app/api/shopify/Montlycalculation/route";
import { GET as userdata } from "@/app/api/shopify/Shopifyuserdata/route";
import { createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/Shopify/oauth";
import { linkStore } from "@/lib/Shopify/stores";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

const SHOP = "test-store.myshopify.com";
const BASE = "http://localhost:3000";

function signedCallbackUrl(params) {
  const query = new URLSearchParams(
    Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)),
  ).toString();
  const hmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET)
    .update(query)
    .digest("hex");
  return `${BASE}/api/shopify/callback?${query}&hmac=${hmac}`;
}

function request(url, cookies = []) {
  return new NextRequest(url, { headers: { cookie: cookies.join("; ") } });
}

function redirectParams(res) {
  return new URL(res.headers.get("location")).searchParams;
}

let fetchMock;

beforeEach(async () => {
  await resetDatabase();
  await Shopifystore.init();
  fetchMock = vi.fn().mockResolvedValue(
    Response.json({ access_token: "shpat_test", scope: "read_products,write_products" }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/shopify/install", () => {
  it("redirects anonymous users to login", async () => {
    const res = await install(request(`${BASE}/api/shopify/install?shop=${SHOP}`));
    expect(new URL(res.headers.get("location")).pathname).toBe("/Login");
  });

  it("rejects non-Shopify domains", async () => {
    const user = await createUser();
    const res = await install(
      request(`${BASE}/api/shopify/install?shop=evil.com`, [sessionCookieFor(user)]),
    );
    expect(redirectParams(res).get("error")).toBe("invalid_shop");
  });

  it("redirects to Shopify with a state bound to a signed cookie and trimmed scopes", async () => {
    const user = await createUser();
    const res = await install(
      request(`${BASE}/api/shopify/install?shop=test-store`, [sessionCookieFor(user)]),
    );
    const location = new URL(res.headers.get("location"));
    expect(location.origin).toBe(`https://${SHOP}`);
    expect(location.searchParams.get("scope")).toBe("read_products,write_products");
    expect(location.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);

    const cookie = res.cookies.get(OAUTH_STATE_COOKIE);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.path).toBe("/api/shopify/callback");
  });

  it("refuses a store owned by another user", async () => {
    const owner = await createUser();
    const other = await createUser();
    await linkStore({ userId: owner._id, shop: SHOP, accessToken: "t", scope: "" });

    const res = await install(
      request(`${BASE}/api/shopify/install?shop=${SHOP}&force=true`, [sessionCookieFor(other)]),
    );
    expect(redirectParams(res).get("error")).toBe("store_owned_by_another_account");
  });
});

describe("GET /api/shopify/callback", () => {
  async function startFlow(user, shop = SHOP) {
    const { nonce, cookieValue } = createOAuthState({ shop, userId: user._id });
    return { nonce, stateCookie: `${OAUTH_STATE_COOKIE}=${cookieValue}` };
  }

  it("never contacts a non-Shopify host, even with a valid signature", async () => {
    const user = await createUser();
    const { nonce, stateCookie } = await startFlow(user);
    const url = signedCallbackUrl({ code: "c", shop: "attacker.example", state: nonce });

    const res = await callback(request(url, [sessionCookieFor(user), stateCookie]));
    expect(redirectParams(res).get("error")).toBe("invalid_callback");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid HMAC without contacting Shopify", async () => {
    const user = await createUser();
    const { nonce, stateCookie } = await startFlow(user);
    const url = signedCallbackUrl({ code: "c", shop: SHOP, state: nonce }).replace(
      /hmac=[0-9a-f]+/,
      "hmac=" + "0".repeat(64),
    );

    const res = await callback(request(url, [sessionCookieFor(user), stateCookie]));
    expect(redirectParams(res).get("error")).toBe("invalid_signature");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing or mismatched state (CSRF)", async () => {
    const user = await createUser();
    const { stateCookie } = await startFlow(user);

    const noCookie = await callback(
      request(signedCallbackUrl({ code: "c", shop: SHOP, state: "abc" }), [sessionCookieFor(user)]),
    );
    expect(redirectParams(noCookie).get("error")).toBe("invalid_state");

    const wrongNonce = await callback(
      request(signedCallbackUrl({ code: "c", shop: SHOP, state: "abc" }), [
        sessionCookieFor(user),
        stateCookie,
      ]),
    );
    expect(redirectParams(wrongNonce).get("error")).toBe("invalid_state");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a state started for a different shop", async () => {
    const user = await createUser();
    const { nonce, stateCookie } = await startFlow(user, "other-store.myshopify.com");
    const res = await callback(
      request(signedCallbackUrl({ code: "c", shop: SHOP, state: nonce }), [
        sessionCookieFor(user),
        stateCookie,
      ]),
    );
    expect(redirectParams(res).get("error")).toBe("invalid_state");
  });

  it("rejects when the signed-in user differs from the one who started the flow", async () => {
    const starter = await createUser();
    const victim = await createUser();
    const { nonce, stateCookie } = await startFlow(starter);
    const res = await callback(
      request(signedCallbackUrl({ code: "c", shop: SHOP, state: nonce }), [
        sessionCookieFor(victim),
        stateCookie,
      ]),
    );
    expect(redirectParams(res).get("error")).toBe("session_mismatch");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges the code, stores the token and clears the state cookie", async () => {
    const user = await createUser();
    const { nonce, stateCookie } = await startFlow(user);
    const res = await callback(
      request(signedCallbackUrl({ code: "the-code", shop: SHOP, state: nonce }), [
        sessionCookieFor(user),
        stateCookie,
      ]),
    );

    expect(redirectParams(res).get("connected")).toBe("shopify");
    expect(res.cookies.get(OAUTH_STATE_COOKIE).maxAge).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://${SHOP}/admin/oauth/access_token`,
      expect.objectContaining({ method: "POST" }),
    );

    const store = await Shopifystore.findOne({ shop: SHOP }).select("+accessToken");
    expect(store.user.equals(user._id)).toBe(true);
    expect(store.accessToken).toBe("shpat_test");
    expect(store.scope).toBe("read_products,write_products");
  });

  it("does not hand a store owned by someone else to a new user", async () => {
    const owner = await createUser();
    const other = await createUser();
    await linkStore({ userId: owner._id, shop: SHOP, accessToken: "owner-token", scope: "" });

    const { nonce, stateCookie } = await startFlow(other);
    const res = await callback(
      request(signedCallbackUrl({ code: "c", shop: SHOP, state: nonce }), [
        sessionCookieFor(other),
        stateCookie,
      ]),
    );
    expect(redirectParams(res).get("error")).toBe("store_owned_by_another_account");

    const store = await Shopifystore.findOne({ shop: SHOP }).select("+accessToken");
    expect(store.user.equals(owner._id)).toBe(true);
    expect(store.accessToken).toBe("owner-token");
  });

  it("reports a rejected token exchange without leaking Shopify's response", async () => {
    fetchMock.mockResolvedValue(new Response("secret-ish body", { status: 400 }));
    const user = await createUser();
    const { nonce, stateCookie } = await startFlow(user);
    const res = await callback(
      request(signedCallbackUrl({ code: "c", shop: SHOP, state: nonce }), [
        sessionCookieFor(user),
        stateCookie,
      ]),
    );
    expect(redirectParams(res).get("error")).toBe("connection_failed");
    expect(res.headers.get("location")).not.toContain("secret-ish");
    expect(await Shopifystore.countDocuments()).toBe(0);
  });
});

describe("authenticated Shopify API routes", () => {
  it("return 401 without a valid session", async () => {
    for (const handler of [status, monthly, userdata]) {
      const res = await handler(request(`${BASE}/api/x?type=orders`));
      expect(res.status).toBe(401);
    }
    const res = await disconnect(request(`${BASE}/api/x`), {
      params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
    });
    expect(res.status).toBe(401);
  });

  it("status lists only the user's stores, without tokens, and flags missing scopes", async () => {
    const owner = await createUser();
    const other = await createUser();
    await linkStore({ userId: owner._id, shop: SHOP, accessToken: "tok", scope: "read_products" });

    const mine = await (await status(request(`${BASE}/api/shopify/status`, [sessionCookieFor(owner)]))).json();
    expect(mine.connected).toBe(true);
    expect(mine.stores).toHaveLength(1);
    expect(mine.stores[0].missingScopes).toEqual(["write_products"]);
    expect(JSON.stringify(mine)).not.toContain("tok\"");
    expect(mine.stores[0].accessToken).toBeUndefined();

    const theirs = await (await status(request(`${BASE}/api/shopify/status`, [sessionCookieFor(other)]))).json();
    expect(theirs.stores).toHaveLength(0);
  });

  it("treats a granted write scope as covering the matching read scope", async () => {
    const user = await createUser();
    await linkStore({ userId: user._id, shop: SHOP, accessToken: "tok", scope: "read_orders,write_products" });

    const body = await (await status(request(`${BASE}/api/shopify/status`, [sessionCookieFor(user)]))).json();
    expect(body.stores[0].missingScopes).toEqual([]);
  });

  it("disconnecting another user's store returns 404", async () => {
    const owner = await createUser();
    const other = await createUser();
    const store = await linkStore({ userId: owner._id, shop: SHOP, accessToken: "tok", scope: "" });

    const res = await disconnect(request(`${BASE}/api/x`, [sessionCookieFor(other)]), {
      params: Promise.resolve({ id: String(store._id) }),
    });
    expect(res.status).toBe(404);
    expect((await Shopifystore.findById(store._id)).status).toBe("active");
  });
});

describe("live-update status per deployment", () => {
  it("reports 'elsewhere' when webhooks point to another environment, 'active' when they point here", async () => {
    const user = await createUser();
    const store = await linkStore({ userId: user._id, shop: SHOP, accessToken: "tok", scope: "read_products" });
    await Shopifystore.updateOne({ _id: store._id }, {
      $set: { webhooks: { status: "active", callbackUrl: "https://old-tunnel.trycloudflare.com/api/shopify/webhooks" } },
    });

    const original = process.env.SHOPIFY_WEBHOOK_BASE_URL;
    try {
      process.env.SHOPIFY_WEBHOOK_BASE_URL = "https://prod.example.com";
      let body = await (await status(request(`${BASE}/api/shopify/status`, [sessionCookieFor(user)]))).json();
      expect(body.stores[0].webhooks).toMatchObject({ status: "elsewhere", registeredHost: "old-tunnel.trycloudflare.com" });

      // Points here but registered with only the original product topics.
      await Shopifystore.updateOne({ _id: store._id }, { $set: { "webhooks.callbackUrl": "https://prod.example.com/api/shopify/webhooks", "webhooks.topics": ["products/create", "products/update", "products/delete", "app/uninstalled"] } });
      body = await (await status(request(`${BASE}/api/shopify/status`, [sessionCookieFor(user)]))).json();
      expect(body.stores[0].webhooks).toMatchObject({ status: "outdated", missingTopics: ["orders/create", "orders/updated", "inventory_levels/update"] });

      await Shopifystore.updateOne({ _id: store._id }, { $set: { "webhooks.topics": Object.values((await import("@/lib/Shopify/webhookRegistration")).WEBHOOK_TOPICS) } });
      body = await (await status(request(`${BASE}/api/shopify/status`, [sessionCookieFor(user)]))).json();
      expect(body.stores[0].webhooks.status).toBe("active");
    } finally {
      process.env.SHOPIFY_WEBHOOK_BASE_URL = original ?? "";
    }
  });
});
