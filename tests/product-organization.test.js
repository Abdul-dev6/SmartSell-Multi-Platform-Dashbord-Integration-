import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Product";
import Shopifystore from "@/models/ShopifyStore";
import WebhookEvent from "@/models/WebhookEvent";
import { linkStore } from "@/lib/shopify/stores";
import { validateProductInput } from "@/lib/products/validation";
import { mapShopifyProduct, syncProducts, upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { collectionTitleQuery } from "@/lib/shopify/catalogOptions";
import { hasScope, missingPublicationScopes } from "@/lib/shopify/scopes";
import { EMPTY_FORM, buildProductPayload, formFromProduct } from "@/components/dashboard/listing-form/payload";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { FAKE_COLLECTIONS, fakeShopifyStore, shopifyProduct } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/shopify/client", () => ({ createClient: () => shopify.current }));

const { createProduct, updateProduct, retryProduct, toClientProduct } = await import("@/lib/products/service");
const { GET: categoriesRoute } = await import("@/app/api/shopify/options/categories/route");
const { GET: collectionsRoute } = await import("@/app/api/shopify/options/collections/route");
const { GET: publicationsRoute } = await import("@/app/api/shopify/options/publications/route");
const { POST: createRoute } = await import("@/app/api/products/route");
const { POST: webhook } = await import("@/app/api/shopify/webhooks/route");

const BASE = "http://localhost:3000";
const ONLINE = "gid://shopify/Publication/11";
const POS = "gid://shopify/Publication/12";
const MUGS = "gid://shopify/TaxonomyCategory/hg-11-10-12";
const [SUMMER, KITCHEN, AUTO] = FAKE_COLLECTIONS.map((c) => c.id);
let keySeq = 0;

const create = (overrides = {}) =>
  validateProductInput({ idempotencyKey: `key-org-${String(++keySeq).padStart(6, "0")}`, title: "Mug", price: "9.00", status: "draft", ...overrides }, { mode: "create" });
const update = (body) => validateProductInput(body, { mode: "update" });

async function setup(scope = "write_products", products = []) {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: `s${Math.floor(Math.random() * 1e9)}.myshopify.com`, accessToken: "t", scope });
  shopify.current = fakeShopifyStore({ products });
  return { user, store };
}
const WITH_CHANNELS = "write_products,write_publications";
const live = () => shopify.current.state.products.at(-1);
const writes = () => shopify.current.state.mutations.filter((m) => !String(m).startsWith("read"));
const get = (handler, path, user) => handler(new NextRequest(`${BASE}${path}`, { headers: user ? { cookie: sessionCookieFor(user) } : {} }));

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Product.syncIndexes(), Shopifystore.init(), WebhookEvent.syncIndexes()]);
});

describe("validation", () => {
  it("accepts category, collections, sales channels, shipping and every Shopify status", () => {
    const { value, errors } = create({
      category: MUGS,
      collections: [SUMMER, KITCHEN, SUMMER],
      publications: [ONLINE],
      requiresShipping: true,
      weight: "0.45",
      weightUnit: "kilograms",
      hsCode: "6912.00",
      countryOfOrigin: "pk",
    });
    expect(errors).toEqual({});
    expect(value).toMatchObject({
      category: MUGS,
      collections: [SUMMER, KITCHEN],
      publications: [ONLINE],
      shipping: { requiresShipping: true, weight: { value: 0.45, unit: "KILOGRAMS" }, harmonizedSystemCode: "691200", countryCodeOfOrigin: "PK" },
    });
    for (const status of ["active", "draft", "archived", "unlisted"]) {
      expect(update({ status }).value.status).toBe(status.toUpperCase());
    }
  });

  it("rejects malformed ids, values and units", () => {
    const { errors } = create({
      category: "Mugs",
      collections: ["gid://shopify/Product/1"],
      publications: "online",
      weight: "-1",
      hsCode: "12",
      countryOfOrigin: "ZZ",
      requiresShipping: "yes",
      status: "hidden",
    });
    expect(Object.keys(errors).sort()).toEqual(["category", "collections", "countryOfOrigin", "hsCode", "publications", "requiresShipping", "status", "weight"]);
    expect(create({ weight: "1", weightUnit: "stone" }).errors.weightUnit).toBeTruthy();
    expect(create({ collections: Array.from({ length: 251 }, (_, i) => `gid://shopify/Collection/${i + 1}`) }).errors.collections).toMatch(/at most 250/);
  });

  it("clears the category on edit with null or empty, and accepts physicalProduct as the shipping flag", () => {
    expect(update({ category: null }).value.category).toBeNull();
    expect(update({ category: "" }).value.category).toBeNull();
    expect(create({ category: "" }).value.category).toBeUndefined();
    expect(update({ physicalProduct: false }).value.shipping).toEqual({ requiresShipping: false });
  });

  it("no longer reports category, collection, weight or HS code as not sent", () => {
    const { notSent } = create({ category: MUGS, weight: "1", weightUnit: "GRAMS", hsCode: "691200", length: "3", cost: "1" });
    expect([...notSent].sort()).toEqual(["cost per item", "package dimensions"]);
  });
});

