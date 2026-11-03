import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { generateToken, SESSION_COOKIE } from "@/lib/jwt";

// Test databases are named smartsell-test-<uuid> (tests/setup/env.js).
const TEST_DB_RE = /^smartsell-test-[0-9a-f-]{36}$/;

export async function resetDatabase() {
  await connectDB();
  const name = mongoose.connection.db.databaseName;
  if (!TEST_DB_RE.test(name)) {
    throw new Error(`Refusing to wipe database "${name}": it is not a throwaway test database.`);
  }
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function createUser(email = `user${Date.now()}${Math.random()}@test.dev`) {
  await connectDB();
  return User.create({ email });
}

export function sessionCookieFor(user) {
  return `${SESSION_COOKIE}=${generateToken(user)}`;
}
