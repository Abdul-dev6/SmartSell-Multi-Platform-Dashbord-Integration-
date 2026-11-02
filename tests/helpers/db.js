import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { generateToken, SESSION_COOKIE } from "@/lib/jwt";

export async function resetDatabase() {
  await connectDB();
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