describe("permissions", () => {
  it("write implies read; sales channels need read_ and write_publications", () => {
    expect(hasScope({ scope: "write_products" }, "read_products")).toBe(true);
    expect(missingPublicationScopes({ scope: "write_products" })).toEqual(["read_publications", "write_publications"]);
    expect(missingPublicationScopes({ scope: "write_products,write_publications" })).toEqual([]);
  });
});

describe("option endpoints", () => {
  it("require a session", async () => {
    for (const handler of [categoriesRoute, collectionsRoute, publicationsRoute]) {
      expect((await get(handler, "/api/x?q=mug")).status).toBe(401);
    }
  });

  it("search the live taxonomy (archived categories left out) and validate the search", async () => {
    const { user } = await setup();
    const res = await get(categoriesRoute, "/api/shopify/options/categories?q=mug", user);
    const body = await res.json();
    expect(body.categories.map((c) => c.name)).toEqual(["Mugs", "Mug Trees"]);
    expect(body.categories[0]).toEqual({ id: MUGS, name: "Mugs", fullName: expect.stringContaining("Drinkware"), isLeaf: true });
    expect((await get(categoriesRoute, "/api/shopify/options/categories?q=m", user)).status).toBe(400);
  });

  it("list the store's collections with automated ones marked, search and paginate", async () => {
    const { user } = await setup();
    let body = await (await get(collectionsRoute, "/api/shopify/options/collections", user)).json();
    expect(body.collections.map((c) => [c.title, c.manual])).toEqual([["Summer", true], ["Kitchen", true], ["On sale (auto)", false]]);
    body = await (await get(collectionsRoute, "/api/shopify/options/collections?q=kit", user)).json();
    expect(body.collections.map((c) => c.title)).toEqual(["Kitchen"]);

    shopify.current.state.collections = Array.from({ length: 60 }, (_, i) => ({ id: `gid://shopify/Collection/${100 + i}`, title: `C${i}`, handle: `c${i}`, manual: true }));
    body = await (await get(collectionsRoute, "/api/shopify/options/collections", user)).json();
    expect(body.collections).toHaveLength(50);
    const next = await (await get(collectionsRoute, `/api/shopify/options/collections?after=${body.nextCursor}`, user)).json();
    expect(next.collections).toHaveLength(10);
    expect(next.nextCursor).toBeNull();
    expect((await get(collectionsRoute, "/api/shopify/options/collections?after=%7Bbad%7D", user)).status).toBe(400);
  });

  it("collection search cannot inject Shopify search operators", () => {
    expect(collectionTitleQuery("summer sale")).toBe("title:summer* title:sale*");
    expect(collectionTitleQuery('x OR (status:"draft") -y')).toBe("title:x* title:OR* title:statusdraft* title:-y*");
    expect(collectionTitleQuery("  ")).toBeNull();
  });

  it("sales channels: report missing permissions instead of calling Shopify; list them when granted", async () => {
    const { user } = await setup("write_products");
    let body = await (await get(publicationsRoute, "/api/shopify/options/publications", user)).json();
    expect(body).toEqual({ success: true, available: false, missingScopes: ["read_publications", "write_publications"], publications: [] });
    expect(shopify.current.state.mutations).not.toContain("read:Publications");

    const granted = await setup(WITH_CHANNELS);
    body = await (await get(publicationsRoute, "/api/shopify/options/publications", granted.user)).json();
    expect(body.available).toBe(true);
    expect(body.publications).toEqual([{ id: ONLINE, name: "Online Store" }, { id: POS, name: "Point of Sale" }]);
  });

  it("only use a store the user owns, and map Shopify access errors", async () => {
    const { user } = await setup();
    const other = await setup();
    const res = await get(collectionsRoute, `/api/shopify/options/collections?storeId=${other.store._id}`, user);
    expect(res.status).toBe(404);

    shopify.current.state.failNext.Collections = "accessDenied";
    const denied = await get(collectionsRoute, "/api/shopify/options/collections", other.user);
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("missing_permission");
  });
});

