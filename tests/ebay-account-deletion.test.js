import crypto from "node:crypto";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import User from "@/models/User";
import EbayAccount from "@/models/EbayAccount";
import EbayProduct from "@/models/EbayProduct";
import Product from "@/models/Product";
import Notification from "@/models/Notification";
import EbayDeletionNotification from "@/models/EbayDeletionNotification";
import { getNotificationEndpoint, getVerificationToken } from "@/lib/ebay/notifications/config";
import { clearPublicKeyCache, decodeSignatureHeader, formatKey } from "@/lib/ebay/notifications/verify";
import { createUser, resetDatabase } from "./helpers/db";

// Only the application token is faked; the rest of the eBay OAuth module is real.
vi.mock("@/lib/ebay/oauth", async (importOriginal) => ({
  ...(await importOriginal()),
  getApplicationToken: vi.fn(async () => "app-token"),
}));
const { getApplicationToken } = await import("@/lib/ebay/oauth");
const { GET, POST } = await import("@/app/api/ebay/account-deletion/route");

const ENDPOINT = "https://smartsell.example.com/api/ebay/account-deletion";
const TOKEN = "smartsell_verification_token_0123456789-abcdef";
const BASE = "https://smartsell.example.com";

// eBay's signing key (ECDSA P-256), and the key in eBay's response format:
// PEM without line breaks after the header and before the footer.
const ebayKeys = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const otherKeys = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const ebayStyleKey = (keys) => keys.publicKey.export({ type: "spki", format: "pem" }).replace(/\n/g, "");

let keyFetches;
function stubKeyEndpoint({ key = ebayStyleKey(ebayKeys), status = 200 } = {}) {
  keyFetches = [];
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    keyFetches.push({ url: String(url), auth: init?.headers?.Authorization });
    return new Response(JSON.stringify({ key, algorithm: "ECDSA", digest: "SHA1" }), { status });
  }));
}

function sign(payload, { keys = ebayKeys, kid = "key-1", body = JSON.stringify(payload) } = {}) {
  const signature = crypto.createSign("sha1").update(body).sign(keys.privateKey, "base64");
  return Buffer.from(JSON.stringify({ alg: "ECDSA", kid, signature, digest: "SHA1" })).toString("base64");
}

let seq = 0;
function deletionPayload(userId, overrides = {}) {
  return {
    metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false },
    notification: {
      notificationId: overrides.notificationId || `notif-${++seq}`,
      eventDate: "2026-11-14T10:00:00.000Z",
      publishDate: "2026-11-14T10:00:05.000Z",
      publishAttemptCount: 1,
      data: { username: overrides.username ?? "seller_one", userId, eiasToken: "nY+sHZ2PrBmdj6wVnY+sEZ2PrA2dj6wFk4GlCZOGoA6dj6x9nY+seQ==" },
    },
  };
}

function deliver(payload, { header = sign(payload), body = JSON.stringify(payload) } = {}) {
  return POST(new NextRequest(`${BASE}/api/ebay/account-deletion`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(header ? { "x-ebay-signature": header } : {}) },
    body,
  }));
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([User.init(), EbayAccount.init(), EbayProduct.init(), Product.init(), Notification.init(), EbayDeletionNotification.init()]);
  process.env.EBAY_NOTIFICATION_ENDPOINT = ENDPOINT;
  process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN = TOKEN;
  process.env.EBAY_NOTIFICATION_ENVIRONMENT = "production";
  process.env.EBAY_PRODUCTION_CLIENT_ID = "prod-client";
  process.env.EBAY_PRODUCTION_CLIENT_SECRET = "prod-secret";
  clearPublicKeyCache();
  stubKeyEndpoint();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of ["EBAY_NOTIFICATION_ENDPOINT", "EBAY_NOTIFICATION_VERIFICATION_TOKEN", "EBAY_NOTIFICATION_ENVIRONMENT", "EBAY_PRODUCTION_CLIENT_ID", "EBAY_PRODUCTION_CLIENT_SECRET"]) delete process.env[k];
});

