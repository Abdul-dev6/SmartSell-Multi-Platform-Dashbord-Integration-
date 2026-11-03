import { NextResponse } from "next/server";
import { verifyToken, clearSessionCookie, SESSION_COOKIE } from "./lib/jwt";
import { DEFAULT_AFTER_LOGIN } from "./lib/auth/nextPath";

const AUTH_PAGES = ["/Login", "/Signup"];

function hasValidSession(token) {
  if (!token) return false;
  try {
    verifyToken(token);
    return true;
  } catch {
    return false;
  }
}

export function proxy(req) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = hasValidSession(token);

  // Signed-in users don't need the sign-in pages.
  if (AUTH_PAGES.includes(pathname)) {
    return signedIn
      ? NextResponse.redirect(new URL(DEFAULT_AFTER_LOGIN, req.url))
      : NextResponse.next();
  }

  if (signedIn) {
    return NextResponse.next();
  }

  // Send to sign-in, remembering the dashboard page that was requested.
  const login = new URL("/Login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  const response = NextResponse.redirect(login);
  return token ? clearSessionCookie(response) : response;
}

export const config = {
  matcher: ["/Panel/:path*", "/Login", "/Signup"],
};
