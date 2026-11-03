import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { safeNextPath } from "@/lib/auth/nextPath";
import { sessionStatus } from "@/lib/auth/sessionStatus";
import { generateToken } from "@/lib/jwt";
import User from "@/models/User";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

const BASE = "http://localhost:3000";
const req = (path, cookie) => new NextRequest(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
const location = (res) => res.headers.get("location");
const passesThrough = (res) => res.headers.get("x-middleware-next") === "1";

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
  let user;
  let session;

  beforeEach(async () => {
    await resetDatabase();
    user = await createUser();
    session = sessionCookieFor(user);
  });

  it("sends signed-out visitors to Login and remembers the page", async () => {
    const res = await proxy(req("/Panel/Expenses?x=1"));
    expect(res.status).toBe(307);
    const url = new URL(location(res));
    expect(url.pathname).toBe("/Login");
    expect(url.searchParams.get("next")).toBe("/Panel/Expenses?x=1");
  });

  it("clears an invalid session cookie", async () => {
    const res = await proxy(req("/Panel/Dashboard", "token=not-a-jwt"));
    expect(new URL(location(res)).pathname).toBe("/Login");
    expect(res.cookies.get("token").maxAge).toBe(0);
  });

  it("lets signed-in users through to the dashboard", async () => {
    expect(passesThrough(await proxy(req("/Panel/Dashboard", session)))).toBe(true);
  });

  it("sends signed-in users away from Login and Signup", async () => {
    for (const page of ["/Login", "/Signup"]) {
      const res = await proxy(req(page, session));
      expect(new URL(location(res)).pathname).toBe("/Panel/Dashboard");
    }
  });

  it("shows Login and Signup to signed-out visitors", async () => {
    for (const page of ["/Login", "/Signup"]) {
      expect(passesThrough(await proxy(req(page)))).toBe(true);
    }
  });

  describe("when the account behind a valid cookie was deleted", () => {
    beforeEach(async () => {
      await User.deleteOne({ _id: user._id });
    });

    it("the dashboard sends to Login and clears the cookie", async () => {
      const res = await proxy(req("/Panel/Dashboard", session));
      expect(new URL(location(res)).pathname).toBe("/Login");
      expect(res.cookies.get("token").maxAge).toBe(0);
    });

    it("Login and Signup are shown (not skipped) and the cookie is cleared", async () => {
      for (const page of ["/Login", "/Signup"]) {
        const res = await proxy(req(page, session));
        expect(passesThrough(res)).toBe(true);
        expect(res.cookies.get("token").maxAge).toBe(0);
      }
    });
  });
});

describe("sessionStatus", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("distinguishes no cookie, a bad cookie, a deleted account and a valid one", async () => {
    const user = await createUser();
    const token = generateToken(user);
    expect(await sessionStatus(undefined)).toBe("none");
    expect(await sessionStatus("garbage")).toBe("invalid");
    expect(await sessionStatus(generateToken({ _id: "not-an-object-id" }))).toBe("invalid");
    expect(await sessionStatus(token)).toBe("valid");
    await User.deleteOne({ _id: user._id });
    expect(await sessionStatus(token)).toBe("invalid");
  });
});
