import { NextResponse } from "next/server";
import User from "@/models/User";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, readJsonBody } from "@/lib/auth/credentials";
import { checkPassword, hashPassword, passwordTooLong } from "@/lib/auth/password";
import { generateToken, setSessionCookie } from "@/lib/jwt";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/log";
import { notify } from "@/lib/notifications";

const bad = (status, message, errors) => NextResponse.json({ success: false, message, ...(errors ? { errors } : {}) }, { status });

// Changes the password of an email/password account: { currentPassword,
// newPassword }. Every other session is signed out; this one gets a new
// session cookie. (Notifications are recorded here: after the change the
// request's own session is no longer valid, so a wrapper could not.)
export async function POST(req) {
  let userId = null;
  const fail = async (status, message, errors) => {
    if (userId) await notify(userId, "error", "Password not changed", message);
    return bad(status, message, errors);
  };
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    userId = user._id;

    const limit = await checkRateLimit(`password-change:${user._id}`, { limit: 5, windowSeconds: 15 * 60 });
    if (!limit.allowed) return rateLimitedResponse(NextResponse, limit.retryAfter);

    const body = (await readJsonBody(req)) || {};
    const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const next = typeof body.newPassword === "string" ? body.newPassword : "";

    const account = await User.findById(user._id).select("+password");
    if (!account?.password) {
      return fail(400, "This account signs in with Google or GitHub and has no password to change.");
    }
    if (next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH || passwordTooLong(next)) {
      return fail(400, `The new password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`, { newPassword: "Invalid length" });
    }
    if (next === current) {
      return fail(400, "The new password must be different from the current one.", { newPassword: "Same as current" });
    }
    const { ok } = await checkPassword(current, account.password);
    if (!ok) return fail(400, "The current password is incorrect.", { currentPassword: "Incorrect" });

    const updated = await User.findOneAndUpdate(
      { _id: user._id, password: account.password },
      { $set: { password: await hashPassword(next) }, $inc: { sessionVersion: 1 } },
      { returnDocument: "after" },
    );
    if (!updated) return fail(409, "Your password was changed elsewhere. Reload and try again.");

    await notify(user._id, "success", "Password changed", "Other devices were signed out.");
    const res = NextResponse.json({ success: true, message: "Password changed. Other devices were signed out." });
    return setSessionCookie(res, generateToken(updated));
  } catch (error) {
    logError(req, "Change password error", error);
    return fail(500, "Could not change your password.");
  }
}
