import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import EbayAccount from "@/models/EbayAccount";
import EbayProduct from "@/models/EbayProduct";
import Product from "@/models/Product";
import { LWA_TOKEN_URL } from "@/lib/amazon/config";
import { clearLwaCache } from "@/lib/amazon/lwa";
import { createAmazonClient } from "@/lib/amazon/client";
import { getMarketplaceParticipations } from "@/lib/amazon/sellers";
import { getListingsItem, syncListingsItem, toSafeListing } from "@/lib/amazon/listings";
import {
  AmazonAccountOwnershipError,
  clientForAccount,
  disconnectAmazonAccount,
  getAmazonAccountForUser,
  linkAmazonAccount,
  toClientAccount,
} from "@/lib/amazon/accounts";
import { decryptSecret } from "@/lib/security/secrets";
import { GET as status } from "@/app/api/amazon/status/route";
import { DELETE as disconnect } from "@/app/api/amazon/accounts/[id]/route";
import { linkStore } from "@/lib/shopify/stores";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

// Official static-sandbox responses, copied verbatim from Amazon's API models.
const EXAMPLES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/amazon/static-sandbox-examples.json"), "utf8"));
const SANDBOX = "https://sandbox.sellingpartnerapi-na.amazon.com";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const BASE = "http://localhost:3000";
const req = (method, p, cookie) => new NextRequest(`${BASE}${p}`, { method, headers: cookie ? { cookie } : {} });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

const appCreds = { environment: "sandbox", apiBase: SANDBOX, clientId: "amzn1.application-oa2-client.test", clientSecret: "test-secret", refreshToken: "Atzr|dev-token" };

// A fake SP-API sandbox that answers with the official static examples.
function fakeSandbox(overrides = {}) {
  const seen = [];
  const fetchImpl = vi.fn(async (url) => {
    const u = new URL(url);
    if (String(url) === LWA_TOKEN_URL) return json({ access_token: "Atza|sandbox-access", expires_in: 3600 });
    seen.push(u);
    if (u.origin !== SANDBOX) return json({ errors: [{ code: "NotSandbox" }] }, 500);
    if (u.pathname === "/sellers/v1/marketplaceParticipations") return json(overrides.participations || EXAMPLES.getMarketplaceParticipations.response);
    if (u.pathname.startsWith("/listings/2021-08-01/items/")) return json(overrides.listing || EXAMPLES.getListingsItem.response);
    return json({ errors: [{ code: "NotFound" }] }, 404);
  });
  return { fetchImpl, seen };
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([AmazonAccount.init(), AmazonListing.init()]);
  clearLwaCache();
  process.env.AMAZON_SANDBOX_CLIENT_ID = appCreds.clientId;
  process.env.AMAZON_SANDBOX_CLIENT_SECRET = appCreds.clientSecret;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AMAZON_SANDBOX_CLIENT_ID;
  delete process.env.AMAZON_SANDBOX_CLIENT_SECRET;
});

