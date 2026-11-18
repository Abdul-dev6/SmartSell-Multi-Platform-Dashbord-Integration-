import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import { clearLwaCache } from "@/lib/amazon/lwa";
import { clientDefaults } from "@/lib/amazon/client";
import { clearProductTypeCache } from "@/lib/amazon/productTypes";
import { linkAmazonAccount } from "@/lib/amazon/accounts";
import * as listings from "@/app/api/amazon/listings/route";
import * as listingItem from "@/app/api/amazon/listings/[id]/route";
import * as closeRoute from "@/app/api/amazon/listings/[id]/close/route";
import * as productTypes from "@/app/api/amazon/product-types/route";
import * as productType from "@/app/api/amazon/product-types/[productType]/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";
import { clearAmazonEnv, installFakeAmazon, json, productionEnv, SCHEMA_URL } from "./helpers/fakeAmazon";

// Amazon listing CRUD through SmartSell's API, against a faked SP-API that
// answers with Amazon's official Listings Items responses.

const EX = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/production-api-examples.json"), "utf8"));
const BASE = "http://localhost:3000";
const SELLER = "A1SELLERPROD";
const MP = "ATVPDKIKX0DER";
const req = (method, p, cookie, body) =>
  new NextRequest(`${BASE}${p}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

// Luggage schema: what Amazon requires for this product type (test schema
// served at the definition's schema link).
const SCHEMA = { required: ["item_name", "brand", "condition_type", "purchasable_offer", "fulfillment_availability"], properties: { item_name: { title: "Item Name" }, brand: { title: "Brand" } } };

function liveItem(sku, overrides = {}) {
  return {
    sku,
    summaries: [{ marketplaceId: MP, asin: "B071VG5N9D", productType: "LUGGAGE", conditionType: "new_new", status: ["BUYABLE"], itemName: overrides.itemName || "Carry-On Suitcase", createdDate: "2026-11-01T00:00:00Z", lastUpdatedDate: "2026-11-02T00:00:00Z" }],
    offers: [{ marketplaceId: MP, offerType: "B2C", price: { currencyCode: "USD", amount: String(overrides.price ?? "49.99") } }],
    fulfillmentAvailability: [{ fulfillmentChannelCode: overrides.channel || "DEFAULT", quantity: overrides.quantity ?? 7 }],
    issues: overrides.issues || [],
  };
}

let amazon;
let seller;
let account;
let liveState;
beforeEach(async () => {
  await resetDatabase();
  await Promise.all([AmazonAccount.init(), AmazonListing.init()]);
  clearLwaCache();
  clearProductTypeCache();
  clientDefaults.sleep = async () => {};
  productionEnv();
  amazon = installFakeAmazon();
  liveState = {};
  amazon.externals[SCHEMA_URL] = () => json(SCHEMA);
  amazon
    .on("GET /definitions/2020-09-01/productTypes/:pt", () => ({ ...EX.getDefinitionsProductType, productType: "LUGGAGE", schema: { link: { resource: SCHEMA_URL, verb: "GET" }, checksum: "abc" } }))
    .on("GET /definitions/2020-09-01/productTypes", () => EX.searchDefinitionsProductTypes)
    .on("PUT /listings/2021-08-01/items/:seller/:sku", (r) => (r.query.get("mode") === "VALIDATION_PREVIEW" ? { ...EX.putListingsItemPreviewValid, sku: r.params.sku } : { ...EX.putListingsItemAccepted, sku: r.params.sku }))
    .on("PATCH /listings/2021-08-01/items/:seller/:sku", (r) => (r.query.get("mode") === "VALIDATION_PREVIEW" ? { ...EX.putListingsItemPreviewValid, sku: r.params.sku } : { ...EX.patchListingsItemAccepted, sku: r.params.sku }))
    .on("DELETE /listings/2021-08-01/items/:seller/:sku", (r) => ({ ...EX.deleteListingsItemAccepted, sku: r.params.sku }))
    .on("GET /listings/2021-08-01/items/:seller/:sku", (r) => liveItem(r.params.sku, liveState[r.params.sku]));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});

  const user = await createUser();
  seller = { user, cookie: sessionCookieFor(user) };
  account = await linkAmazonAccount({
    userId: user._id,
    environment: "production",
    sellingPartnerId: SELLER,
    marketplaces: [{ id: MP, name: "Amazon.com", countryCode: "US", currency: "USD", isParticipating: true }],
    refreshToken: "Atzr|seller-token",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearAmazonEnv();
});

const newListing = (over = {}) => ({
  accountId: String(account._id),
  sku: "SS-LUG-001",
  marketplaceId: MP,
  productType: "LUGGAGE",
  fulfillment: "MFN",
  title: "Carry-On Suitcase",
  brand: "SmartSell Test",
  condition: "new_new",
  price: 49.99,
  currency: "USD",
  quantity: 7,
  ...over,
});
const create = (body, cookie = seller.cookie) => listings.POST(req("POST", "/api/amazon/listings", cookie, body));
async function created(over) {
  const res = await create(newListing(over));
  expect(res.status).toBe(202);
  return (await res.json()).listing;
}

describe("create", () => {
  it("checks the product type, previews with Amazon, submits, and records Amazon's processing result", async () => {
    const res = await create(newListing());
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.submission).toMatchObject({ status: "ACCEPTED", submissionId: "f1dc2914-75dd-11ea-bc55-0242ac130003" });
    // Read back: Amazon reports it buyable, so it is live (not merely accepted).
    expect(body.listing).toMatchObject({ sku: "SS-LUG-001", marketplaceId: MP, asin: "B071VG5N9D", price: 49.99, currency: "USD", fulfillment: "MFN", quantity: 7, statuses: ["BUYABLE"], origin: "smartsell", submission: { operation: "create", status: "live" } });

    const puts = amazon.calls("PUT /listings/2021-08-01/items/:seller/:sku");
    expect(puts.map((p) => p.query.get("mode"))).toEqual(["VALIDATION_PREVIEW", null]);
    expect(puts[1].path).toBe(`/listings/2021-08-01/items/${SELLER}/SS-LUG-001`);
    expect(puts[1].query.get("marketplaceIds")).toBe(MP);
    expect(puts[1].body).toMatchObject({ productType: "LUGGAGE", requirements: "LISTING" });
    expect(puts[1].body.attributes).toMatchObject({
      item_name: [{ value: "Carry-On Suitcase", language_tag: "en_US", marketplace_id: MP }],
      purchasable_offer: [{ marketplace_id: MP, currency: "USD", our_price: [{ schedule: [{ value_with_tax: 49.99 }] }] }],
      fulfillment_availability: [{ fulfillment_channel_code: "DEFAULT", quantity: 7 }],
    });
    const ptd = amazon.calls("GET /definitions/2020-09-01/productTypes/:pt")[0];
    expect(ptd.query.get("requirements")).toBe("LISTING");
    expect(ptd.query.get("sellerId")).toBe(SELLER);
  });

  it("validates input before calling Amazon", async () => {
    for (const [over, field] of [
      [{ sku: "" }, "sku"],
      [{ sku: " lead" }, "sku"],
      [{ marketplaceId: "A1PA6795UKMFR9" }, "marketplaceId"],
      [{ marketplaceId: "A2EUQ1WTGCTBG2" }, "marketplaceId"], // NA, but not authorized for this seller
      [{ price: -1 }, "price"],
      [{ price: 10.999 }, "price"],
      [{ currency: "EUR" }, "currency"],
      [{ quantity: -3 }, "quantity"],
      [{ fulfillment: "FBA", quantity: 5 }, "quantity"],
      [{ productType: "not valid" }, "productType"],
      [{ images: ["http://insecure.example/x.jpg"] }, "images"],
    ]) {
      const res = await create(newListing(over));
      expect(res.status).toBe(422);
      expect((await res.json()).errors).toHaveProperty(field);
    }
    expect(amazon.requests).toHaveLength(0);
  });

  it("refuses a listing missing attributes the product type requires", async () => {
    const res = await create(newListing({ brand: undefined }));
    expect(res.status).toBe(422);
    expect((await res.json()).errors.missingAttributes).toEqual(["brand"]);
    expect(amazon.calls("PUT /listings/2021-08-01/items/:seller/:sku")).toHaveLength(0);
  });

  it("an INVALID preview is reported with Amazon's issues and never submitted", async () => {
    amazon.on("PUT /listings/2021-08-01/items/:seller/:sku", () => EX.putListingsItemPreviewInvalid);
    const res = await create(newListing());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("amazon_invalid");
    expect(body.issues[0]).toMatchObject({ code: "90220", severity: "ERROR", attributeNames: ["condition_type"] });
    expect(amazon.calls("PUT /listings/2021-08-01/items/:seller/:sku")).toHaveLength(1);
    const stored = await AmazonListing.findOne({ sku: "SS-LUG-001" }).lean();
    expect(stored.submission.status).toBe("failed");
    expect(stored.pendingOperation).toBeUndefined();
  });

  it("accepted but failed in processing: the read-back error is shown, not success", async () => {
    liveState["SS-LUG-001"] = { issues: [{ code: "8541", message: "The product data conflicts with the catalog.", severity: "ERROR", attributeNames: ["item_name"] }] };
    const listing = await created();
    expect(listing.submission.status).toBe("failed");
    expect(listing.issues[0]).toMatchObject({ code: "8541", severity: "ERROR" });
  });

  it("refuses a duplicate submission while one is in flight, and an existing SKU", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    amazon.on("PUT /listings/2021-08-01/items/:seller/:sku", async (r) => {
      if (r.query.get("mode") !== "VALIDATION_PREVIEW") await gate;
      return r.query.get("mode") === "VALIDATION_PREVIEW" ? { ...EX.putListingsItemPreviewValid, sku: r.params.sku } : { ...EX.putListingsItemAccepted, sku: r.params.sku };
    });
    const first = create(newListing());
    await vi.waitFor(async () => expect(await AmazonListing.exists({ "pendingOperation.type": "create" })).not.toBeNull());
    const second = await create(newListing());
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe("in_progress");
    release();
    expect((await first).status).toBe(202);
    const again = await create(newListing());
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("sku_exists");
    expect(await AmazonListing.countDocuments({ sku: "SS-LUG-001" })).toBe(1);
  });

  it("throttling and temporary errors: retried with backoff, then reported safely", async () => {
    let n = 0;
    amazon.on("PUT /listings/2021-08-01/items/:seller/:sku", (r) => {
      n += 1;
      if (n <= 2) return json({ errors: [{ code: "InternalFailure" }] }, 503);
      return r.query.get("mode") === "VALIDATION_PREVIEW" ? { ...EX.putListingsItemPreviewValid, sku: r.params.sku } : { ...EX.putListingsItemAccepted, sku: r.params.sku };
    });
    expect((await create(newListing())).status).toBe(202);

    amazon.on("PUT /listings/2021-08-01/items/:seller/:sku", () => json({ errors: [{ code: "QuotaExceeded" }] }, 429));
    const res = await create(newListing({ sku: "SS-LUG-002" }));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("amazon_throttled");
    // Nothing was submitted for real, so no placeholder is left behind.
    expect(await AmazonListing.countDocuments({ sku: "SS-LUG-002" })).toBe(0);
  });

  it("a temporary Amazon failure during create leaves no phantom listing, so the SKU can be retried", async () => {
    let down = true;
    amazon.on("PUT /listings/2021-08-01/items/:seller/:sku", (r) => {
      if (down) return json({ errors: [{ code: "InternalFailure" }] }, 503);
      return r.query.get("mode") === "VALIDATION_PREVIEW" ? { ...EX.putListingsItemPreviewValid, sku: r.params.sku } : { ...EX.putListingsItemAccepted, sku: r.params.sku };
    });
    const failed = await create(newListing());
    expect(failed.status).toBe(502);
    expect(await AmazonListing.countDocuments({ sku: "SS-LUG-001" })).toBe(0);

    // Unknown outcome (the real submission failed): kept as failed, still retryable.
    let n = 0;
    amazon.on("PUT /listings/2021-08-01/items/:seller/:sku", (r) => {
      n += 1;
      if (r.query.get("mode") === "VALIDATION_PREVIEW") return { ...EX.putListingsItemPreviewValid, sku: r.params.sku };
      return down ? json({ errors: [{ code: "InternalFailure" }] }, 503) : { ...EX.putListingsItemAccepted, sku: r.params.sku };
    });
    expect((await create(newListing())).status).toBe(502);
    expect(await AmazonListing.findOne({ sku: "SS-LUG-001" }).lean()).toMatchObject({ submission: { operation: "create", status: "failed" } });
    expect(n).toBeGreaterThan(1);

    down = false;
    expect((await create(newListing())).status).toBe(202);
    expect(await AmazonListing.countDocuments({ sku: "SS-LUG-001" })).toBe(1);
  });

  it("writes are refused (404) while production connections are disabled", async () => {
    process.env.AMAZON_CONNECT_ENABLED = "false";
    const res = await create(newListing());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_available");
    expect(amazon.requests).toHaveLength(0);
  });
});

describe("read", () => {
  it("lists and refreshes the seller's listings with price, quantity, fulfillment and issues", async () => {
    const mine = await created();
    liveState["SS-LUG-001"] = { price: "45.00", quantity: 3, issues: [{ code: "18027", message: "Image too small", severity: "WARNING", attributeNames: ["main_product_image_locator"] }] };
    const res = await listingItem.GET(req("GET", `/api/amazon/listings/${mine.id}?refresh=1`, seller.cookie), params(mine.id));
    const { listing } = await res.json();
    expect(listing).toMatchObject({ price: 45, quantity: 3, fulfillment: "MFN", issues: [{ severity: "WARNING", code: "18027" }] });

    const list = await (await listings.GET(req("GET", "/api/amazon/listings?q=suitcase&status=active", seller.cookie))).json();
    expect(list.total).toBe(1);
    expect(list.items[0].sku).toBe("SS-LUG-001");
    expect((await (await listings.GET(req("GET", "/api/amazon/listings?fulfillment=FBA", seller.cookie))).json()).total).toBe(0);
  });

  it("another user's listing is 404, unauthenticated is 401, and Amazon is never called for them", async () => {
    const mine = await created();
    const before = amazon.requests.length;
    const other = await createUser();
    const c = sessionCookieFor(other);
    for (const res of [
      await listingItem.GET(req("GET", `/api/amazon/listings/${mine.id}?refresh=1`, c), params(mine.id)),
      await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${mine.id}`, c, { title: "Hijacked" }), params(mine.id)),
      await listingItem.DELETE(req("DELETE", `/api/amazon/listings/${mine.id}`, c, { confirm: true }), params(mine.id)),
      await closeRoute.POST(req("POST", `/api/amazon/listings/${mine.id}/close`, c), params(mine.id)),
    ]) expect(res.status).toBe(404);
    expect((await (await listings.GET(req("GET", "/api/amazon/listings", c))).json()).total).toBe(0);
    for (const res of [
      await listings.GET(req("GET", "/api/amazon/listings")),
      await listings.POST(req("POST", "/api/amazon/listings", null, newListing())),
      await listingItem.GET(req("GET", `/api/amazon/listings/${mine.id}`), params(mine.id)),
    ]) expect(res.status).toBe(401);
    expect(amazon.requests.length).toBe(before);
    expect((await AmazonListing.findById(mine.id).lean()).itemName).toBe("Carry-On Suitcase");
  });
});

