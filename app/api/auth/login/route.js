import UserSchema from "@/models/User";
import connectDB from "@/lib/mongodb";
import { NextResponse } from "next/server";
import { generateToken, setSessionCookie } from "@/lib/jwt";
import { normalizeEmail, readJsonBody } from "@/lib/auth/credentials";
import { checkPassword, hashPassword, passwordTooLong } from "@/lib/auth/password";
import {
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "@/lib/rateLimit";

const invalidCredentials = () =>
  NextResponse.json({ message: "Invalid email or password" }, { status: 401 });

export async function POST(req) {
  const body = await readJsonBody(req);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { message: "All fields are required" },
      { status: 400 },
    );
  }

  if (passwordTooLong(password)) {
    return invalidCredentials();
  }

  try {
    await connectDB();

    // Per address and IP (stops one client hammering an account) and per
    // address alone (caps guessing spread across many IPs).
    for (const [key, limit, windowSeconds] of [
      [`login:${getClientIp(req)}:${email}`, 10, 15 * 60],
      [`login-email:${email}`, 30, 60 * 60],
    ]) {
      const result = await checkRateLimit(key, { limit, windowSeconds });
      if (!result.allowed) {
        return rateLimitedResponse(NextResponse, result.retryAfter);
      }
    }

    const user = await UserSchema.findOne({ email });

    // Always runs a full bcrypt comparison, so an unknown email takes as long
    // to answer as a wrong password.
    const { ok, needsRehash } = await checkPassword(password, user?.password);

    if (user && !user.password) {
      return NextResponse.json(
        { message: "This account uses Google or GitHub sign-in" },
        { status: 401 },
      );
    }
    if (!user || !ok) {
      return invalidCredentials();
    }

    if (needsRehash) {
      // Upgrade older, cheaper hashes now that the password is known.
      await UserSchema.updateOne(
        { _id: user._id, password: user.password },
        { $set: { password: await hashPassword(password) } },
      ).catch((error) => console.error("Password rehash failed:", error.name));
    }

    const res = NextResponse.json(
      { message: "Login successful" },
      { status: 200 },
    );
    return setSessionCookie(res, generateToken(user));
  } catch (error) {
    console.error("Login error:", error.name, error.message);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
