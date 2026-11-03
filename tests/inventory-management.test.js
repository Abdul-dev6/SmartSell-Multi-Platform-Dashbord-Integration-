import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Product from "@/models/Product";
import Inventory from "@/models/Inventory";
import Shopifystore from "@/models/ShopifyStore";
import { linkStore } from "@/lib/shopify/stores";
import { validateProductInput } from "@/lib/products/validation";
import { syncProducts } from "@/lib/shopify/syncProduct";
import { planInventory } from "@/lib/shopify/inventoryWrite";
import { EMPTY_FORM, buildProductPayload, formFromProduct } from "@/components/dashboard/listing-form/payload";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { fakeShopifyStore, shopifyProduct } from "./helpers/fakeShopify";

const shopify = vi.hoisted(() => ({ current: null }));
vi.mock("@/lib/shopify/client", () => ({ createClient: () => shopify.current }));

const { createProduct, updateProduct, retryProduct } = await import("@/lib/products/service");
const { GET: locationsRoute } = await import("@/app/api/shopify/options/locations/route");
const { GET: productRoute } = await import("@/app/api/products/[id]/route");

const BASE = "http://localhost:3000";
const MAIN = "7001";
const WAREHOUSE = "7002";
const LOCATIONS = [
  { id: MAIN, name: "Main store", active: true },
  { id: WAREHOUSE, name: "Warehouse", active: true },
  { id: "7003", name: "Closed shop", active: false },
];
const WITH_STOCK = "write_products,write_inventory";
let seq = 0;

const create = (overrides = {}) =>
  validateProductInput({ idempotencyKey: `key-inv-${String(++seq).padStart(6, "0")}`, title: "Mug", price: "9.00", status: "draft", ...overrides }, { mode: "create" });
const update = (body) => validateProductInput(body, { mode: "update" });
const writes = () => shopify.current.state.mutations.filter((m) => !String(m).startsWith("read"));
const stock = () => Object.fromEntries(shopify.current.state.inventory);

async function setup(scope = WITH_STOCK) {
  const user = await createUser();
  const store = await linkStore({ userId: user._id, shop: `s${Math.floor(Math.random() * 1e9)}.myshopify.com`, accessToken: "t", scope });
  await Shopifystore.updateOne({ _id: store._id }, { $set: { locations: LOCATIONS } });
  shopify.current = fakeShopifyStore();
  return { user, store };
}

// A product created in SmartSell with stock 5 at the main store.
async function stocked(scope = WITH_STOCK) {
  const ctx = await setup(scope);
  const { product } = await createProduct(ctx.user._id, create({ inventory: [{ locationId: MAIN, available: 5 }] }).value);
  shopify.current.state.mutations.length = 0;
  shopify.current.state.inputs = {};
  return { ...ctx, product, itemId: product.variants[0].inventoryItemId };
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([Product.syncIndexes(), Inventory.syncIndexes(), Shopifystore.init()]);
});

describe("validation", () => {
  it("accepts stock per location (numeric or Shopify location IDs) and the tracking switch", () => {
    const { value, errors } = create({
      inventory: [{ locationId: MAIN, available: "12", expected: 10 }, { locationId: `gid://shopify/Location/${WAREHOUSE}`, available: 0 }],
      trackInventory: true,
    });
    expect(errors).toEqual({});
    expect(value.inventory).toEqual([{ locationId: MAIN, available: 12, expected: 10 }, { locationId: WAREHOUSE, available: 0, expected: null }]);
    expect(value.trackInventory).toBe(true);
  });

  it("rejects fractions, repeated or invalid locations, and non-boolean tracking", () => {
    expect(create({ inventory: [{ locationId: MAIN, available: "1.5" }] }).errors.inventory).toMatch(/whole numbers/);
    expect(create({ inventory: [{ locationId: MAIN, available: 1 }, { locationId: MAIN, available: 2 }] }).errors.inventory).toMatch(/repeated/);
    expect(create({ inventory: [{ locationId: "warehouse", available: 1 }] }).errors.inventory).toBeTruthy();
    expect(create({ inventory: "5" }).errors.inventory).toBeTruthy();
    expect(create({ trackInventory: "yes" }).errors.trackInventory).toBeTruthy();
  });

  it("stock and tracking are no longer reported as not sent", () => {
    expect(create({ quantity: "3", trackInventory: true }).notSent).toEqual([]);
  });
});

describe("planInventory", () => {
  const live = { tracked: true, levels: new Map([[MAIN, 5]]) };
  it("sets changed stock with the live value as the compare value, skips unchanged, activates new locations", () => {
    expect(planInventory([{ locationId: MAIN, available: 8, expected: 5 }, { locationId: WAREHOUSE, available: 3, expected: null }], live)).toEqual({
      set: [{ locationId: MAIN, quantity: 8, changeFromQuantity: 5 }],
      activate: [{ locationId: WAREHOUSE, available: 3 }],
    });
    expect(planInventory([{ locationId: MAIN, available: 5, expected: 2 }], live)).toEqual({ set: [], activate: [] });
  });
  it("refuses when Shopify's stock moved since the user loaded it", () => {
    expect(() => planInventory([{ locationId: MAIN, available: 8, expected: 6 }], live)).toThrow(/Stock changed/);
  });
});