describe("official static sandbox examples", () => {
  it("getMarketplaceParticipations maps to marketplace fields only", async () => {
    const { fetchImpl, seen } = fakeSandbox();
    const result = await getMarketplaceParticipations(createAmazonClient(appCreds, { fetchImpl }));
    expect(EXAMPLES.getMarketplaceParticipations.request).toEqual({ parameters: {} });
    expect(seen[0].pathname).toBe("/sellers/v1/marketplaceParticipations");
    expect(result).toEqual([
      { marketplaceId: "ATVPDKIKX0DER", countryCode: "US", name: "Amazon.com", defaultCurrencyCode: "USD", isParticipating: true, hasSuspendedListings: false },
    ]);
    expect(JSON.stringify(result)).not.toContain("BestSellerStore");
  });

  it("getListingsItem keeps the listing summary and drops offers, fulfillment and issues", async () => {
    const { fetchImpl, seen } = fakeSandbox();
    const listing = await getListingsItem(createAmazonClient(appCreds, { fetchImpl }), { sellerId: "A1SANDBOXSELLER", sku: "GM-ZDPI-9B4E", marketplaceId: "ATVPDKIKX0DER" });
    expect(seen[0].pathname).toBe("/listings/2021-08-01/items/A1SANDBOXSELLER/GM-ZDPI-9B4E");
    expect(seen[0].searchParams.get("marketplaceIds")).toBe("ATVPDKIKX0DER");
    expect(listing).toEqual({
      sku: "GM-ZDPI-9B4E",
      marketplaceId: "ATVPDKIKX0DER",
      asin: "B071VG5N9D",
      productType: "LUGGAGE",
      conditionType: "new_new",
      statuses: ["BUYABLE"],
      itemName: "Hardside Carry-On Spinner Suitcase Luggage",
      createdDate: new Date("2021-02-01T00:00:00Z"),
      lastUpdatedDate: new Date("2021-03-01T00:00:00Z"),
    });
    for (const dropped of ["offers", "fulfillmentAvailability", "issues"]) expect(listing).not.toHaveProperty(dropped);
  });

  it("drops buyer-like fields even if a response contained them", () => {
    const tampered = {
      ...EXAMPLES.getListingsItem.response,
      buyerInfo: { BuyerEmail: "buyer@example.com", BuyerName: "Jane Buyer" },
      shippingAddress: { AddressLine1: "1 Main St", Phone: "555-0100" },
      summaries: [{ ...EXAMPLES.getListingsItem.response.summaries[0], buyerEmail: "buyer@example.com" }],
    };
    const text = JSON.stringify(toSafeListing(tampered, "ATVPDKIKX0DER"));
    for (const pii of ["buyer@example.com", "Jane Buyer", "1 Main St", "555-0100"]) expect(text).not.toContain(pii);
  });

  it("Orders 2026-01-01: every static example requests BUYER or RECIPIENT, so Orders is not called", () => {
    const examples = [...EXAMPLES.ordersStaticExampleRequests.searchOrders, ...EXAMPLES.ordersStaticExampleRequests.getOrder];
    const successExamples = examples.filter((p) => !String(p.createdAfter?.value || p.orderId?.value).startsWith("TEST_CASE_400"));
    expect(successExamples.length).toBeGreaterThan(0);
    for (const p of successExamples) {
      expect(p.includedData.value.some((d) => d === "BUYER" || d === "RECIPIENT")).toBe(true);
    }
  });

  it("no Amazon module requests buyer data, Restricted Data Tokens or the deprecated Orders v0", async () => {
    const dir = path.join(import.meta.dirname, "..", "lib", "amazon");
    const source = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    for (const forbidden of ["restrictedDataToken", "/tokens/2021-03-01", "/orders/v0", '"BUYER"', '"RECIPIENT"', '"PACKAGES"', '"PAYMENT"', "buyerInfo"]) {
      expect(source).not.toContain(forbidden);
    }
    const { ORDER_INCLUDED_DATA } = await import("@/lib/amazon/orders");
    expect([...ORDER_INCLUDED_DATA].sort()).toEqual(["CANCELLATION", "FULFILLMENT", "PROCEEDS"]);
  });
});