describe("update, close and delete", () => {
  it("updates attributes with JSON Patch and stores the change only after Amazon accepts it", async () => {
    const mine = await created();
    liveState["SS-LUG-001"] = { itemName: "Carry-On Suitcase, Blue" };
    const res = await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${mine.id}`, seller.cookie, { title: "Carry-On Suitcase, Blue", bulletPoints: ["Hard shell"] }), params(mine.id));
    expect(res.status).toBe(202);
    const patch = amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku").at(-1);
    expect(patch.body.productType).toBe("LUGGAGE");
    expect(patch.body.patches).toEqual([
      { op: "replace", path: "/attributes/item_name", value: [{ value: "Carry-On Suitcase, Blue", language_tag: "en_US", marketplace_id: MP }] },
      { op: "replace", path: "/attributes/bullet_point", value: [{ value: "Hard shell", language_tag: "en_US", marketplace_id: MP }] },
    ]);
    expect((await res.json()).listing.title).toBe("Carry-On Suitcase, Blue");
  });

  it("updates the price (purchasable_offer) and rejects invalid prices", async () => {
    const mine = await created();
    liveState["SS-LUG-001"] = { price: "39.50" };
    const res = await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${mine.id}`, seller.cookie, { price: 39.5, currency: "USD" }), params(mine.id));
    expect(res.status).toBe(202);
    expect(amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku").at(-1).body.patches).toEqual([
      { op: "merge", path: "/attributes/purchasable_offer", value: [{ marketplace_id: MP, currency: "USD", our_price: [{ schedule: [{ value_with_tax: 39.5 }] }] }] },
    ]);
    expect(await AmazonListing.findById(mine.id).lean()).toMatchObject({ price: 39.5, submission: { operation: "price" } });

    const patches = amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku").length;
    for (const body of [{ price: 0, currency: "USD" }, { price: "abc", currency: "USD" }, { price: 10, currency: "CAD" }]) {
      expect((await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${mine.id}`, seller.cookie, body), params(mine.id))).status).toBe(422);
    }
    expect(amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku")).toHaveLength(patches);
  });

  it("an INVALID price change keeps the old price and shows Amazon's issues", async () => {
    const mine = await created();
    amazon.on("PATCH /listings/2021-08-01/items/:seller/:sku", () => EX.patchListingsItemPreviewInvalid);
    const res = await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${mine.id}`, seller.cookie, { price: 20, currency: "USD" }), params(mine.id));
    expect(res.status).toBe(422);
    expect((await res.json()).issues[0]).toMatchObject({ code: "90000900", severity: "ERROR" });
    expect((await AmazonListing.findById(mine.id).lean()).price).toBe(49.99);
  });

  it("updates seller-fulfilled quantity; FBA quantities cannot be changed", async () => {
    const mine = await created();
    liveState["SS-LUG-001"] = { quantity: 12 };
    expect((await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${mine.id}`, seller.cookie, { quantity: 12 }), params(mine.id))).status).toBe(202);
    expect(amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku").at(-1).body.patches).toEqual([
      { op: "merge", path: "/attributes/fulfillment_availability", value: [{ fulfillment_channel_code: "DEFAULT", quantity: 12 }] },
    ]);
    expect((await AmazonListing.findById(mine.id).lean()).quantity).toBe(12);
    expect((await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${mine.id}`, seller.cookie, { quantity: -1 }), params(mine.id))).status).toBe(422);

    const fba = await created({ sku: "SS-FBA-1", fulfillment: "FBA", quantity: undefined });
    await AmazonListing.updateOne({ _id: fba.id }, { $set: { fulfillmentChannel: "AMAZON_NA" } });
    const before = amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku").length;
    const res = await listingItem.PATCH(req("PATCH", `/api/amazon/listings/${fba.id}`, seller.cookie, { quantity: 5 }), params(fba.id));
    expect(res.status).toBe(422);
    expect(amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku")).toHaveLength(before);
  });

  it("close sets a seller-fulfilled listing inactive (quantity 0) without deleting it", async () => {
    const mine = await created();
    liveState["SS-LUG-001"] = { quantity: 0 };
    const res = await closeRoute.POST(req("POST", `/api/amazon/listings/${mine.id}/close`, seller.cookie), params(mine.id));
    expect(res.status).toBe(202);
    expect(amazon.calls("PATCH /listings/2021-08-01/items/:seller/:sku").at(-1).body.patches[0]).toEqual({ op: "merge", path: "/attributes/fulfillment_availability", value: [{ fulfillment_channel_code: "DEFAULT", quantity: 0 }] });
    expect(amazon.calls("DELETE /listings/2021-08-01/items/:seller/:sku")).toHaveLength(0);
    expect(await AmazonListing.findById(mine.id).lean()).toMatchObject({ quantity: 0, submission: { operation: "close" } });
  });

  it("delete requires confirmation, then deletes on Amazon and in SmartSell", async () => {
    const mine = await created();
    const unconfirmed = await listingItem.DELETE(req("DELETE", `/api/amazon/listings/${mine.id}`, seller.cookie, {}), params(mine.id));
    expect(unconfirmed.status).toBe(400);
    expect(amazon.calls("DELETE /listings/2021-08-01/items/:seller/:sku")).toHaveLength(0);

    const res = await listingItem.DELETE(req("DELETE", `/api/amazon/listings/${mine.id}`, seller.cookie, { confirm: true }), params(mine.id));
    expect(res.status).toBe(200);
    const del = amazon.calls("DELETE /listings/2021-08-01/items/:seller/:sku")[0];
    expect(del.path).toBe(`/listings/2021-08-01/items/${SELLER}/SS-LUG-001`);
    expect(del.query.get("marketplaceIds")).toBe(MP);
    expect(await AmazonListing.findById(mine.id)).toBeNull();
  });

  it("a delete Amazon rejects keeps the listing and shows the error", async () => {
    const mine = await created();
    amazon.on("DELETE /listings/2021-08-01/items/:seller/:sku", () => EX.listingsBadRequest && json(EX.listingsBadRequest, 400));
    const res = await listingItem.DELETE(req("DELETE", `/api/amazon/listings/${mine.id}`, seller.cookie, { confirm: true }), params(mine.id));
    expect(res.status).toBe(422);
    expect(await AmazonListing.findById(mine.id)).not.toBeNull();
    expect((await AmazonListing.findById(mine.id).lean()).pendingOperation).toBeUndefined();
  });
});

describe("product types", () => {
  it("searches product types and returns a type's required attributes from its schema", async () => {
    const search = await (await productTypes.GET(req("GET", `/api/amazon/product-types?q=luggage&accountId=${account._id}`, seller.cookie))).json();
    expect(search.productTypes).toEqual([{ name: "LUGGAGE", displayName: "Luggage" }]);
    const def = await (await productType.GET(req("GET", `/api/amazon/product-types/LUGGAGE?accountId=${account._id}`, seller.cookie), { params: Promise.resolve({ productType: "LUGGAGE" }) })).json();
    expect(def.requirements.requiredAttributes).toEqual(SCHEMA.required);
  });

  it("refuses a schema link that is not hosted by Amazon", async () => {
    amazon.on("GET /definitions/2020-09-01/productTypes/:pt", () => EX.getDefinitionsProductType); // official example: https://schema-url
    const res = await productType.GET(req("GET", `/api/amazon/product-types/LUGGAGE?accountId=${account._id}`, seller.cookie), { params: Promise.resolve({ productType: "LUGGAGE" }) });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("schema_unavailable");
  });
});
