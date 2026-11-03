import { NextResponse } from "next/server";
import { clearSessionCookie, SESSION_COOKIE } from "./lib/jwt";
import { DEFAULT_AFTER_LOGIN } from "./lib/auth/nextPath";
import { sessionStatus } from "./lib/auth/sessionStatus";
import { isCrossSiteRequest } from "./lib/security/csrf";
import { REQUEST_ID_HEADER } from "./lib/observability/log";

const AUTH_PAGES = ["/Login", "/Signup"];

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;

  // API routes authenticate themselves; here they get a request ID (logged
  // by the route, returned as x-request-id so users can quote it) and the
  // cross-site check for state-changing requests (no session lookup).
  if (pathname.startsWith("/api/")) {
    const requestId = req.headers.get("x-vercel-id") || crypto.randomUUID();
    if (isCrossSiteRequest(req)) {
      const blocked = NextResponse.json(
        { success: false, code: "cross_site_request", message: "Request blocked." },
        { status: 403 },
      );
      blocked.headers.set(REQUEST_ID_HEADER, requestId);
      return blocked;
    }
    const headers = new Headers(req.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

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
  matcher: ["/Panel/:path*", "/Login", "/Signup", "/api/:path*"],
};
