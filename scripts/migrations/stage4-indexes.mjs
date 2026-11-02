// Stage 4 index migration (idempotent, no document changes).
//
// 1. products: the unique (shopifyStore, shopifyProductId) index becomes
//    partial, so products created in SmartSell can be saved as "pending"
//    before Shopify assigns an ID. MongoDB cannot alter an index in place, so
//    it is dropped and recreated with the same key and name.
// 2. Creates the other Stage 4 indexes (products idempotency key, sync status;
//    webhookevents) if they are missing.
//
// Usage:
//   node --env-file=.env scripts/migrations/stage4-indexes.mjs           # dry run
//   node --env-file=.env scripts/migrations/stage4-indexes.mjs --apply   # make changes

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const PRODUCT_KEY = { shopifyStore: 1, shopifyProductId: 1 };
const PARTIAL_ID = { shopifyProductId: { $type: "string" } };

const EXTRA_INDEXES = {
  products: [
    [{ shopifyStore: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }],
    [{ shopifyStore: 1, syncStatus: 1 }, {}],
    [{ user: 1, archivedAt: 1 }, {}],
  ],
  webhookevents: [
    [{ webhookId: 1 }, { unique: true }],
    [{ status: 1, nextAttemptAt: 1 }, {}],
    [{ shopifyStore: 1, resourceId: 1, resourceUpdatedAt: -1 }, {}],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
};

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function collectionExists(db, name) {
  return (await db.listCollections({ name }).toArray()).length > 0;
}

async function migrateProductIdIndex(db, { apply, log }) {
  if (!(await collectionExists(db, "products"))) {
    log("products: collection does not exist yet; Mongoose will create the correct index.");
    return;
  }

  const products = db.collection("products");
  const existing = (await products.indexes()).find((i) => sameKey(i.key, PRODUCT_KEY));

  if (existing && sameKey(existing.partialFilterExpression, PARTIAL_ID) && existing.unique) {
    log(`products: ${existing.name} is already partial unique. Nothing to do.`);
    return;
  }

  // Refuse to proceed if the new unique index could not be built.
  const duplicates = await products
    .aggregate([
      { $match: PARTIAL_ID },
      { $group: { _id: { s: "$shopifyStore", p: "$shopifyProductId" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  if (duplicates.length) {
    throw new Error(
      `products: found duplicate (shopifyStore, shopifyProductId) pairs, e.g. ${JSON.stringify(duplicates[0]._id)}. Resolve them before migrating; nothing was changed.`,
    );
  }

  const name = existing?.name || "shopifyStore_1_shopifyProductId_1";
  log(
    existing
      ? `products: will replace ${name} (unique) with a partial unique index of the same key and name.`
      : `products: will create partial unique index ${name}.`,
  );
  if (!apply) return;

  if (existing) {
    await products.dropIndex(existing.name);
  }
  try {
    await products.createIndex(PRODUCT_KEY, { name, unique: true, partialFilterExpression: PARTIAL_ID });
  } catch (error) {
    // Put the original index back so uniqueness is never left unenforced.
    if (existing) {
      await products.createIndex(PRODUCT_KEY, { name: existing.name, unique: true }).catch(() => {});
    }
    throw error;
  }
  log(`products: ${name} is now partial unique.`);
}

async function ensureExtraIndexes(db, { apply, log }) {
  for (const [collection, specs] of Object.entries(EXTRA_INDEXES)) {
    const exists = await collectionExists(db, collection);
    const current = exists ? await db.collection(collection).indexes() : [];
    for (const [key, options] of specs) {
      if (current.some((i) => sameKey(i.key, key))) {
        continue;
      }
      log(`${collection}: will create index ${JSON.stringify(key)}${options.unique ? " (unique)" : ""}.`);
      if (apply) {
        await db.collection(collection).createIndex(key, options);
      }
    }
  }
}

export async function migrate(db, { apply = false, log = console.log } = {}) {
  await migrateProductIdIndex(db, { apply, log });
  await ensureExtraIndexes(db, { apply, log });

  if (await collectionExists(db, "products")) {
    const withoutId = await db.collection("products").countDocuments({ shopifyProductId: { $not: { $type: "string" } } });
    log(`products: ${withoutId} document(s) without a Shopify ID (expected 0 before product creation is enabled).`);
  }
  log(apply ? "Migration applied." : "Dry run only. Re-run with --apply to make these changes.");
}

// CLI entry point.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mongoose = createRequire(process.cwd() + "/package.json")("mongoose");
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/migrations/stage4-indexes.mjs");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await migrate(mongoose.connection.db, { apply: process.argv.includes("--apply") });
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
