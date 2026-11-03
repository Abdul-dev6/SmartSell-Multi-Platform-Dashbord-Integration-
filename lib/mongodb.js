import mongoose from "mongoose";
import { logError } from "@/lib/observability/log";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set. Add it to .env locally, or to the Vercel project's environment variables.");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
  };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        // Each Vercel instance keeps its own pool; many instances share the
        // cluster's connection limit (about 500 on Atlas free/shared tiers).
        maxPoolSize: 10,
        // Close connections a quiet instance no longer uses.
        maxIdleTimeMS: 60000,
      })
      .then((mongoose) => mongoose)
      .catch((error) => {
        // Name, code and message only; the URI (with credentials) is never logged.
        logError(null, "mongodb_connect_failed", error);
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Allow the next request to retry instead of caching the rejection forever.
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default connectDB;
