import UserSchema from "@/models/User";
import connectDB from "@/lib/mongodb";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  EMAIL_COLLATION,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
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

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Please enter a valid email address" },
      { status: 400 },
    );
  }

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
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
    const existingUser = await UserSchema.findOne({ email }).collation(
      EMAIL_COLLATION,
    );
    if (existingUser) {
      return NextResponse.json(
        { message: "Email already registered. Please login." },
        { status: 409 },
      );
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

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
    console.error("Signup error:", error.name, error.message);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}
