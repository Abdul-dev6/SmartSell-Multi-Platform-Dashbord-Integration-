import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/jwt";

// NextAuth's own session cookies (used only during Google/GitHub sign-in).
const NEXTAUTH_COOKIES = [
  ["authjs.session-token", false],
  ["__Secure-authjs.session-token", true],
];

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);

  for (const [name, secure] of NEXTAUTH_COOKIES) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
