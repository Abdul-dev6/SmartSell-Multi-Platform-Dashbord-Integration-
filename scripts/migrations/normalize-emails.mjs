// Stage 11 data check (idempotent). Logins look up emails by exact match on
// the trimmed, lowercased value, so every stored email must be in that form.
// Reports users whose email is not, and with --apply lowercases them, unless
// that would collide with another account (those are only reported).
// Prints counts and user IDs only, never email addresses.
//
// Usage:
//   node --env-file=.env scripts/migrations/normalize-emails.mjs           # dry run
//   node --env-file=.env scripts/migrations/normalize-emails.mjs --apply   # make changes

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mongoose = require("mongoose");

const apply = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
const users = mongoose.connection.db.collection("users");

const pending = await users
  .find({ $expr: { $ne: ["$email", { $toLower: { $trim: { input: "$email" } } }] } })
  .project({ email: 1 })
  .toArray();

let fixed = 0;
const collisions = [];
for (const user of pending) {
  const normalized = user.email.trim().toLowerCase();
  if (await users.findOne({ _id: { $ne: user._id }, email: normalized }, { projection: { _id: 1 } })) {
    collisions.push(String(user._id));
    continue;
  }
  if (apply) {
    await users.updateOne({ _id: user._id }, { $set: { email: normalized } });
    fixed += 1;
  }
}

console.log(`${apply ? "APPLY" : "DRY RUN"}: ${pending.length} user(s) with a non-normalized email; ${apply ? `${fixed} fixed` : `${pending.length - collisions.length} would be fixed`}.`);
if (collisions.length) {
  console.log(`Not changed (another account already uses the lowercase address): ${collisions.join(", ")}`);
}
await mongoose.disconnect();
