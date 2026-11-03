import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/jwt";

// NextAuth's own session cookies (used only during Google/GitHub sign-in).
const NEXTAUTH_COOKIES = [
  ["authjs.session-token", false],
  ["__Secure-authjs.session-token", true],
];

// A response that removes every sign-in cookie from this browser.
export function signedOutResponse(body = { success: true }) {
  const response = NextResponse.json(body);
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
