import { NextResponse } from "next/server";
import User from "@/models/User";
import connectDB from "@/lib/mongodb";
import { isValidEmail, normalizeEmail, readJsonBody } from "@/lib/auth/credentials";
import { appBaseUrl, newResetToken, resetEmail } from "@/lib/auth/passwordReset";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/log";

// The same answer whether or not the email has an account, so the form
// cannot be used to find out who is registered.
const SENT = {
  success: true,
  message: "If an account exists for that email, we've sent a link to reset the password. It expires in 30 minutes.",
};

// Starts a password reset: { email }. Emails a one-time link.
export async function POST(req) {
  try {
    const body = (await readJsonBody(req)) || {};
    const email = normalizeEmail(body.email);
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Enter a valid email address." }, { status: 400 });
    }

    const baseUrl = appBaseUrl(req);
    if (!isEmailConfigured() || !baseUrl) {
      return NextResponse.json(
        {
          success: false,
          code: "email_not_configured",
          message: "Password reset by email isn't set up yet. Sign in with Google or GitHub, or contact the site owner.",
        },
        { status: 503 },
      );
    }

    await connectDB();
    for (const [key, limit, windowSeconds] of [
      [`forgot:${getClientIp(req)}`, 5, 15 * 60],
      [`forgot-email:${email}`, 3, 60 * 60],
    ]) {
      const result = await checkRateLimit(key, { limit, windowSeconds });
      if (!result.allowed) return rateLimitedResponse(NextResponse, result.retryAfter);
    }

    const user = await User.findOne({ email }).select("_id email");
    if (user) {
      const { token, hash, expiresAt } = newResetToken();
      await User.updateOne({ _id: user._id }, { $set: { passwordResetHash: hash, passwordResetExpires: expiresAt } });
      const link = `${baseUrl}/ResetPassword?token=${token}`;
      try {
        await sendEmail({ to: user.email, ...resetEmail(link) });
      } catch (error) {
        // Logged without the address or link; the reply stays the same.
        logError(req, "password_reset_email_failed", error, { message: false });
      }
    }
    return NextResponse.json(SENT);
  } catch (error) {
    logError(req, "Forgot password error", error);
    return NextResponse.json({ success: false, message: "Could not start the password reset. Please try again." }, { status: 500 });
  }
}
