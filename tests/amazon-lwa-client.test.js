import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmazonConfigError, amazonEndpoints, getAmazonConfig, getAmazonEnvironment, LWA_TOKEN_URL } from "@/lib/amazon/config";
import { AmazonAuthError, clearLwaCache, getAccessToken } from "@/lib/amazon/lwa";
import { AmazonApiError, backoffDelay, createAmazonClient } from "@/lib/amazon/client";

// LWA token handling and the SP-API client, with fetch stubbed (no network).

const creds = {
  environment: "sandbox",
  apiBase: "https://sandbox.sellingpartnerapi-na.amazon.com",
  clientId: "amzn1.application-oa2-client.test",
  clientSecret: "test-client-secret-value",
  refreshToken: "Atzr|test-refresh-token-value",
};
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const lwaOk = (token = "Atza|access-1", expires_in = 3600) => json({ access_token: token, token_type: "bearer", expires_in });

let logs;
beforeEach(() => {
  clearLwaCache();
  logs = [];
  for (const level of ["error", "warn", "info", "log"]) vi.spyOn(console, level).mockImplementation((...a) => logs.push(a.join(" ")));
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AMAZON_ENVIRONMENT;
});

const noSecretsIn = (text) => {
  for (const secret of [creds.clientSecret, creds.refreshToken, "Atza|", "Atzr|"]) expect(text).not.toContain(secret);
};

describe("configuration (sandbox and production kept apart)", () => {
  it("defaults to sandbox, supports production, refuses anything else", () => {
    expect(getAmazonEnvironment()).toBe("sandbox");
    expect(amazonEndpoints()).toMatchObject({ apiBase: "https://sandbox.sellingpartnerapi-na.amazon.com", label: "Sandbox", region: "na" });
    process.env.AMAZON_ENVIRONMENT = "production";
    expect(amazonEndpoints()).toMatchObject({ apiBase: "https://sellingpartnerapi-na.amazon.com", label: "Production" });
    process.env.AMAZON_ENVIRONMENT = "staging";
    expect(() => getAmazonEnvironment()).toThrow(AmazonConfigError);
    expect(() => getAmazonConfig()).toThrow(AmazonConfigError);
  });

  it("a client only calls its own environment's host", () => {
    expect(() => createAmazonClient({ ...creds, apiBase: "https://sellingpartnerapi-na.amazon.com" })).toThrow(AmazonApiError);
    expect(() => createAmazonClient({ ...creds, apiBase: "http://sandbox.sellingpartnerapi-na.amazon.com" })).toThrow(AmazonApiError);
    expect(() => createAmazonClient({ ...creds, environment: "production", apiBase: "https://sandbox.sellingpartnerapi-na.amazon.com" })).toThrow(AmazonApiError);
    expect(() => createAmazonClient({ ...creds, environment: "production", apiBase: "https://sellingpartnerapi-na.amazon.com" })).not.toThrow();
  });
});