describe("create", () => {
  it("sends category, collections and shipping in productSet and stores what Shopify saved", async () => {
    const { user } = await setup();
    const { value } = create({ category: MUGS, collections: [SUMMER], requiresShipping: true, weight: "250", weightUnit: "GRAMS", hsCode: "691200", countryOfOrigin: "PK" });
    const { product } = await createProduct(user._id, value);

    const input = shopify.current.state.inputs.productSet[0].input;
    expect(input).toMatchObject({ category: MUGS, collections: [SUMMER] });
    expect(input.variants[0].inventoryItem).toEqual({
      requiresShipping: true,
      measurement: { weight: { value: 250, unit: "GRAMS" } },
      harmonizedSystemCode: "691200",
      countryCodeOfOrigin: "PK",
    });

    const doc = await Product.findById(product._id).lean();
    expect(doc.category).toMatchObject({ id: MUGS, name: "Mugs" });
    expect(doc.collections).toEqual([{ id: SUMMER, title: "Summer", manual: true }]);
    expect(toClientProduct(doc).shipping).toEqual({ requiresShipping: true, weight: 250, weightUnit: "GRAMS", countryCodeOfOrigin: "PK", harmonizedSystemCode: "691200" });
    expect(doc.publishedOnKnown).toBe(false); // no read_publications
  });

  it("refuses sales channels without the permission, before creating anything", async () => {
    const { user } = await setup("write_products");
    await expect(createProduct(user._id, create({ publications: [ONLINE] }).value)).rejects.toMatchObject({
      status: 403,
      code: "missing_scope",
      missingScopes: ["read_publications", "write_publications"],
    });
    expect(writes()).toEqual([]);
    expect(await Product.countDocuments()).toBe(0);
  });

  it("publishes to the chosen sales channels after creating", async () => {
    const { user } = await setup(WITH_CHANNELS);
    const { status, product } = await createProduct(user._id, create({ publications: [ONLINE, POS] }).value);
    expect(status).toBe(201);
    expect(writes()).toEqual(["productSet", "publishablePublish"]);
    const doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ publishedOn: [ONLINE, POS], publishedOnKnown: true, syncStatus: "synced" });
  });

  it("keeps the product if publishing fails, reports it, and a retry publishes", async () => {
    const { user } = await setup(WITH_CHANNELS);
    shopify.current.state.failNext.publishablePublish = "userErrors";
    const result = await createProduct(user._id, create({ publications: [ONLINE] }).value);
    expect(result).toMatchObject({ status: 201, partial: "publications" });
    let doc = await Product.findById(result.product._id).lean();
    expect(doc).toMatchObject({ syncStatus: "failed", pendingOperation: { type: "update", input: { publications: [ONLINE] } } });
    expect(doc.shopifyProductId).toBeTruthy();
    expect(shopify.current.state.products).toHaveLength(1);

    await retryProduct(user._id, result.product._id);
    doc = await Product.findById(result.product._id).lean();
    expect(doc).toMatchObject({ syncStatus: "synced", publishedOn: [ONLINE] });
    expect(doc.pendingOperation).toBeUndefined();
    expect(shopify.current.state.products).toHaveLength(1);
  });

  it("the create route reports the partial result", async () => {
    const { user } = await setup(WITH_CHANNELS);
    shopify.current.state.failNext.publishablePublish = "userErrors";
    const res = await createRoute(new NextRequest(`${BASE}/api/products`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookieFor(user) },
      body: JSON.stringify({ idempotencyKey: "key-route-partial", title: "Mug", price: "9.00", publications: [ONLINE] }),
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).partial).toBe("publications");
  });
});

