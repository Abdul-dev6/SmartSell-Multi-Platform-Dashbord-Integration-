import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearApplicationTokenCache, EbayOAuthError, getApplicationToken } from "@/lib/ebay/oauth";
import { clearPublicKeyCache, SignatureError, verifyNotificationSignature } from "@/lib/ebay/notifications/verify";

// The real application-token (client credentials) request used to fetch
// eBay's notification public keys; only fetch is stubbed.

const keyset = {
  environment: "production",
  clientId: "Prod-App-PRD-0123456789-abcdef01",
  clientSecret: "PRD-secret-value-0123456789",
  apiBase: "https://api.ebay.com",
};

let calls;
function stubFetch(responder) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    calls.push({ url: String(url), init });
    return responder(String(url), init);
  }));
}
const jsonResponse = (body, status) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  clearApplicationTokenCache();
  clearPublicKeyCache();
});
afterEach(() => vi.unstubAllGlobals());

describe("application token (client credentials)", () => {
  it("requests a Production token exactly as eBay's client credentials grant requires", async () => {
    stubFetch(() => jsonResponse({ access_token: "v^1.1#app-token", expires_in: 7200, token_type: "Application Access Token" }, 200));
    expect(await getApplicationToken(keyset)).toBe("v^1.1#app-token");

    const [{ url, init }] = calls;
    expect(url).toBe("https://api.ebay.com/identity/v1/oauth2/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${keyset.clientId}:${keyset.clientSecret}`).toString("base64")}`);
    const body = new URLSearchParams(init.body.toString());
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("scope")).toBe("https://api.ebay.com/oauth/api_scope");
  });

  it("caches the token until shortly before it expires", async () => {
    stubFetch(() => jsonResponse({ access_token: "t1", expires_in: 7200 }, 200));
    await getApplicationToken(keyset);
    await getApplicationToken(keyset);
    expect(calls).toHaveLength(1);
  });

  it.each([
    [401, "unauthorized_client", "client is not authorized to use this authorization grant type"],
    [401, "invalid_client", "client authentication failed"],
    [400, "invalid_scope", "The requested scope is invalid"],
  ])("a %i %s response is an EbayOAuthError carrying status and eBay's code only", async (status, error, description) => {
    stubFetch(() => jsonResponse({ error, error_description: description }, status));
    const thrown = await getApplicationToken(keyset).catch((e) => e);
    expect(thrown).toBeInstanceOf(EbayOAuthError);
    expect(thrown).toMatchObject({ code: "token_rejected", status, oauthError: error });
    expect(JSON.stringify(thrown)).not.toContain(description);
  });

  it("does not keep a non-code error value and handles network failures", async () => {
    stubFetch(() => jsonResponse({ error: "Some <b>free text</b> with secret PRD-x" }, 500));
    expect(await getApplicationToken(keyset).catch((e) => e)).toMatchObject({ status: 500, oauthError: null });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await getApplicationToken(keyset).catch((e) => e)).toMatchObject({ code: "token_request_failed" });
  });
});

describe("notification verification when the token is refused", () => {
  const header = Buffer.from(JSON.stringify({ alg: "ECDSA", kid: "key-1", signature: "c2ln", digest: "SHA1" })).toString("base64");
  const verify = () => verifyNotificationSignature({ message: { a: 1 }, rawBody: '{"a":1}', header, keyset }).catch((e) => e);

  it.each([
    ["unauthorized_client", 401, "keyset_not_enabled"],
    ["invalid_client", 401, "check_client_id_and_secret"],
  ])("%s → key_unavailable with a safe diagnosis, and the key is never fetched", async (error, status, hint) => {
    stubFetch(() => jsonResponse({ error, error_description: "details" }, status));
    const thrown = await verify();
    expect(thrown).toBeInstanceOf(SignatureError);
    expect(thrown.reason).toBe("key_unavailable");
    expect(thrown.detail).toEqual({ stage: "token", code: "token_rejected", status, oauthError: error, hint });
    expect(calls.map((c) => c.url)).toEqual(["https://api.ebay.com/identity/v1/oauth2/token"]);
    expect(JSON.stringify(thrown.detail)).not.toMatch(/PRD-secret|Prod-App|Basic /);
  });

  it("with a token, fetches the Production public key by key ID", async () => {
    stubFetch((url) =>
      url.endsWith("/oauth2/token")
        ? jsonResponse({ access_token: "app-token", expires_in: 7200 }, 200)
        : jsonResponse({ key: "-----BEGIN PUBLIC KEY-----MFkw-----END PUBLIC KEY-----" }, 200),
    );
    const thrown = await verify();
    // The fake signature does not verify, so it is rejected (412 path).
    expect(thrown).toMatchObject({ reason: "invalid" });
    expect(calls[1].url).toBe("https://api.ebay.com/commerce/notification/v1/public_key/key-1");
    expect(calls[1].init.headers.Authorization).toBe("Bearer app-token");
  });
});