describe("challenge verification (GET)", () => {
  it("answers SHA-256 hex of challengeCode + verificationToken + endpoint as JSON", async () => {
    const res = await GET(new NextRequest(`${ENDPOINT}?challenge_code=a8628072-3d33-45ee-9004-bee86830a22d`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    const expected = crypto.createHash("sha256").update("a8628072-3d33-45ee-9004-bee86830a22d" + TOKEN + ENDPOINT).digest("hex");
    expect(await res.json()).toEqual({ challengeResponse: expected });
  });

  it("requires challenge_code, and reports missing configuration instead of a wrong answer", async () => {
    expect((await GET(new NextRequest(ENDPOINT))).status).toBe(400);
    delete process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN;
    expect((await GET(new NextRequest(`${ENDPOINT}?challenge_code=x`))).status).toBe(500);
  });

  it("accepts only a valid public HTTPS endpoint and a 32–80 character token", () => {
    for (const bad of ["http://smartsell.example.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://a.example.com/x?y=1", "not a url"]) {
      process.env.EBAY_NOTIFICATION_ENDPOINT = bad;
      expect(getNotificationEndpoint()).toBeNull();
    }
    process.env.EBAY_NOTIFICATION_ENDPOINT = ENDPOINT;
    expect(getNotificationEndpoint()).toBe(ENDPOINT);
    for (const bad of ["short", "x".repeat(81), "has spaces in it padded to be long enough!!", "x".repeat(31)]) {
      process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN = bad;
      expect(getVerificationToken()).toBeNull();
    }
    process.env.EBAY_NOTIFICATION_VERIFICATION_TOKEN = "x".repeat(32);
    expect(getVerificationToken()).toBe("x".repeat(32));
  });
});

describe("configuration: challenge vs notification", () => {
  const onlyChallengeVars = () => {
    delete process.env.EBAY_PRODUCTION_CLIENT_ID;
    delete process.env.EBAY_PRODUCTION_CLIENT_SECRET;
    delete process.env.EBAY_NOTIFICATION_ENVIRONMENT;
  };
  async function seedTarget() {
    const owner = await createUser();
    const account = await EbayAccount.create({ user: owner._id, environment: "production", ebayUserId: "U1", username: "seller_one", marketplaceId: "EBAY_US" });
    await EbayProduct.create({ user: owner._id, ebayAccount: account._id, sku: "SKU-CFG", title: "Item" });
    return account;
  }
  async function expectNothingProcessed(account) {
    expect(await EbayAccount.findById(account._id)).not.toBeNull();
    expect(await EbayProduct.countDocuments({ ebayAccount: account._id })).toBe(1);
    expect(await EbayDeletionNotification.countDocuments()).toBe(0);
    expect(getApplicationToken).not.toHaveBeenCalled();
    expect(keyFetches).toHaveLength(0);
  }

  it("GET answers a valid 64-character challengeResponse with only the endpoint and token set", async () => {
    onlyChallengeVars();
    const res = await GET(new NextRequest(`${ENDPOINT}?challenge_code=only-two-vars`));
    expect(res.status).toBe(200);
    const { challengeResponse } = await res.json();
    expect(challengeResponse).toMatch(/^[0-9a-f]{64}$/);
    expect(challengeResponse).toBe(crypto.createHash("sha256").update("only-two-vars" + TOKEN + ENDPOINT).digest("hex"));
  });

  it("GET's not-configured log names only the two challenge settings", async () => {
    onlyChallengeVars();
    delete process.env.EBAY_NOTIFICATION_ENDPOINT;
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(new NextRequest(`${ENDPOINT}?challenge_code=x`))).status).toBe(500);
    const logged = logs.mock.calls.flat().join(" ");
    expect(logged).toContain("EBAY_NOTIFICATION_ENDPOINT");
    expect(logged).not.toContain("CLIENT_ID");
  });

  it("POST without Production credentials is not processed, even when correctly signed", async () => {
    getApplicationToken.mockClear();
    onlyChallengeVars();
    const account = await seedTarget();
    stubKeyEndpoint();
    const res = await deliver(deletionPayload("U1"));
    expect(res.status).toBe(500);
    await expectNothingProcessed(account);
  });

  it("POST for Production never falls back to Sandbox credentials", async () => {
    getApplicationToken.mockClear();
    onlyChallengeVars();
    process.env.EBAY_NOTIFICATION_ENVIRONMENT = "production";
    process.env.EBAY_SANDBOX_CLIENT_ID = "sandbox-client";
    process.env.EBAY_SANDBOX_CLIENT_SECRET = "sandbox-secret";
    try {
      const account = await seedTarget();
      stubKeyEndpoint();
      const res = await deliver(deletionPayload("U1"));
      expect(res.status).toBe(500);
      await expectNothingProcessed(account);
    } finally {
      delete process.env.EBAY_SANDBOX_CLIENT_ID;
      delete process.env.EBAY_SANDBOX_CLIENT_SECRET;
    }
  });

  it("POST with Production credentials fetches the key with the Production keyset and API", async () => {
    getApplicationToken.mockClear();
    await seedTarget();
    expect((await deliver(deletionPayload("U1"))).status).toBe(204);
    expect(getApplicationToken).toHaveBeenCalledWith(expect.objectContaining({ environment: "production", clientId: "prod-client" }));
    expect(keyFetches[0].url).toMatch(/^https:\/\/api\.ebay\.com\/commerce\/notification\/v1\/public_key\//);
  });
});

describe("signature verification (POST)", () => {
  it("verifies with eBay's public key fetched by key ID using an application token", async () => {
    const res = await deliver(deletionPayload("unknown-user"));
    expect(res.status).toBe(204);
    expect(keyFetches).toEqual([{ url: "https://api.ebay.com/commerce/notification/v1/public_key/key-1", auth: "Bearer app-token" }]);
    expect(getApplicationToken).toHaveBeenCalledWith(expect.objectContaining({ environment: "production", clientId: "prod-client", apiBase: "https://api.ebay.com" }));
  });

  it("rejects a missing, malformed, wrong-key or tampered signature with 412 and deletes nothing", async () => {
    const user = await createUser();
    await EbayAccount.create({ user: user._id, environment: "production", ebayUserId: "U1", username: "seller_one", marketplaceId: "EBAY_US" });
    const payload = deletionPayload("U1");

    expect((await deliver(payload, { header: null })).status).toBe(412);
    expect((await deliver(payload, { header: "not base64 json" })).status).toBe(412);
    expect((await deliver(payload, { header: sign(payload, { keys: otherKeys }) })).status).toBe(412);
    const tampered = deletionPayload("U1", { notificationId: payload.notification.notificationId });
    tampered.notification.data.userId = "U1";
    tampered.notification.publishAttemptCount = 2;
    expect((await deliver(tampered, { header: sign(payload) })).status).toBe(412);
    // A key ID that could change the request path is refused before any fetch.
    expect((await deliver(payload, { header: sign(payload, { kid: "../../oauth" }) })).status).toBe(412);

    expect(await EbayAccount.countDocuments()).toBe(1);
    expect(await EbayDeletionNotification.countDocuments()).toBe(0);
  });

  it("does not acknowledge (500) when eBay's key cannot be fetched, so eBay retries", async () => {
    const user = await createUser();
    await EbayAccount.create({ user: user._id, environment: "production", ebayUserId: "U1", marketplaceId: "EBAY_US" });
    stubKeyEndpoint({ status: 500 });
    expect((await deliver(deletionPayload("U1"))).status).toBe(500);
    expect(await EbayAccount.countDocuments()).toBe(1);
  });

  it("caches the public key per key ID", async () => {
    await deliver(deletionPayload("a"));
    await deliver(deletionPayload("b"));
    expect(keyFetches).toHaveLength(1);
  });

  it("also accepts a signature over the exact raw body", async () => {
    const payload = deletionPayload("raw-user");
    const body = JSON.stringify(payload, null, 1); // different whitespace than JSON.stringify(parsed)
    expect((await deliver(payload, { body, header: sign(payload, { body }) })).status).toBe(204);
  });

  it("formats eBay's single-line key into PEM as the SDK does", () => {
    const key = ebayStyleKey(ebayKeys);
    expect(key).not.toContain("\n");
    const pem = formatKey(key);
    expect(pem.startsWith("-----BEGIN PUBLIC KEY-----\n")).toBe(true);
    expect(pem.endsWith("\n-----END PUBLIC KEY-----")).toBe(true);
    expect(() => crypto.createPublicKey(pem)).not.toThrow();
    expect(decodeSignatureHeader(sign({ a: 1 }))).toMatchObject({ kid: "key-1" });
  });
});

describe("payload and topic", () => {
  it("acknowledges and ignores a signed notification for another topic", async () => {
    const payload = { ...deletionPayload("U1"), metadata: { topic: "PRIORITY_LISTING_REVISION", schemaVersion: "1.0", deprecated: false } };
    expect((await deliver(payload)).status).toBe(204);
    expect(await EbayDeletionNotification.countDocuments()).toBe(0);
  });

  it("rejects a signed deletion notification without a user ID or notification ID", async () => {
    const payload = deletionPayload("U1");
    delete payload.notification.data.userId;
    expect((await deliver(payload)).status).toBe(400);
    expect((await deliver({ metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" }, notification: { data: { userId: "U1" } } })).status).toBe(400);
    expect((await deliver(payload, { body: "{not json", header: sign(payload) })).status).toBe(400);
  });
});

describe("deletion and data isolation", () => {
  async function world() {
    const owner = await createUser();
    const other = await createUser();
    const target = await EbayAccount.create({ user: owner._id, environment: "production", ebayUserId: "U1", username: "seller_one", marketplaceId: "EBAY_US", refreshTokenEnc: "enc" });
    const sameOwnerOtherEbay = await EbayAccount.create({ user: owner._id, environment: "production", ebayUserId: "U3", username: "seller_three", marketplaceId: "EBAY_US" });
    const otherSeller = await EbayAccount.create({ user: other._id, environment: "production", ebayUserId: "U2", username: "seller_two", marketplaceId: "EBAY_US" });
    const sandboxSameId = await EbayAccount.create({ user: other._id, environment: "sandbox", ebayUserId: "U1", username: "testuser_x", marketplaceId: "EBAY_US" });
    for (const [account, user] of [[target, owner], [target, owner], [sameOwnerOtherEbay, owner], [otherSeller, other], [sandboxSameId, other]]) {
      await EbayProduct.create({ user, ebayAccount: account._id, sku: `SKU-${crypto.randomUUID()}`, title: "Item" });
    }
    const shopifyProduct = await Product.create({ user: owner._id, shopifyStore: new mongoose.Types.ObjectId(), shopifyProductId: "1", title: "Shopify Mug" });
    await Notification.create([
      { user: owner._id, type: "success", title: "eBay account seller_one connected", expiresAt: new Date(Date.now() + 86400000) },
      { user: owner._id, type: "success", title: "“Shopify Mug” updated", expiresAt: new Date(Date.now() + 86400000) },
      { user: other._id, type: "success", title: "eBay account seller_two connected", expiresAt: new Date(Date.now() + 86400000) },
    ]);
    return { owner, other, target, sameOwnerOtherEbay, otherSeller, sandboxSameId, shopifyProduct };
  }

  it("deletes only the matched eBay user's data in the notification's environment", async () => {
    const w = await world();
    const res = await deliver(deletionPayload("U1"));
    expect(res.status).toBe(204);

    expect(await EbayAccount.findById(w.target._id)).toBeNull();
    expect(await EbayProduct.countDocuments({ ebayAccount: w.target._id })).toBe(0);
    // Untouched: the same user's other eBay account, another seller, the
    // sandbox account with the same ID, Shopify data and both logins.
    for (const account of [w.sameOwnerOtherEbay, w.otherSeller, w.sandboxSameId]) {
      expect(await EbayAccount.findById(account._id)).not.toBeNull();
      expect(await EbayProduct.countDocuments({ ebayAccount: account._id })).toBe(1);
    }
    expect(await Product.findById(w.shopifyProduct._id)).not.toBeNull();
    expect(await User.countDocuments({ _id: { $in: [w.owner._id, w.other._id] } })).toBe(2);

    const ownerNotes = (await Notification.find({ user: w.owner._id }).lean()).map((n) => n.title).sort();
    expect(ownerNotes).toEqual(["eBay account data deleted", "“Shopify Mug” updated"]);
    expect(await Notification.countDocuments({ user: w.other._id })).toBe(1);

    const record = await EbayDeletionNotification.findOne().lean();
    expect(record).toMatchObject({ status: "completed", environment: "production", outcome: { accounts: 1, products: 2, notifications: 1 } });
    // The processing record holds no personal data.
    expect(JSON.stringify(record)).not.toMatch(/U1|seller_one|nY\+sHZ2/);
  });

  it("a duplicate notification is acknowledged without reprocessing", async () => {
    await world();
    const payload = deletionPayload("U1", { notificationId: "dup-1" });
    expect((await deliver(payload)).status).toBe(204);
    const notes = await Notification.countDocuments();
    expect((await deliver(payload)).status).toBe(204);
    expect(await Notification.countDocuments()).toBe(notes); // no second "data deleted" notice
    expect((await EbayDeletionNotification.findOne({ notificationId: "dup-1" }).lean()).attempts).toBe(2);
  });

  it("a failed attempt is not acknowledged and the redelivery completes it", async () => {
    const w = await world();
    const original = EbayProduct.deleteMany.bind(EbayProduct);
    vi.spyOn(EbayProduct, "deleteMany").mockRejectedValueOnce(Object.assign(new Error("db down"), { code: "X" })).mockImplementation(original);
    const payload = deletionPayload("U1", { notificationId: "retry-1" });
    expect((await deliver(payload)).status).toBe(500);
    expect((await EbayDeletionNotification.findOne({ notificationId: "retry-1" }).lean()).status).toBe("failed");
    expect((await deliver(payload)).status).toBe(204);
    expect(await EbayAccount.findById(w.target._id)).toBeNull();
  });

  it("an eBay user with no SmartSell account is acknowledged with nothing deleted", async () => {
    const w = await world();
    expect((await deliver(deletionPayload("NOT-CONNECTED"))).status).toBe(204);
    expect(await EbayAccount.countDocuments()).toBe(4);
    expect((await EbayDeletionNotification.findOne().lean()).outcome).toEqual({ accounts: 0, products: 0, notifications: 0 });
    expect(w).toBeTruthy();
  });

  it("logs never contain the eBay user ID, username, eiasToken or credentials", async () => {
    const lines = [];
    for (const level of ["log", "warn", "error"]) vi.spyOn(console, level).mockImplementation((...a) => lines.push(a.join(" ")));
    await world();
    const payload = deletionPayload("U1");
    await deliver(payload, { header: sign(payload, { keys: otherKeys }) }); // rejected
    await deliver(payload); // processed
    const text = lines.join("\n");
    expect(text).toContain("ebay_deletion_processed");
    expect(text).not.toMatch(/U1|seller_one|nY\+sHZ2|prod-secret|app-token/);
  });
});
