import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, createClient } from "@/lib/shopify/client";
import { getShopifyApiVersion } from "@/lib/shopify/config";
import {
  assertNoUserErrors,
  gidToId,
  shopifyGraphql,
  ShopifyGraphQLError,
  throttleWaitMs,
} from "@/lib/shopify/graphql";
import { Getinventory } from "@/lib/shopify/inventory";

// Replaces axios' network layer: each call returns the next scripted result.
function scriptedClient(results) {
  const client = createClient("test-store", "tok");
  const calls = [];
  client.defaults.adapter = async (config) => {
    calls.push(config);
    const next = results.shift();
    if (next instanceof Error) {
      next.config = config;
      throw next;
    }
    const response = { data: next.data ?? {}, status: next.status ?? 200, statusText: "", headers: next.headers ?? {}, config };
    if (response.status >= 400) {
      const error = new Error(`HTTP ${response.status}`);
      error.config = config;
      error.response = response;
      throw error;
    }
    return response;
  };
  return { client, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.SHOPIFY_API_VERSION;
});

async function run(promise) {
  const settled = promise.then((v) => ({ v }), (e) => ({ e }));
  await vi.runAllTimersAsync();
  const { v, e } = await settled;
  if (e) throw e;
  return v;
}

describe("API version", () => {
  it("defaults to 2026-07, honours SHOPIFY_API_VERSION and rejects junk", () => {
    expect(getShopifyApiVersion()).toBe("2026-07");
    process.env.SHOPIFY_API_VERSION = "2026-10";
    expect(createClient("s", "t").defaults.baseURL).toBe("https://s.myshopify.com/admin/api/2026-10");
    process.env.SHOPIFY_API_VERSION = "latest";
    expect(() => getShopifyApiVersion()).toThrow();
  });
});

describe("REST retries", () => {
  it("retries a GET after 429 using Retry-After, then succeeds", async () => {
    const { client, calls } = scriptedClient([
      { status: 429, headers: { "retry-after": "2.0" } },
      { data: { ok: true } },
    ]);
    const res = await run(client.get("/products.json"));
    expect(res.data).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("retries GETs on 5xx and network errors, at most 3 times", async () => {
    const { client, calls } = scriptedClient([
      { status: 503 }, new Error("ECONNRESET"), { status: 502 }, { status: 500 },
    ]);
    await expect(run(client.get("/orders.json"))).rejects.toMatchObject({ response: { status: 500 } });
    expect(calls).toHaveLength(4);
  });

  it("never retries a POST that failed in transit (it may have been applied)", async () => {
    const { client, calls } = scriptedClient([{ status: 503 }, { data: {} }]);
    await expect(run(client.post("/products.json", {}))).rejects.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("does not retry client errors like 404 or 422", async () => {
    const { client, calls } = scriptedClient([{ status: 422 }]);
    await expect(run(client.get("/x.json"))).rejects.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("backoff is bounded and honours Retry-After", () => {
    expect(backoffDelay(0, { headers: { "retry-after": "1.5" } })).toBe(1500);
    expect(backoffDelay(10, undefined)).toBeLessThanOrEqual(8000);
    expect(backoffDelay(0, undefined)).toBeGreaterThanOrEqual(250);
  });
});

describe("GraphQL", () => {
  const throttled = {
    errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    extensions: { cost: { requestedQueryCost: 101, throttleStatus: { currentlyAvailable: 1, restoreRate: 50 } } },
  };

  it("returns data and posts to /graphql.json", async () => {
    const { client, calls } = scriptedClient([{ data: { data: { shop: { name: "S" } } } }]);
    expect(await run(shopifyGraphql(client, "{ shop { name } }", {}, { idempotent: true }))).toEqual({ shop: { name: "S" } });
    expect(calls[0].url).toBe("/graphql.json");
    expect(JSON.parse(calls[0].data)).toEqual({ query: "{ shop { name } }", variables: {} });
  });

  it("waits for restored cost and retries THROTTLED, even for mutations", async () => {
    const { client, calls } = scriptedClient([{ data: throttled }, { data: { data: { ok: 1 } } }]);
    expect(await run(shopifyGraphql(client, "mutation { x }"))).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
    expect(throttleWaitMs(throttled)).toBe(2000);
  });

  it("gives up after repeated throttling", async () => {
    const { client } = scriptedClient([{ data: throttled }, { data: throttled }, { data: throttled }, { data: throttled }]);
    await expect(run(shopifyGraphql(client, "q"))).rejects.toMatchObject({ code: "THROTTLED" });
  });

  it("does not retry a mutation after a transport failure", async () => {
    const { client, calls } = scriptedClient([{ status: 502 }, { data: { data: {} } }]);
    await expect(run(shopifyGraphql(client, "mutation { x }"))).rejects.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it("does retry an idempotent query after a transport failure", async () => {
    const { client, calls } = scriptedClient([{ status: 502 }, { data: { data: { ok: 1 } } }]);
    expect(await run(shopifyGraphql(client, "{ x }", {}, { idempotent: true }))).toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });

  it("throws on top-level errors (e.g. missing scope)", async () => {
    const { client } = scriptedClient([{ data: { errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] } }]);
    await expect(run(shopifyGraphql(client, "q"))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("assertNoUserErrors surfaces validation failures", () => {
    expect(() => assertNoUserErrors({ userErrors: [{ field: ["title"], message: "Title can't be blank" }] }, "productCreate"))
      .toThrow(ShopifyGraphQLError);
    expect(assertNoUserErrors({ product: { id: "x" }, userErrors: [] }, "op")).toEqual({ product: { id: "x" }, userErrors: [] });
  });

  it("gidToId extracts numeric IDs", () => {
    expect(gidToId("gid://shopify/Product/123")).toBe("123");
    expect(gidToId("gid://shopify/ProductVariant/9?x=1")).toBe("9");
    expect(gidToId(undefined)).toBe(null);
  });
});

describe("inventory levels", () => {
  it("batches item ids by 50 and follows pagination", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => i + 1);
    const { client, calls } = scriptedClient([
      { data: { inventory_levels: [{ inventory_item_id: 1 }] }, headers: { link: '<https://test-store.myshopify.com/admin/api/2026-07/inventory_levels.json?page_info=abc>; rel="next"' } },
      { data: { inventory_levels: [{ inventory_item_id: 2 }] } },
      { data: { inventory_levels: [{ inventory_item_id: 51 }] } },
      { data: { inventory_levels: [{ inventory_item_id: 101 }] } },
    ]);

    const levels = await run(Getinventory(client, ids));
    expect(levels.map((l) => l.inventory_item_id)).toEqual([1, 2, 51, 101]);
    expect(calls).toHaveLength(4);
    expect(calls[0].params.inventory_item_ids.split(",")).toHaveLength(50);
    expect(calls[1].url).toContain("page_info=abc");
    expect(calls[2].params.inventory_item_ids.split(",")).toHaveLength(50);
    expect(calls[3].params.inventory_item_ids.split(",")).toHaveLength(20);
  });

  it("makes no request for an empty list", async () => {
    const { client, calls } = scriptedClient([]);
    expect(await run(Getinventory(client, []))).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
