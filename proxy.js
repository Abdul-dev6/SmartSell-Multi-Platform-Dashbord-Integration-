import { NextResponse } from "next/server";
import { clearSessionCookie, SESSION_COOKIE } from "./lib/jwt";
import { DEFAULT_AFTER_LOGIN } from "./lib/auth/nextPath";
import { sessionStatus } from "./lib/auth/sessionStatus";

const AUTH_PAGES = ["/Login", "/Signup"];

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const status = await sessionStatus(token);

  // Sign-in pages: skip them only for a real, existing account. A stale
  // cookie (expired, or for a deleted account) is cleared so it can't
  // bounce the visitor away from Login.
  if (AUTH_PAGES.includes(pathname)) {
    if (status === "valid") {
      return NextResponse.redirect(new URL(DEFAULT_AFTER_LOGIN, req.url));
    }
    const response = NextResponse.next();
    return status === "invalid" ? clearSessionCookie(response) : response;
  }

  if (status === "valid") {
    return NextResponse.next();
  }

  // Send to sign-in, remembering the dashboard page that was requested.
  const login = new URL("/Login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  const response = NextResponse.redirect(login);
  return status === "invalid" ? clearSessionCookie(response) : response;
}

export const config = {
  matcher: ["/Panel/:path*", "/Login", "/Signup"],
};
