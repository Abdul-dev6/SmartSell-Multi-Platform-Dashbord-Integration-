import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { sessionVersionMatches, verifyToken } from "@/lib/jwt";

// "none"    – no session cookie
// "invalid" – forged or expired token, or the account no longer exists
//             (e.g. the user was deleted from the database), or the
//             account was signed out everywhere after it was issued
// "valid"   – signed token for an existing account
//
// If the database cannot be reached, a correctly signed token counts as
// valid: every API route checks the account again, so this only decides
// which page to show and must not sign everyone out during an outage.
export async function sessionStatus(token) {
  if (!token) return "none";

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return "invalid";
  }
  if (!mongoose.isValidObjectId(decoded._id)) return "invalid";

  try {
    await connectDB();
    const user = await User.findById(decoded._id).select("sessionVersion").lean();
    return user && sessionVersionMatches(decoded, user) ? "valid" : "invalid";
  } catch (error) {
    console.error("Session check could not reach the database:", error.name);
    return "valid";
  }
}
