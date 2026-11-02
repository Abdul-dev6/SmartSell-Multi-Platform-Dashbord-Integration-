import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createOAuthState,
  isValidShopDomain,
  normalizeShopDomain,
  readOAuthState,
  verifyOAuthQueryHmac,
} from "@/lib/Shopify/oauth";

describe("shop domain validation", () => {
  it("accepts canonical myshopify domains", () => {
    expect(isValidShopDomain("my-store.myshopify.com")).toBe(true);
  });

  it.each([
    "evil.com",
    "my-store.myshopify.com.evil.com",
    "evil.com/my-store.myshopify.com",
    "my-store.myshopify.com:443",
    "my_store.myshopify.com",
    "-store.myshopify.com",
    "",
    null,
    undefined,
  ])("rejects %s", (shop) => {
    expect(isValidShopDomain(shop)).toBe(false);
  });

  it("normalizes user input", () => {
    expect(normalizeShopDomain(" My-Store ")).toBe("my-store.myshopify.com");
    expect(normalizeShopDomain("https://my-store.myshopify.com/admin")).toBe(
      "my-store.myshopify.com",
    );
    expect(normalizeShopDomain("evil.com")).toBe(null);
    expect(normalizeShopDomain("a.b.myshopify.com")).toBe(null);
  });
});

describe("OAuth query HMAC", () => {
  it("matches Shopify's documented example", () => {
    // Example from Shopify's OAuth documentation (secret "hush").
    const params = new URLSearchParams(
      "code=0907a61c0c8d55e99db179b68161bc00&hmac=700e2dadb827fcc8609e9d5ce208b2e9cdaab9df07390d2cbca10d7c328fc4bf&shop=some-shop.myshopify.com&state=0.6784241404160823&timestamp=1337178173",
    );
    expect(verifyOAuthQueryHmac(params, "hush")).toBe(true);
  });

  it("rejects tampered parameters, a wrong secret, or a missing hmac", () => {
    const query = "code=abc&shop=a.myshopify.com&state=xyz&timestamp=1";
    const hmac = crypto.createHmac("sha256", "secret").update(query).digest("hex");
    const ok = new URLSearchParams(`${query}&hmac=${hmac}`);
    expect(verifyOAuthQueryHmac(ok, "secret")).toBe(true);

    const tampered = new URLSearchParams(ok);
    tampered.set("shop", "b.myshopify.com");
    expect(verifyOAuthQueryHmac(tampered, "secret")).toBe(false);
    expect(verifyOAuthQueryHmac(ok, "other-secret")).toBe(false);

    const missing = new URLSearchParams(query);
    expect(verifyOAuthQueryHmac(missing, "secret")).toBe(false);
  });
});

describe("OAuth state", () => {
  it("round-trips nonce, shop and user", () => {
    const { nonce, cookieValue } = createOAuthState({
      shop: "a.myshopify.com",
      userId: "507f1f77bcf86cd799439011",
    });
    const saved = readOAuthState(cookieValue);
    expect(saved.nonce).toBe(nonce);
    expect(saved.shop).toBe("a.myshopify.com");
    expect(saved.uid).toBe("507f1f77bcf86cd799439011");
  });

  it("rejects tampered or foreign values", () => {
    const { cookieValue } = createOAuthState({ shop: "a.myshopify.com", userId: "u" });
    expect(readOAuthState(cookieValue.slice(0, -2) + "xx")).toBe(null);
    expect(readOAuthState("not-a-jwt")).toBe(null);
    expect(readOAuthState(undefined)).toBe(null);
  });
});