describe("permission", () => {
  it("locations endpoint lists active locations and says whether stock is editable", async () => {
    const { user } = await setup("write_products");
    const res = await locationsRoute(new NextRequest(`${BASE}/api/shopify/options/locations`, { headers: { cookie: sessionCookieFor(user) } }));
    expect(await res.json()).toEqual({
      success: true,
      editable: false,
      missingScopes: ["write_inventory"],
      locations: [{ id: MAIN, name: "Main store" }, { id: WAREHOUSE, name: "Warehouse" }],
    });
    const granted = await setup(WITH_STOCK);
    const body = await (await locationsRoute(new NextRequest(`${BASE}/api/shopify/options/locations`, { headers: { cookie: sessionCookieFor(granted.user) } }))).json();
    expect(body).toMatchObject({ editable: true, missingScopes: [] });
  });

  it("without write_inventory, stock is refused before anything is created or changed", async () => {
    const { user } = await setup("write_products");
    await expect(createProduct(user._id, create({ inventory: [{ locationId: MAIN, available: 5 }] }).value)).rejects.toMatchObject({
      status: 403,
      code: "missing_scope",
      missingScopes: ["write_inventory"],
    });
    expect(writes()).toEqual([]);
    expect(await Product.countDocuments()).toBe(0);

    const { product } = await createProduct(user._id, create().value);
    shopify.current.state.mutations.length = 0;
    await expect(updateProduct(user._id, product._id, update({ title: "New", trackInventory: false }).value)).rejects.toMatchObject({ code: "missing_scope" });
    expect(writes()).toEqual([]);
  });
});

describe("create with stock", () => {
  it("sets tracking and starting stock in productSet and stores the levels", async () => {
    const { user } = await setup();
    const { product } = await createProduct(user._id, create({ inventory: [{ locationId: MAIN, available: 5 }, { locationId: WAREHOUSE, available: 2 }] }).value);
    const variant = shopify.current.state.inputs.productSet[0].input.variants[0];
    expect(variant.inventoryItem).toMatchObject({ tracked: true });
    expect(variant.inventoryQuantities).toEqual([
      { locationId: `gid://shopify/Location/${MAIN}`, name: "available", quantity: 5 },
      { locationId: `gid://shopify/Location/${WAREHOUSE}`, name: "available", quantity: 2 },
    ]);
    const levels = await Inventory.find({ inventoryItemId: String(product.variants[0].inventoryItemId) }).lean();
    expect(Object.fromEntries(levels.map((l) => [l.locationId, l.available]))).toEqual({ [MAIN]: 5, [WAREHOUSE]: 2 });
  });
});