describe("update", () => {
  async function created(scope = WITH_CHANNELS, overrides = {}) {
    const ctx = await setup(scope);
    const { product } = await createProduct(ctx.user._id, create(overrides).value);
    shopify.current.state.mutations.length = 0;
    shopify.current.state.inputs = {};
    return { ...ctx, product };
  }

  it("sets and clears the category", async () => {
    const { user, product } = await created();
    await updateProduct(user._id, product._id, update({ category: MUGS }).value);
    expect((await Product.findById(product._id).lean()).category.id).toBe(MUGS);
    await updateProduct(user._id, product._id, update({ category: null }).value);
    expect((await Product.findById(product._id).lean()).category).toBeNull();
    expect(shopify.current.state.inputs.productUpdate.map((v) => v.product.category)).toEqual([MUGS, null]);
  });

  it("joins and leaves collections relative to Shopify's live state, never touching automated ones", async () => {
    const { user, product } = await created("write_products", { collections: [SUMMER] });
    // Changed in Shopify meanwhile: added to Kitchen (manual) and matched by the automated rule.
    live().collections.push({ ...FAKE_COLLECTIONS[1] }, { ...FAKE_COLLECTIONS[2] });

    await updateProduct(user._id, product._id, update({ collections: [KITCHEN] }).value);
    const input = shopify.current.state.inputs.productUpdate[0].product;
    expect(input.collectionsToJoin).toBeUndefined();
    expect(input.collectionsToLeave).toEqual([SUMMER]);
    const doc = await Product.findById(product._id).lean();
    expect(doc.collections.map((c) => c.id).sort()).toEqual([KITCHEN, AUTO].sort());

    // Repeating the same edit sends nothing.
    shopify.current.state.mutations.length = 0;
    await updateProduct(user._id, product._id, update({ collections: [KITCHEN] }).value);
    expect(writes()).toEqual([]);
  });

  it("saves shipping on the variant's inventory item", async () => {
    const { user, product } = await created();
    await updateProduct(user._id, product._id, update({ requiresShipping: false, weight: "2", weightUnit: "POUNDS" }).value);
    const variant = shopify.current.state.inputs.productVariantsBulkUpdate[0].variants[0];
    expect(variant.inventoryItem).toEqual({ requiresShipping: false, measurement: { weight: { value: 2, unit: "POUNDS" } } });
    expect(toClientProduct(await Product.findById(product._id).lean()).shipping).toMatchObject({ requiresShipping: false, weight: 2, weightUnit: "POUNDS" });
  });

  it("refuses shipping edits on multi-variant products", async () => {
    const ctx = await setup("write_products", [shopifyProduct(5, { variants: [{ id: 50, inventory_item_id: 500 }, { id: 51, inventory_item_id: 510 }] })]);
    await syncProducts(shopify.current, ctx.store);
    const doc = await Product.findOne({ shopifyProductId: "5" });
    await expect(updateProduct(ctx.user._id, doc._id, update({ weight: "1", weightUnit: "GRAMS" }).value)).rejects.toMatchObject({ code: "multiple_variants" });
  });

  it("publishes and unpublishes to match the chosen channels; status stays separate", async () => {
    const { user, product } = await created(WITH_CHANNELS, { publications: [ONLINE] });
    await updateProduct(user._id, product._id, update({ publications: [POS] }).value);
    expect(writes()).toEqual(["publishablePublish", "publishableUnpublish"]);
    expect(shopify.current.state.inputs.publishablePublish[0].input).toEqual([{ publicationId: POS }]);
    expect(shopify.current.state.inputs.publishableUnpublish[0].input).toEqual([{ publicationId: ONLINE }]);

    // Changing status does not touch publications.
    shopify.current.state.mutations.length = 0;
    await updateProduct(user._id, product._id, update({ status: "archived" }).value);
    expect(writes()).toEqual(["productUpdate"]);
    expect(await Product.findById(product._id).lean()).toMatchObject({ status: "archived", publishedOn: [POS] });
  });

  it("refuses channel changes without the permission, before sending anything", async () => {
    const { user, product } = await created("write_products");
    await expect(updateProduct(user._id, product._id, update({ title: "New", publications: [ONLINE] }).value)).rejects.toMatchObject({ code: "missing_scope" });
    expect(writes()).toEqual([]);
    expect(live().title).toBe("Mug");
  });

  it("a partial failure is recorded, and the retry completes without repeating what applied", async () => {
    const { user, product } = await created(WITH_CHANNELS);
    shopify.current.state.failNext.publishablePublish = "http500";
    await expect(updateProduct(user._id, product._id, update({ title: "Renamed", publications: [ONLINE] }).value)).rejects.toMatchObject({ code: "outcome_unknown" });
    let doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ syncStatus: "failed", title: "Renamed" }); // the title change applied
    expect(doc.publishedOn).toEqual([]);

    shopify.current.state.mutations.length = 0;
    await retryProduct(user._id, product._id);
    expect(writes()).toEqual(["productUpdate", "publishablePublish"]);
    doc = await Product.findById(product._id).lean();
    expect(doc).toMatchObject({ syncStatus: "synced", publishedOn: [ONLINE] });
  });
});

