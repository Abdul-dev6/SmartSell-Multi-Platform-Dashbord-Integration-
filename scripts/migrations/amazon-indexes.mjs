// Amazon SP-API index migration (idempotent, no document changes, never
// drops an index). Mongoose also creates these indexes when the app starts
// (autoIndex); this script lets you check or create them explicitly first.
//
// Usage:
//   node --env-file=.env scripts/migrations/amazon-indexes.mjs           # dry run (report only)
//   node --env-file=.env scripts/migrations/amazon-indexes.mjs --apply   # create missing indexes
//
// Mirrors the index definitions in models/Amazon*.js.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const AMAZON_INDEXES = {
  amazonaccounts: [
    [{ user: 1 }, {}],
    [{ environment: 1, sellingPartnerId: 1 }, { unique: true }],
  ],
  amazonlistings: [
    [{ user: 1 }, {}],
    [{ amazonAccount: 1, marketplaceId: 1, sku: 1 }, { unique: true }],
    [{ user: 1, amazonAccount: 1, itemName: 1 }, {}],
    [{ user: 1, asin: 1 }, {}],
  ],
  amazonorders: [
    [{ amazonAccount: 1, orderId: 1 }, { unique: true }],
    [{ user: 1, amazonAccount: 1, createdTime: -1 }, {}],
  ],
  amazoninventories: [
    [{ amazonAccount: 1, marketplaceId: 1, sellerSku: 1 }, { unique: true }],
    [{ user: 1, amazonAccount: 1 }, {}],
  ],
  amazonfinancialevents: [
    [{ amazonAccount: 1, kind: 1, eventId: 1 }, { unique: true }],
    [{ user: 1, amazonAccount: 1, postedDate: -1 }, {}],
  ],
  amazonsyncjobs: [
    [{ amazonAccount: 1 }, { unique: true, partialFilterExpression: { active: true }, name: "one_active_job_per_account" }],
    [{ active: 1, createdAt: 1 }, {}],
    [{ user: 1, amazonAccount: 1, createdAt: -1 }, {}],
  ],
  amazonsynccheckpoints: [[{ amazonAccount: 1, resource: 1 }, { unique: true }]],
  amazonoauthstates: [
    [{ stateHash: 1 }, { unique: true }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
};

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function migrate(db, { apply = false, log = console.log } = {}) {
  let missing = 0;
  for (const [collection, indexes] of Object.entries(AMAZON_INDEXES)) {
    const exists = (await db.listCollections({ name: collection }).toArray()).length > 0;
    const current = exists ? await db.collection(collection).indexes() : [];
    for (const [key, options] of indexes) {
      const found = current.find((i) => sameKey(i.key, key));
      if (found) {
        if (Boolean(found.unique) !== Boolean(options.unique)) log(`${collection}: index ${JSON.stringify(key)} exists with different uniqueness; left unchanged — review manually.`);
        continue;
      }
      missing += 1;
      log(`${collection}: ${apply ? "creating" : "would create"} index ${JSON.stringify(key)}${options.unique ? " (unique)" : ""}.`);
      if (apply) await db.collection(collection).createIndex(key, options);
    }
  }
  log(missing === 0 ? "All Amazon indexes exist." : apply ? "Migration applied." : "Dry run only. Re-run with --apply to create the missing indexes.");
  return { missing };
}

// CLI entry point.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mongoose = createRequire(process.cwd() + "/package.json")("mongoose");
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/migrations/amazon-indexes.mjs");
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