describe("edit stock", () => {
  it("sets the new quantity with a compare value and an idempotency key, then refreshes SmartSell", async () => {
    const { user, product, itemId } = await stocked();
    await updateProduct(user._id, product._id, update({ inventory: [{ locationId: MAIN, available: 9, expected: 5 }] }).value);
    expect(writes()).toEqual(["inventorySetQuantities"]);
    const vars = shopify.current.state.inputs.inventorySetQuantities[0];
    expect(vars.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(vars.input).toMatchObject({ name: "available", reason: "correction", quantities: [{ quantity: 9, changeFromQuantity: 5 }] });
    expect(stock()[`${itemId}:${MAIN}`]).toBe(9);
    expect((await Inventory.findOne({ inventoryItemId: String(itemId), locationId: MAIN }).lean()).available).toBe(9);
    expect((await Product.findById(product._id).lean()).syncStatus).toBe("synced");
  });

  it("stocks a location the product was not at yet (inventoryActivate)", async () => {
    const { user, product, itemId } = await stocked();
    await updateProduct(user._id, product._id, update({ inventory: [{ locationId: WAREHOUSE, available: 4, expected: null }] }).value);
    expect(writes()).toEqual(["inventoryActivate"]);
    expect(stock()[`${itemId}:${WAREHOUSE}`]).toBe(4);
  });

  it("refuses with the current number when stock changed since loading (e.g. a sale), changing nothing", async () => {
    const { user, product, itemId } = await stocked();
    shopify.current.state.inventory.set(`${itemId}:${MAIN}`, 4); // sold one in Shopify
    await expect(updateProduct(user._id, product._id, update({ title: "Renamed", inventory: [{ locationId: MAIN, available: 9, expected: 5 }] }).value)).rejects.toMatchObject({
      status: 409,
      code: "stock_changed",
      stockChanges: [{ locationId: MAIN, expected: 5, current: 4 }],
    });
    expect(writes()).toEqual([]);
    expect(shopify.current.state.products[0].title).toBe("Mug");
    expect(stock()[`${itemId}:${MAIN}`]).toBe(4);
  });

  it("a sale between SmartSell's check and the write is still caught by Shopify", async () => {
    const { user, product, itemId } = await stocked();
    const realPost = shopify.current.post.bind(shopify.current);
    shopify.current.post = async (url, body) => {
      if (body.query.includes("inventorySetQuantities")) shopify.current.state.inventory.set(`${itemId}:${MAIN}`, 3);
      return realPost(url, body);
    };
    await expect(updateProduct(user._id, product._id, update({ inventory: [{ locationId: MAIN, available: 9, expected: 5 }] }).value)).rejects.toMatchObject({ code: "stock_changed" });
    expect(stock()[`${itemId}:${MAIN}`]).toBe(3);
  });

  it("a lost response is retried safely: the retry sees the stock already applied and sends nothing", async () => {
    const { user, product, itemId } = await stocked();
    shopify.current.state.failNext.inventorySetQuantities = "lostResponse";
    await expect(updateProduct(user._id, product._id, update({ inventory: [{ locationId: MAIN, available: 9, expected: 5 }] }).value)).rejects.toMatchObject({ code: "outcome_unknown" });
    expect(stock()[`${itemId}:${MAIN}`]).toBe(9);

    shopify.current.state.mutations.length = 0;
    await retryProduct(user._id, product._id);
    expect(writes()).toEqual([]);
    expect(await Product.findById(product._id).lean()).toMatchObject({ syncStatus: "synced" });
  });

  it("an unchanged quantity sends nothing; tracking can be switched off", async () => {
    const { user, product } = await stocked();
    await updateProduct(user._id, product._id, update({ inventory: [{ locationId: MAIN, available: 5, expected: 5 }] }).value);
    expect(writes()).toEqual([]);
    await updateProduct(user._id, product._id, update({ trackInventory: false }).value);
    expect(shopify.current.state.inputs.productVariantsBulkUpdate[0].variants[0].inventoryItem).toEqual({ tracked: false });
    expect(shopify.current.state.products[0].variants[0].tracked).toBe(false);
  });

  it("refuses stock edits on multi-variant products", async () => {
    const { user, store } = await setup();
    shopify.current = fakeShopifyStore({ products: [shopifyProduct(5, { variants: [{ id: 50, inventory_item_id: 500 }, { id: 51, inventory_item_id: 510 }] })] });
    await syncProducts(shopify.current, store);
    const doc = await Product.findOne({ shopifyProductId: "5" });
    await expect(updateProduct(user._id, doc._id, update({ inventory: [{ locationId: MAIN, available: 1 }] }).value)).rejects.toMatchObject({ code: "multiple_variants" });
  });

  it("the product endpoint returns current stock per location and the tracking flag", async () => {
    const { user, product } = await stocked();
    const res = await productRoute(new NextRequest(`${BASE}/api/products/${product._id}`, { headers: { cookie: sessionCookieFor(user) } }), { params: Promise.resolve({ id: String(product._id) }) });
    const body = await res.json();
    expect(body.product.trackInventory).toBe(true);
    expect(body.product.inventoryLevels).toEqual([{ locationId: MAIN, available: 5 }]);
  });
});

describe("form payload", () => {
  const product = { title: "Mug", trackInventory: true, inventoryLevels: [{ locationId: MAIN, available: 5 }, { locationId: WAREHOUSE, available: 0 }] };

  it("loads stock into the form", () => {
    expect(formFromProduct(product)).toMatchObject({ trackInventory: true, inventory: { [MAIN]: "5", [WAREHOUSE]: "0" }, inventoryExpected: { [MAIN]: 5, [WAREHOUSE]: 0 } });
  });

  it("create sends typed stock and tracking only when editable", () => {
    const form = { ...EMPTY_FORM, title: "Mug", inventory: { [MAIN]: "3", [WAREHOUSE]: "" } };
    expect(buildProductPayload(form, EMPTY_FORM, { isEdit: false, inventoryEditable: true })).toMatchObject({
      trackInventory: true,
      inventory: [{ locationId: MAIN, available: 3, expected: null }],
    });
    const blocked = buildProductPayload(form, EMPTY_FORM, { isEdit: false, inventoryEditable: false });
    expect(blocked).not.toHaveProperty("inventory");
    expect(blocked).not.toHaveProperty("trackInventory");
  });

  it("edit sends only changed locations with the stock the user saw", () => {
    const baseline = formFromProduct(product);
    const form = { ...baseline, inventory: { [MAIN]: "8", [WAREHOUSE]: "0" } };
    expect(buildProductPayload(form, baseline, { isEdit: true, inventoryEditable: true })).toEqual({ inventory: [{ locationId: MAIN, available: 8, expected: 5 }] });
    expect(buildProductPayload(baseline, baseline, { isEdit: true, inventoryEditable: true })).toEqual({});
    expect(buildProductPayload({ ...form, trackInventory: false }, baseline, { isEdit: true, inventoryEditable: true })).toEqual({ trackInventory: false });
  });
});
