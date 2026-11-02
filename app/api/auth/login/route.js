import UserSchema from "@/models/User";
import connectDB from "@/lib/mongodb";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { generateToken, setSessionCookie } from "@/lib/jwt";
import {
  EMAIL_COLLATION,
  MAX_PASSWORD_LENGTH,
  normalizeEmail,
  readJsonBody,
} from "@/lib/auth/credentials";
import {
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "@/lib/rateLimit";

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

  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { message: "Invalid email or password" },
      { status: 401 },
    );
  }

  try {
    await connectDB();

    const limit = await checkRateLimit(`login:${getClientIp(req)}:${email}`, {
      limit: 10,
      windowSeconds: 15 * 60,
    });
    if (!limit.allowed) {
      return rateLimitedResponse(NextResponse, limit.retryAfter);
    }

    const user = await UserSchema.findOne({ email }).collation(EMAIL_COLLATION);

    if (!user) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { message: "This account uses Google or GitHub sign-in" },
        { status: 401 },
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
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
