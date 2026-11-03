import UserSchema from "@/models/User";
import connectDB from "@/lib/mongodb";
import { NextResponse } from "next/server";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  normalizeEmail,
  readJsonBody,
} from "@/lib/auth/credentials";
import { hashPassword, passwordTooLong } from "@/lib/auth/password";
import {
  checkRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "@/lib/rateLimit";
import { logError } from "@/lib/observability/log";

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

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Please enter a valid email address" },
      { status: 400 },
    );
  }

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    // bcrypt reads 72 bytes; accented letters and emoji take several each.
    passwordTooLong(password)
  ) {
    return NextResponse.json(
      {
        message: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  try {
    await connectDB();

    const limit = await checkRateLimit(`signup:${getClientIp(req)}`, {
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return rateLimitedResponse(NextResponse, limit.retryAfter);
    }

    // Check if user already exists
    const existingUser = await UserSchema.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { message: "Email already registered. Please login." },
        { status: 409 },
      );
    }

    // Hash password before saving
    const hashedPassword = await hashPassword(password);

    await UserSchema.create({
      email,
      password: hashedPassword,
    });

    return NextResponse.json(
      { message: "Account created successfully!" },
      { status: 201 },
    );
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { message: "Email already registered. Please login." },
        { status: 409 },
      );
    }
    logError(req, "Signup error", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
