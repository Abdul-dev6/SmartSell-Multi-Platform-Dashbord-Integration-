import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { SESSION_COOKIE, sessionVersionMatches, verifyToken } from "@/lib/jwt";

// Returns the signed-in user document (without password), or null.
export async function GetCurrentUser(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return null;
  }

  if (!mongoose.isValidObjectId(decoded._id)) {
    return null;
  }

  await connectDB();
  const user = await User.findById(decoded._id).select("-password");
  // Signed out everywhere since this session was issued.
  return user && sessionVersionMatches(decoded, user) ? user : null;
}

// For API routes: either { user } or { response } carrying a 401.
export async function requireUser(req) {
  const user = await GetCurrentUser(req);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 },
      ),
    };
  }
  return { user, response: null };
}
