import { NextResponse } from "next/server";
import { verifyToken, clearSessionCookie, SESSION_COOKIE } from "./lib/jwt";

export function proxy(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/Login", req.url));
  }

  try {
    verifyToken(token);
    return NextResponse.next();
  } catch {
    return clearSessionCookie(NextResponse.redirect(new URL("/Login", req.url)));
  }
}

export const config = {
  matcher: ["/Panel/:path*"],
};
