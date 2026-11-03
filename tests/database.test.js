import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import User from "@/models/User";
import Product from "@/models/Product";
import connectDB from "@/lib/mongodb";
import { linkStore } from "@/lib/shopify/stores";
import { upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import { upsertInventoryLevel } from "@/lib/shopify/syncinventory";
import Inventory from "@/models/Inventory";
import { createUser, resetDatabase } from "./helpers/db";
import { shopifyProduct } from "./helpers/fakeShopify";

// Stages of a winning plan, e.g. ["FETCH", "IXSCAN(email_1)"].
async function planOf(query) {
  const explained = await query.explain("queryPlanner");
  const root = explained.queryPlanner.winningPlan.queryPlan || explained.queryPlanner.winningPlan;
  const stages = [];
  const walk = (p) => {
    if (!p) return;
    stages.push(p.stage + (p.indexName ? `(${p.indexName})` : ""));
    walk(p.inputStage);
    (p.inputStages || []).forEach(walk);
  };
  walk(root);
  return stages;
}

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([User.syncIndexes(), Product.syncIndexes(), Inventory.syncIndexes()]);
});

describe("query plans", () => {
  it("email lookups (login, signup, social sign-in) use the unique email index", async () => {
    await User.create({ email: "someone@example.com" });
    const stages = await planOf(User.findOne({ email: "someone@example.com" }));
    // MongoDB 8 may report EXPRESS_IXSCAN for a unique-index point lookup.
    expect(stages.some((s) => /IXSCAN\(email_1\)$/.test(s))).toBe(true);
    expect(stages).not.toContain("COLLSCAN");
    expect((await User.create({ email: "  Mixed@Example.COM " })).email).toBe("mixed@example.com");
  });

  it("the inventory webhook's owner lookup uses the variant inventory-item index", async () => {
    const user = await createUser();
    const store = await linkStore({ userId: user._id, shop: "idx-store.myshopify.com", accessToken: "t", scope: "" });
    await upsertShopifyProducts(store, [shopifyProduct(1), shopifyProduct(2)]);

    const stages = await planOf(Product.findOne({ shopifyStore: store._id, "variants.inventoryItemId": "100" }));
    expect(stages).toContain("IXSCAN(shopifyStore_1_variants.inventoryItemId_1)");

    // And the lookup still links the level to its product.
    await upsertInventoryLevel(store, { inventory_item_id: 200, location_id: 7, available: 4, updated_at: "2026-10-01T00:00:00Z" });
    expect(await Inventory.findOne({ inventoryItemId: "200" }).lean()).toMatchObject({ productId: "2", variantId: "20" });
  });
});

describe("connection", () => {
  it("uses a bounded pool", async () => {
    await connectDB();
    expect(mongoose.connection.getClient().options.maxPoolSize).toBe(10);
    expect(mongoose.connection.getClient().options.maxIdleTimeMS).toBe(60000);
  });
});

describe("test database guard", () => {
  it("refuses to wipe a database that is not a throwaway test database", async () => {
    const realName = mongoose.connection.db.databaseName;
    expect(realName).toMatch(/^smartsell-test-/);
    const db = mongoose.connection.useDb("SmartSell", { useCache: false });
    const original = mongoose.connection.db;
    Object.defineProperty(mongoose.connection, "db", { value: db.db, configurable: true });
    try {
      await expect(resetDatabase()).rejects.toThrow(/Refusing to wipe database "SmartSell"/);
    } finally {
      Object.defineProperty(mongoose.connection, "db", { value: original, configurable: true });
    }
    expect(mongoose.connection.db.databaseName).toBe(realName);
  });
});
