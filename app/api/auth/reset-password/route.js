import { NextResponse } from "next/server";
import User from "@/models/User";
import connectDB from "@/lib/mongodb";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, readJsonBody } from "@/lib/auth/credentials";
import { hashPassword, passwordTooLong } from "@/lib/auth/password";
import { hashResetToken, isResetTokenFormat } from "@/lib/auth/passwordReset";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { notify } from "@/lib/notifications";
import { logError } from "@/lib/observability/log";

const invalidLink = () =>
  NextResponse.json(
    { success: false, code: "invalid_token", message: "This reset link is invalid or has expired. Request a new one." },
    { status: 400 },
  );

// Sets a new password with an emailed reset link: { token, password }.
// The link works once; every existing session is signed out.
export async function POST(req) {
  try {
    const body = (await readJsonBody(req)) || {};
    const token = body.token;
    const password = typeof body.password === "string" ? body.password : "";

    if (!isResetTokenFormat(token)) return invalidLink();
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH || passwordTooLong(password)) {
      return NextResponse.json(
        { success: false, message: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }

    await connectDB();
    const limit = await checkRateLimit(`reset:${getClientIp(req)}`, { limit: 10, windowSeconds: 15 * 60 });
    if (!limit.allowed) return rateLimitedResponse(NextResponse, limit.retryAfter);

    // Matching, expiry check and invalidation happen in one atomic update,
    // so a link cannot be used twice even by parallel requests.
    const user = await User.findOneAndUpdate(
      { passwordResetHash: hashResetToken(token), passwordResetExpires: { $gt: new Date() } },
      {
        $set: { password: await hashPassword(password) },
        $unset: { passwordResetHash: 1, passwordResetExpires: 1 },
        $inc: { sessionVersion: 1 },
      },
      { returnDocument: "after" },
    ).select("_id");
    if (!user) return invalidLink();

    await notify(user._id, "success", "Password reset", "Your password was changed with a reset link. Other devices were signed out.");
    return NextResponse.json({ success: true, message: "Your password was changed. Sign in with your new password." });
  } catch (error) {
    logError(req, "Reset password error", error);
    return NextResponse.json({ success: false, message: "Could not reset the password. Please try again." }, { status: 500 });
  }
}