describe("accounts", () => {
  const link = (user, sellingPartnerId = "A1SANDBOXSELLER", refreshToken = "Atzr|seller-token") =>
    linkAmazonAccount({ userId: user._id, environment: "sandbox", sellingPartnerId, marketplaceIds: ["ATVPDKIKX0DER"], refreshToken });

  it("stores the refresh token encrypted, never returns it, and decrypts only on request", async () => {
    const user = await createUser();
    const linked = await link(user);
    expect(linked).not.toHaveProperty("refreshTokenEnc");
    expect(toClientAccount(linked)).toMatchObject({ environment: "sandbox", environmentLabel: "Sandbox", sellingPartnerId: "A1SANDBOXSELLER" });

    const plain = await AmazonAccount.findById(linked._id).lean();
    expect(plain.refreshTokenEnc).toBeUndefined();
    const withToken = await AmazonAccount.findById(linked._id).select("+refreshTokenEnc").lean();
    expect(withToken.refreshTokenEnc).toMatch(/^v1:/);
    expect(withToken.refreshTokenEnc).not.toContain("seller-token");
    expect(decryptSecret(withToken.refreshTokenEnc)).toBe("Atzr|seller-token");
  });

  it("never links a seller account another user owns, and lookups are owner-scoped", async () => {
    const a = await createUser();
    const b = await createUser();
    const account = await link(a);
    await expect(link(b)).rejects.toBeInstanceOf(AmazonAccountOwnershipError);
    expect(await getAmazonAccountForUser(b._id, { accountId: account._id })).toBeNull();
    expect(await getAmazonAccountForUser(b._id, { accountId: "not-an-id" })).toBeNull();
    expect(String((await getAmazonAccountForUser(a._id, { accountId: account._id }))._id)).toBe(String(account._id));
    expect(await AmazonAccount.countDocuments({ user: b._id })).toBe(0);
  });

  it("syncs a listing with the seller's own token and owner", async () => {
    const user = await createUser();
    const linked = await link(user);
    const account = await getAmazonAccountForUser(user._id, { accountId: linked._id, withToken: true });
    const { fetchImpl } = fakeSandbox();
    const client = clientForAccount(account, { fetchImpl });
    const saved = await syncListingsItem(account, client, { sku: "GM-ZDPI-9B4E", marketplaceId: "ATVPDKIKX0DER" });
    expect(saved).toMatchObject({ user: user._id, amazonAccount: account._id, environment: "sandbox", sku: "GM-ZDPI-9B4E", asin: "B071VG5N9D" });
    const tokenRequest = fetchImpl.mock.calls.find(([u]) => String(u) === LWA_TOKEN_URL);
    expect(new URLSearchParams(tokenRequest[1].body.toString()).get("refresh_token")).toBe("Atzr|seller-token");
  });

  it("disconnect deletes the account and its listings only, leaving other accounts and marketplaces", async () => {
    const owner = await createUser();
    const other = await createUser();
    const target = await link(owner, "A1TARGET");
    const second = await link(owner, "A2SECOND");
    const othersAccount = await link(other, "A3OTHER");
    for (const [acct, user] of [[target, owner], [target, owner], [second, owner], [othersAccount, other]]) {
      await AmazonListing.create({ user: user._id, amazonAccount: acct._id, environment: "sandbox", marketplaceId: "ATVPDKIKX0DER", sku: `SKU-${Math.random()}` });
    }
    const store = await linkStore({ userId: owner._id, shop: `a${Date.now()}.myshopify.com`, accessToken: "t", scope: "" });
    const shopifyProduct = await Product.create({ user: owner._id, shopifyStore: store._id, shopifyProductId: "1", title: "Mug" });
    const ebayAccount = await EbayAccount.create({ user: owner._id, environment: "sandbox", ebayUserId: "E1", marketplaceId: "EBAY_US" });
    await EbayProduct.create({ user: owner._id, ebayAccount: ebayAccount._id, sku: "E-SKU", title: "eBay item" });

    expect(await disconnectAmazonAccount(other._id, target._id)).toBeNull(); // not theirs
    const result = await disconnectAmazonAccount(owner._id, target._id);
    expect(result).toMatchObject({ environment: "sandbox", deleted: { accounts: 1, listings: 2 } });

    expect(await AmazonAccount.exists({ _id: target._id })).toBeNull();
    expect(await AmazonListing.countDocuments({ amazonAccount: target._id })).toBe(0);
    expect(await AmazonListing.countDocuments({ amazonAccount: second._id })).toBe(1);
    expect(await AmazonListing.countDocuments({ amazonAccount: othersAccount._id })).toBe(1);
    expect(await Product.exists({ _id: shopifyProduct._id })).not.toBeNull();
    expect(await EbayAccount.exists({ _id: ebayAccount._id })).not.toBeNull();
    expect(await EbayProduct.countDocuments({ ebayAccount: ebayAccount._id })).toBe(1);
    expect(await disconnectAmazonAccount(owner._id, target._id)).toBeNull(); // already gone
  });
});

describe("routes", () => {
  it("status requires a session, says Sandbox, and lists only the user's own accounts without secrets", async () => {
    expect((await status(req("GET", "/api/amazon/status"))).status).toBe(401);
    const a = await createUser();
    const b = await createUser();
    await linkAmazonAccount({ userId: a._id, environment: "sandbox", sellingPartnerId: "A1MINE", marketplaceIds: ["ATVPDKIKX0DER"], refreshToken: "Atzr|mine" });
    await linkAmazonAccount({ userId: b._id, environment: "sandbox", sellingPartnerId: "B1THEIRS", marketplaceIds: ["ATVPDKIKX0DER"], refreshToken: "Atzr|theirs" });

    const res = await status(req("GET", "/api/amazon/status", sessionCookieFor(a)));
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body).toMatchObject({ success: true, environment: "sandbox", sandbox: true, connected: true });
    expect(body.accounts.map((x) => x.sellingPartnerId)).toEqual(["A1MINE"]);
    for (const secret of ["Atzr|", "refreshTokenEnc", "v1:", "B1THEIRS", "test-secret"]) expect(text).not.toContain(secret);
  });

  it("disconnect: 401 without a session, 404 for someone else's account, 200 then 404 for one's own", async () => {
    const a = await createUser();
    const b = await createUser();
    const account = await linkAmazonAccount({ userId: a._id, environment: "sandbox", sellingPartnerId: "A1MINE", marketplaceIds: [], refreshToken: "Atzr|mine" });

    expect((await disconnect(req("DELETE", `/api/amazon/accounts/${account._id}`), params(account._id))).status).toBe(401);
    expect((await disconnect(req("DELETE", `/api/amazon/accounts/${account._id}`, sessionCookieFor(b)), params(account._id))).status).toBe(404);
    expect(await AmazonAccount.exists({ _id: account._id })).not.toBeNull();

    const ok = await disconnect(req("DELETE", `/api/amazon/accounts/${account._id}`, sessionCookieFor(a)), params(account._id));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ success: true, deleted: { accounts: 1, listings: 0 } });
    expect((await disconnect(req("DELETE", `/api/amazon/accounts/${account._id}`, sessionCookieFor(a)), params(account._id))).status).toBe(404);
  });
});