describe("LWA token", () => {
  it("exchanges the refresh token exactly as Amazon's SDK does", async () => {
    const fetchImpl = vi.fn(async () => lwaOk());
    expect(await getAccessToken(creds, { fetchImpl })).toBe("Atza|access-1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(LWA_TOKEN_URL);
    expect(url).toBe("https://api.amazon.com/auth/o2/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toMatch(/^application\/x-www-form-urlencoded/);
    const body = new URLSearchParams(init.body.toString());
    expect(Object.fromEntries(body)).toEqual({ grant_type: "refresh_token", refresh_token: creds.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret });
  });

  it("caches the token until five minutes before it expires", async () => {
    let t = 1_000_000;
    const now = () => t;
    const fetchImpl = vi.fn(async () => lwaOk(`Atza|token-${fetchImpl.mock.calls.length}`, 3600));
    expect(await getAccessToken(creds, { fetchImpl, now })).toBe("Atza|token-1");
    t += 3600_000 - 301_000;
    expect(await getAccessToken(creds, { fetchImpl, now })).toBe("Atza|token-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t += 2_000; // inside the last five minutes
    expect(await getAccessToken(creds, { fetchImpl, now })).toBe("Atza|token-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent callers, and forceRefresh skips the cache", async () => {
    const fetchImpl = vi.fn(async () => lwaOk(`Atza|t${fetchImpl.mock.calls.length}`));
    const [a, b] = await Promise.all([getAccessToken(creds, { fetchImpl }), getAccessToken(creds, { fetchImpl })]);
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await getAccessToken(creds, { fetchImpl, forceRefresh: true })).toBe("Atza|t2");
  });

  it("errors carry only status and LWA's error code, never secrets or descriptions", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "invalid_grant", error_description: `bad token ${creds.refreshToken}` }, 400));
    const error = await getAccessToken(creds, { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(AmazonAuthError);
    expect(error).toMatchObject({ code: "token_rejected", status: 400, oauthError: "invalid_grant" });
    noSecretsIn(`${error.message} ${JSON.stringify(error)}`);
    expect(JSON.stringify(error)).not.toContain("bad token");

    const net = await getAccessToken(creds, { fetchImpl: vi.fn(async () => { throw new TypeError("fetch failed"); }) }).catch((e) => e);
    expect(net).toMatchObject({ code: "token_request_failed" });
    const missing = await getAccessToken({ ...creds, refreshToken: "" }, { fetchImpl }).catch((e) => e);
    expect(missing).toBeInstanceOf(AmazonAuthError);
  });
});

describe("SP-API client", () => {
  function router(apiResponses) {
    const calls = { lwa: 0, api: [] };
    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url) === LWA_TOKEN_URL) {
        calls.lwa += 1;
        return lwaOk(`Atza|token-${calls.lwa}`);
      }
      calls.api.push({ url: new URL(url), headers: init.headers });
      const next = apiResponses.shift();
      return typeof next === "function" ? next() : next;
    });
    return { calls, fetchImpl };
  }

  it("sends x-amz-access-token and User-Agent SmartSell/1.0 to the sandbox host", async () => {
    const { calls, fetchImpl } = router([json({ payload: [] })]);
    const client = createAmazonClient(creds, { fetchImpl });
    await client.get("getMarketplaceParticipations", "/sellers/v1/marketplaceParticipations", { marketplaceIds: ["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2"] });
    const [{ url, headers }] = calls.api;
    expect(url.origin).toBe("https://sandbox.sellingpartnerapi-na.amazon.com");
    expect(url.pathname).toBe("/sellers/v1/marketplaceParticipations");
    expect(url.searchParams.get("marketplaceIds")).toBe("ATVPDKIKX0DER,A2EUQ1WTGCTBG2");
    expect(headers).toMatchObject({ "x-amz-access-token": "Atza|token-1", "User-Agent": "SmartSell/1.0", Accept: "application/json" });
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("on 401 gets a new token and retries once", async () => {
    const { calls, fetchImpl } = router([json({ errors: [{ code: "Unauthorized" }] }, 401), json({ payload: [] })]);
    await createAmazonClient(creds, { fetchImpl }).get("op", "/sellers/v1/marketplaceParticipations");
    expect(calls.lwa).toBe(2);
    expect(calls.api.map((c) => c.headers["x-amz-access-token"])).toEqual(["Atza|token-1", "Atza|token-2"]);
  });

  it("a second 401 is an error, not a loop", async () => {
    const { calls, fetchImpl } = router([json({ errors: [{ code: "Unauthorized" }] }, 401), json({ errors: [{ code: "Unauthorized" }] }, 401)]);
    const error = await createAmazonClient(creds, { fetchImpl }).get("op", "/x").catch((e) => e);
    expect(error).toBeInstanceOf(AmazonApiError);
    expect(error).toMatchObject({ status: 401, code: "Unauthorized" });
    expect(calls.api).toHaveLength(2);
  });

  it("backs off exponentially on 429 and then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const { calls, fetchImpl } = router([json({}, 429), json({}, 429, { "retry-after": "2" }), json({ payload: [] })]);
    await createAmazonClient(creds, { fetchImpl, sleep, baseDelayMs: 500, random: () => 1 }).get("op", "/x");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 2000]);
    expect(calls.api).toHaveLength(3);
  });

  it("stops after maxRetries throttles with a throttled error", async () => {
    const sleep = vi.fn(async () => {});
    const { calls, fetchImpl } = router([json({}, 429), json({}, 429), json({}, 429), json({}, 429)]);
    const error = await createAmazonClient(creds, { fetchImpl, sleep, maxRetries: 3, baseDelayMs: 100, random: () => 1 }).get("op", "/x").catch((e) => e);
    expect(error).toMatchObject({ status: 429, code: "throttled" });
    expect(calls.api).toHaveLength(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200, 400]);
  });

  it("delay respects x-amzn-RateLimit-Limit, adds jitter and is capped", () => {
    const top = () => 1;
    expect(backoffDelay(0, new Headers({ "x-amzn-ratelimit-limit": "0.5" }), 100, top)).toBe(2000);
    expect(backoffDelay(10, new Headers(), 500, top)).toBe(10_000);
    expect(backoffDelay(0, new Headers({ "retry-after": "60" }), 500, top)).toBe(10_000);
    // Jitter: 50–100% of the exponential delay.
    expect(backoffDelay(2, new Headers(), 100, () => 0)).toBe(200);
    expect(backoffDelay(2, new Headers(), 100, () => 0.5)).toBe(300);
  });

  it("never logs tokens, secrets or response bodies", async () => {
    const { fetchImpl } = router([json({}, 429), json({ errors: [{ code: "InvalidInput", message: "SKU secret-sku-123 bad" }] }, 400, { "x-amzn-requestid": "req-1" })]);
    const error = await createAmazonClient(creds, { fetchImpl, sleep: async () => {} }).get("getListingsItem", "/x").catch((e) => e);
    expect(error).toMatchObject({ status: 400, code: "InvalidInput", requestId: "req-1" });
    const text = logs.join("\n");
    expect(text).toContain("amazon_api_error");
    expect(text).toContain("amazon_throttled");
    noSecretsIn(text);
    expect(text).not.toContain("secret-sku-123");
  });
});
