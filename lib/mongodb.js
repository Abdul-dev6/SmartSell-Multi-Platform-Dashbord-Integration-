import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in your .env.local file");
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
      .connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
      .then((mongoose) => mongoose)
      .catch((error) => {
        // Log the error name/message only; the URI contains credentials.
        console.error("MongoDB connection error:", error.name, error.message);
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
