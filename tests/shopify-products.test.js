import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Product";
import Shopifystore from "@/models/ShopifyStore";
import { createClient } from "@/lib/shopify/client";
import { fetchProduct, fetchProductsPage, toRestProduct } from "@/lib/shopify/products";
import { syncProducts } from "@/lib/shopify/syncProduct";
import { linkStore } from "@/lib/shopify/stores";
import { createUser, resetDatabase } from "./helpers/db";
import { fakeShopify, shopifyProduct, toGraphqlProduct } from "./helpers/fakeShopify";

describe("GraphQL product reads", () => {
  it("convert to the REST product shape used by sync and webhooks", () => {
    const rest = toRestProduct({
      legacyResourceId: "123",
      title: "Mug",
      handle: "mug",
      descriptionHtml: "<p>Hi</p>",
      vendor: "Acme",
      productType: "Kitchen",
      status: "ACTIVE",
      tags: ["a", "b"],
      updatedAt: "2026-11-01T00:00:00Z",
      variants: {
        nodes: [
          { legacyResourceId: "9", title: "Default", sku: "M-1", barcode: null, price: "5.00", compareAtPrice: null, inventoryPolicy: "DENY", position: 1, inventoryItem: { legacyResourceId: "77", tracked: true } },
          { legacyResourceId: "10", title: "Big", sku: "M-2", barcode: null, price: "7.00", compareAtPrice: "9.00", inventoryPolicy: "CONTINUE", position: 2, inventoryItem: { legacyResourceId: "78", tracked: false } },
        ],
      },
      media: { nodes: [{ id: "gid://shopify/MediaImage/555", alt: "Front", image: { url: "https://cdn.shopify.com/m.png", altText: "" } }, {}] },
    });

    expect(rest).toMatchObject({
      id: "123",
      body_html: "<p>Hi</p>",
      product_type: "Kitchen",
      status: "active",
      tags: "a, b",
      updated_at: "2026-11-01T00:00:00Z",
      images: [{ id: "555", src: "https://cdn.shopify.com/m.png", alt: "Front" }],
    });
    expect(rest.variants).toEqual([
      { id: "9", title: "Default", sku: "M-1", barcode: null, price: "5.00", compare_at_price: null, inventory_item_id: "77", inventory_management: "shopify", inventory_policy: "deny", position: 1 },
      { id: "10", title: "Big", sku: "M-2", barcode: null, price: "7.00", compare_at_price: "9.00", inventory_item_id: "78", inventory_management: null, inventory_policy: "continue", position: 2 },
    ]);
  });

  it("page through products by cursor", async () => {
    const products = Array.from({ length: 7 }, (_, i) => shopifyProduct(i + 1));
    const client = fakeShopify({ products, pageSize: 3 });
    const titles = [];
    let cursor = null;
    let pages = 0;
    do {
      const page = await fetchProductsPage(client, cursor);
      titles.push(...page.products.map((p) => p.title));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(titles).toEqual(products.map((p) => p.title));
  });

  it("fetch the remaining variants of a product with more than one page", async () => {
    const node = toGraphqlProduct(shopifyProduct(1));
    node.variants.pageInfo = { hasNextPage: true, endCursor: "c1" };
    const calls = [];
    const client = {
      async post(_url, body) {
        calls.push(body.variables);
        if (body.query.includes("SmartSellProductVariants")) {
          return {
            data: {
              data: {
                product: {
                  variants: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [{ legacyResourceId: "99", title: "Extra", price: "1.00", inventoryItem: { legacyResourceId: "990", tracked: true } }],
                  },
                },
              },
            },
          };
        }
        return { data: { data: { product: node } } };
      },
    };
    const product = await fetchProduct(client, "1");
    expect(product.variants.map((v) => v.id)).toEqual(["10", "99"]);
    expect(calls[1]).toEqual({ id: "gid://shopify/Product/1", after: "c1" });
  });

  it("returns null for a product that no longer exists", async () => {
    expect(await fetchProduct(fakeShopify({ products: [] }), "42")).toBeNull();
  });
});

describe("product sync uses GraphQL, not the deprecated REST product endpoint", () => {
  beforeEach(async () => {
    await resetDatabase();
    await Promise.all([Product.syncIndexes(), Shopifystore.init()]);
  });

  it("imports every page and never calls /products.json", async () => {
    const user = await createUser();
    const store = await linkStore({ userId: user._id, shop: "gql-sync.myshopify.com", accessToken: "t", scope: "" });
    const client = fakeShopify({ products: Array.from({ length: 5 }, (_, i) => shopifyProduct(i + 1)), pageSize: 2 });

    const result = await syncProducts(client, store);
    expect(result.count).toBe(5);
    expect(await Product.countDocuments({ shopifyStore: store._id })).toBe(5);
    expect(client.calls.some((c) => c.url?.includes("products.json"))).toBe(false);
    expect(client.calls.filter((c) => c.query === "SmartSellProducts")).toHaveLength(3);
    expect(result.inventoryItems.get("100")).toEqual({ productId: "1", variantId: "10" });
  });
});

describe("Shopify HTTP client safeguards", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never sends the access token to another host", async () => {
    const client = createClient("safe-store", "secret-token");
    const adapter = vi.fn(async (config) => ({ data: {}, status: 200, statusText: "", headers: {}, config }));
    client.defaults.adapter = adapter;

    await expect(client.get("https://evil.example/admin/api/2026-07/products.json?page_info=x")).rejects.toThrow(/another host/);
    await expect(client.get("https://safe-store.myshopify.com.evil.example/x")).rejects.toThrow(/another host/);
    expect(adapter).not.toHaveBeenCalled();

    await client.get("https://safe-store.myshopify.com/admin/api/2026-07/orders.json?page_info=abc");
    await client.get("/shop.json");
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it("warns once when Shopify serves a different API version", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = createClient("version-store", "t");
    client.defaults.adapter = async (config) => ({ data: {}, status: 200, statusText: "", headers: { "x-shopify-api-version": "2099-01" }, config });
    await client.get("/shop.json");
    await client.get("/shop.json");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ level: "warn", event: "shopify_api_version_mismatch", requested: "2026-07", served: "2099-01" });
  });
});