describe("Shopify → MongoDB", () => {
  it("a full sync stores category, collections and shipping; sales channels only with the permission", async () => {
    const products = [
      shopifyProduct(1, {
        category: { admin_graphql_api_id: MUGS, name: "Mugs", full_name: "Home > Mugs" },
        collections: [{ id: SUMMER, title: "Summer" }, { id: AUTO, title: "Auto", manual: false }],
        published_publication_ids: [ONLINE],
        variants: [{ id: 10, inventory_item_id: 100, requires_shipping: false, weight: 3, weight_unit: "OUNCES" }],
      }),
    ];
    const without = await setup("write_products", products);
    await syncProducts(shopify.current, without.store);
    let doc = await Product.findOne({ shopifyStore: without.store._id }).lean();
    expect(doc.category).toEqual({ id: MUGS, name: "Mugs", fullName: "Home > Mugs" });
    expect(doc.collections).toEqual([{ id: SUMMER, title: "Summer", manual: true }, { id: AUTO, title: "Auto", manual: false }]);
    expect(doc.variantShipping["10"]).toMatchObject({ requiresShipping: false, weight: 3, weightUnit: "OUNCES" });
    expect(doc.publishedOnKnown).toBe(false);

    const withChannels = await setup(WITH_CHANNELS, products);
    await syncProducts(shopify.current, withChannels.store);
    doc = await Product.findOne({ shopifyStore: withChannels.store._id }).lean();
    expect(doc).toMatchObject({ publishedOn: [ONLINE], publishedOnKnown: true });
  });

  it("a webhook payload without those fields keeps them, and the re-read from Shopify updates them", async () => {
    const product = shopifyProduct(7, { collections: [{ id: SUMMER, title: "Summer" }], variants: [{ id: 70, inventory_item_id: 700, requires_shipping: true, weight: 1, weight_unit: "KILOGRAMS" }] });
    const { store } = await setup("write_products", [product]);
    await syncProducts(shopify.current, store);

    // Weight changed in Shopify admin; the webhook payload has no shipping or collections.
    shopify.current.state.products[0].variants[0].weight = 2.5;
    const payload = { ...structuredClone(product), updated_at: "2026-10-05T00:00:00Z", variants: [{ id: 70, inventory_item_id: 700, price: "10.00", title: "Default" }] };
    delete payload.collections;
    shopify.current.state.products[0].updated_at = "2026-10-05T00:00:00Z";
    const body = JSON.stringify(payload);
    const res = await webhook(new NextRequest(`${BASE}/api/shopify/webhooks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": crypto.createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET).update(body).digest("base64"),
        "x-shopify-topic": "products/update",
        "x-shopify-shop-domain": store.shop,
        "x-shopify-webhook-id": crypto.randomUUID(),
      },
      body,
    }));
    expect(res.status).toBe(200);
    const doc = await Product.findOne({ shopifyProductId: "7" }).lean();
    expect(doc.collections).toEqual([{ id: SUMMER, title: "Summer", manual: true }]);
    expect(doc.variantShipping["70"].weight).toBe(2.5);
  });

  it("a payload with an unrecognised category shape never clears the stored category", async () => {
    const { store } = await setup();
    await upsertShopifyProducts(store, [shopifyProduct(8, { category: { admin_graphql_api_id: MUGS, name: "Mugs", full_name: "Mugs" } })]);
    expect(mapShopifyProduct({ ...shopifyProduct(8), category: { something: "else" } }).category).toBeUndefined();
    expect(mapShopifyProduct({ ...shopifyProduct(8), category: null }).category).toBeNull();
    await upsertShopifyProducts(store, [{ ...shopifyProduct(8, { updated_at: "2026-10-02T00:00:00Z" }), category: { something: "else" } }]);
    expect((await Product.findOne({ shopifyProductId: "8" }).lean()).category.id).toBe(MUGS);
  });
});

describe("form payload", () => {
  const product = {
    title: "Mug", status: "active", tags: [], price: "9.00",
    category: { id: MUGS, name: "Mugs", fullName: "Home > Mugs" },
    collections: [{ id: SUMMER, title: "Summer", manual: true }, { id: KITCHEN, title: "Kitchen", manual: true }],
    publishedOn: [ONLINE], publishedOnKnown: true,
    shipping: { requiresShipping: true, weight: 1.5, weightUnit: "POUNDS", countryCodeOfOrigin: "PK", harmonizedSystemCode: "691200" },
  };

  it("maps a product to the form", () => {
    expect(formFromProduct(product)).toMatchObject({
      category: product.category, publications: [ONLINE], publicationsKnown: true,
      requiresShipping: true, weight: "1.5", weightUnit: "POUNDS", countryOfOrigin: "PK", hsCode: "691200",
    });
  });

  it("create sends chosen values only, ids for selections, weight with its unit", () => {
    const form = { ...EMPTY_FORM, title: "Mug", price: "9", category: product.category, collections: product.collections, weight: "2", weightUnit: "GRAMS" };
    const payload = buildProductPayload(form, EMPTY_FORM, { isEdit: false, channelsAvailable: true, idempotencyKey: "k" });
    expect(payload).toMatchObject({ category: MUGS, collections: [SUMMER, KITCHEN], weight: "2", weightUnit: "GRAMS", requiresShipping: true, idempotencyKey: "k" });
    expect(payload).not.toHaveProperty("publications"); // none chosen

    const blank = buildProductPayload({ ...EMPTY_FORM, title: "Mug" }, EMPTY_FORM, { isEdit: false, channelsAvailable: true });
    expect(blank).not.toHaveProperty("category");
    expect(blank).not.toHaveProperty("collections");
  });

  it("edit sends only changes; selection order does not count; cleared category is sent", () => {
    const baseline = formFromProduct(product);
    const opts = { isEdit: true, channelsAvailable: true };
    expect(buildProductPayload({ ...baseline, collections: [...baseline.collections].reverse() }, baseline, opts)).toEqual({});
    expect(buildProductPayload({ ...baseline, category: null }, baseline, opts)).toEqual({ category: "" });
    expect(buildProductPayload({ ...baseline, weightUnit: "KILOGRAMS" }, baseline, opts)).toEqual({ weight: "1.5", weightUnit: "KILOGRAMS" });
    expect(buildProductPayload({ ...baseline, publications: [] }, baseline, opts)).toEqual({ publications: [] });
  });

  it("leaves out sales channels when unavailable, shipping for multi-variant products, weight for non-physical", () => {
    const baseline = formFromProduct(product);
    const changed = { ...baseline, publications: [], weight: "3" };
    expect(buildProductPayload(changed, baseline, { isEdit: true, channelsAvailable: false })).toEqual({ weight: "3", weightUnit: "POUNDS" });
    expect(buildProductPayload(changed, baseline, { isEdit: true, channelsAvailable: false, shippingEditable: false })).toEqual({});
    expect(buildProductPayload({ ...baseline, requiresShipping: false, weight: "3" }, baseline, { isEdit: true })).toEqual({ requiresShipping: false });
  });
});
