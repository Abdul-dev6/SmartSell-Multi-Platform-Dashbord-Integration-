import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Shopifystore from "@/models/ShopifyStore";
import {
  disconnectStore,
  getActiveStoreForUser,
  linkStore,
  StoreOwnershipError,
} from "@/lib/shopify/stores";
import { createUser, resetDatabase } from "./helpers/db";

const SHOP = "test-store.myshopify.com";

beforeEach(async () => {
  await resetDatabase();
  await Shopifystore.init(); // make sure unique indexes exist
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("store ownership", () => {
  it("links a store and hides the token by default", async () => {
    const user = await createUser();
    await linkStore({ userId: user._id, shop: SHOP, accessToken: "tok", scope: "read_products" });

    const store = await getActiveStoreForUser(user._id);
    expect(store.shop).toBe(SHOP);
    expect(store.accessToken).toBeUndefined();

    const withToken = await getActiveStoreForUser(user._id, { withToken: true });
    expect(withToken.accessToken).toBe("tok");
  });

  it("re-linking by the same user updates the token instead of duplicating", async () => {
    const user = await createUser();
    await linkStore({ userId: user._id, shop: SHOP, accessToken: "old", scope: "read_products" });
    await linkStore({ userId: user._id, shop: SHOP, accessToken: "new", scope: "read_products,write_products" });

    expect(await Shopifystore.countDocuments({ shop: SHOP })).toBe(1);
    const store = await getActiveStoreForUser(user._id, { withToken: true });
    expect(store.accessToken).toBe("new");
    expect(store.scope).toBe("read_products,write_products");
  });

  it("refuses to link a store owned by another user", async () => {
    const owner = await createUser();
    const other = await createUser();
    await linkStore({ userId: owner._id, shop: SHOP, accessToken: "tok", scope: "" });

    await expect(
      linkStore({ userId: other._id, shop: SHOP, accessToken: "tok2", scope: "" }),
    ).rejects.toBeInstanceOf(StoreOwnershipError);

    const store = await Shopifystore.findOne({ shop: SHOP }).select("+accessToken");
    expect(store.user.equals(owner._id)).toBe(true);
    expect(store.accessToken).toBe("tok");
  });

  it("enforces one owner per shop at the database level", async () => {
    const a = await createUser();
    const b = await createUser();
    await Shopifystore.create({ user: a._id, shop: SHOP, accessToken: "x" });
    await expect(
      Shopifystore.create({ user: b._id, shop: SHOP, accessToken: "y" }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("never returns another user's store", async () => {
    const owner = await createUser();
    const other = await createUser();
    const store = await linkStore({ userId: owner._id, shop: SHOP, accessToken: "tok", scope: "" });

    expect(await getActiveStoreForUser(other._id)).toBe(null);
    expect(await getActiveStoreForUser(other._id, { storeId: store._id })).toBe(null);
    expect(await getActiveStoreForUser(other._id, { shop: SHOP })).toBe(null);
    expect(await getActiveStoreForUser(owner._id, { storeId: "not-an-id" })).toBe(null);
  });

  it("disconnect revokes at Shopify, clears the token and allows the owner to reconnect", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await createUser();
    const store = await linkStore({ userId: user._id, shop: SHOP, accessToken: "tok", scope: "" });

    const result = await disconnectStore(user._id, store._id);
    expect(result).toEqual({ shop: SHOP, revokedAtShopify: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://${SHOP}/admin/api_permissions/current.json`,
      expect.objectContaining({ method: "DELETE" }),
    );

    const saved = await Shopifystore.findById(store._id).select("+accessToken");
    expect(saved.status).toBe("disconnected");
    expect(saved.accessToken).toBeUndefined();
    expect(await getActiveStoreForUser(user._id)).toBe(null);

    await linkStore({ userId: user._id, shop: SHOP, accessToken: "tok2", scope: "" });
    expect((await getActiveStoreForUser(user._id)).status).toBe("active");
  });

  it("disconnect reports when Shopify could not be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const user = await createUser();
    const store = await linkStore({ userId: user._id, shop: SHOP, accessToken: "tok", scope: "" });

    const result = await disconnectStore(user._id, store._id);
    expect(result.revokedAtShopify).toBe(false);
    expect((await Shopifystore.findById(store._id)).status).toBe("disconnected");
  });

  it("a user cannot disconnect another user's store", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const owner = await createUser();
    const other = await createUser();
    const store = await linkStore({ userId: owner._id, shop: SHOP, accessToken: "tok", scope: "" });

    expect(await disconnectStore(other._id, store._id)).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
    expect((await Shopifystore.findById(store._id)).status).toBe("active");
  });
});
