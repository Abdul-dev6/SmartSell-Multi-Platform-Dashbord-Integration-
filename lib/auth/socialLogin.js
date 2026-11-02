import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { generateToken, setSessionCookie } from "@/lib/jwt";
import { EMAIL_COLLATION, normalizeEmail } from "@/lib/auth/credentials";

// NextAuth handles the Google/GitHub sign-in; this turns its session into
// SmartSell's JWT session cookie, which is what every protected route checks.
export async function completeSocialLogin(req, provider) {
  try {
    const session = await auth();
    const email = normalizeEmail(session?.user?.email);

    if (!email) {
      return NextResponse.redirect(
        new URL(`/Login?error=${provider}_email_required`, req.url),
      );
    }

    await connectDB();
    let user = await User.findOne({ email }).collation(EMAIL_COLLATION);
    if (!user) {
      user = await User.create({
        name: session.user.name,
        email,
      });
    }

    const response = NextResponse.redirect(new URL("/Panel", req.url));
    return setSessionCookie(response, generateToken(user));
  } catch (error) {
    console.error(`${provider} login callback error:`, error.name, error.message);
    return NextResponse.redirect(
      new URL(`/Login?error=${provider}_login_failed`, req.url),
    );
  }
}
