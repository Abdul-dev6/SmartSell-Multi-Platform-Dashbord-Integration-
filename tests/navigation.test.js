import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { safeNextPath } from "@/lib/auth/nextPath";
import { generateToken } from "@/lib/jwt";

const BASE = "http://localhost:3000";
const session = `token=${generateToken({ _id: "507f1f77bcf86cd799439011" })}`;
const req = (path, cookie) => new NextRequest(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
const location = (res) => res.headers.get("location");

describe("safeNextPath", () => {
  it("keeps dashboard paths", () => {
    expect(safeNextPath("/Panel/Expenses")).toBe("/Panel/Expenses");
    expect(safeNextPath("/Panel/Ecommerce/Product?q=mug")).toBe("/Panel/Ecommerce/Product?q=mug");
    expect(safeNextPath("/Panel")).toBe("/Panel");
  });

  it.each([
    "https://evil.example/Panel",
    "//evil.example/Panel",
    "/Panel//evil.example",
    "/\\evil.example",
    "/Login",
    "/api/auth/logout",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])("falls back to the dashboard for %s", (next) => {
    expect(safeNextPath(next)).toBe("/Panel/Dashboard");
  });
});

describe("proxy", () => {
  it("sends signed-out visitors to Login and remembers the page", () => {
    const res = proxy(req("/Panel/Expenses?x=1"));
    expect(res.status).toBe(307);
    const url = new URL(location(res));
    expect(url.pathname).toBe("/Login");
    expect(url.searchParams.get("next")).toBe("/Panel/Expenses?x=1");
  });

  it("clears an invalid session cookie", () => {
    const res = proxy(req("/Panel/Dashboard", "token=not-a-jwt"));
    expect(new URL(location(res)).pathname).toBe("/Login");
    expect(res.cookies.get("token").maxAge).toBe(0);
  });

  it("lets signed-in users through to the dashboard", () => {
    const res = proxy(req("/Panel/Dashboard", session));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sends signed-in users away from Login and Signup", () => {
    for (const page of ["/Login", "/Signup"]) {
      const res = proxy(req(page, session));
      expect(new URL(location(res)).pathname).toBe("/Panel/Dashboard");
    }
  });

  it("shows Login and Signup to signed-out visitors", () => {
    for (const page of ["/Login", "/Signup"]) {
      expect(proxy(req(page)).headers.get("x-middleware-next")).toBe("1");
    }
  });
});
