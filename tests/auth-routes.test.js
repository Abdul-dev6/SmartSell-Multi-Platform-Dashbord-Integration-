import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import User from "@/models/User";
import RateLimit from "@/models/RateLimit";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { verifyToken } from "@/lib/jwt";
import { resetDatabase, sessionCookieFor } from "./helpers/db";

const BASE = "http://localhost:3000";

function jsonRequest(path, body, ip = "10.0.0.1") {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetDatabase();
  await RateLimit.init();
  await User.init();
});

describe("signup", () => {
  it("creates a user with a hashed password and normalized email", async () => {
    const res = await signup(jsonRequest("/api/auth/signup", { email: " New@Example.com ", password: "longenough" }));
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: "new@example.com" });
    expect(user).not.toBe(null);
    expect(user.password).not.toBe("longenough");
    expect(await bcrypt.compare("longenough", user.password)).toBe(true);
  });

  it("validates input", async () => {
    expect((await signup(jsonRequest("/api/auth/signup", "not json"))).status).toBe(400);
    expect((await signup(jsonRequest("/api/auth/signup", { email: "bad", password: "longenough" }))).status).toBe(400);
    expect((await signup(jsonRequest("/api/auth/signup", { email: "a@b.co", password: "short" }))).status).toBe(400);
    expect((await signup(jsonRequest("/api/auth/signup", { email: { $gt: "" }, password: "longenough" }))).status).toBe(400);
  });

  it("rejects duplicates case-insensitively (emails are stored lowercase)", async () => {
    await User.create({ email: "Legacy@Example.com", password: "x" });
    const res = await signup(jsonRequest("/api/auth/signup", { email: "legacy@example.com", password: "longenough" }));
    expect(res.status).toBe(409);
  });

  it("is rate limited per IP", async () => {
    let last;
    for (let i = 0; i < 6; i++) {
      last = await signup(jsonRequest("/api/auth/signup", { email: `u${i}@example.com`, password: "longenough" }, "10.9.9.9"));
    }
    expect(last.status).toBe(429);
    expect(last.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});

describe("login", () => {
  beforeEach(async () => {
    await User.create({ email: "Legacy@Example.com", password: await bcrypt.hash("correct-password", 10) });
  });

  it("sets an httpOnly 7-day session cookie on success (mixed-case input still matches)", async () => {
    const res = await login(jsonRequest("/api/auth/login", { email: "legacy@example.com", password: "correct-password" }));
    expect(res.status).toBe(200);
    const cookie = res.cookies.get("token");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.maxAge).toBe(7 * 24 * 60 * 60);
    expect(verifyToken(cookie.value).exp).toBeDefined();
  });

  it("returns 401 for a wrong password or unknown user, and 400 for bad input", async () => {
    expect((await login(jsonRequest("/api/auth/login", { email: "legacy@example.com", password: "nope" }))).status).toBe(401);
    expect((await login(jsonRequest("/api/auth/login", { email: "ghost@example.com", password: "nope" }))).status).toBe(401);
    expect((await login(jsonRequest("/api/auth/login", "{"))).status).toBe(400);
    expect((await login(jsonRequest("/api/auth/login", { email: { $ne: null }, password: "x" }))).status).toBe(400);
  });

  it("is rate limited per IP and email", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await login(jsonRequest("/api/auth/login", { email: "legacy@example.com", password: "wrong" }, "10.1.1.1"));
    }
    expect(last.status).toBe(429);
  });
});

describe("session helpers", () => {
  it("GetCurrentUser returns null for missing/invalid tokens and the user (without password) otherwise", async () => {
    const user = await User.create({ email: "s@example.com", password: "hash" });
    expect(await GetCurrentUser(new NextRequest(BASE))).toBe(null);
    expect(await GetCurrentUser(new NextRequest(BASE, { headers: { cookie: "token=garbage" } }))).toBe(null);

    const current = await GetCurrentUser(new NextRequest(BASE, { headers: { cookie: sessionCookieFor(user) } }));
    expect(String(current._id)).toBe(String(user._id));
    expect(current.password).toBeUndefined();
  });

  it("GetCurrentUser returns null when the user was deleted", async () => {
    const user = await User.create({ email: "gone@example.com" });
    const cookie = sessionCookieFor(user);
    await User.deleteOne({ _id: user._id });
    expect(await GetCurrentUser(new NextRequest(BASE, { headers: { cookie } }))).toBe(null);
  });

  it("logout clears the session cookie", async () => {
    const res = await logout();
    expect(res.cookies.get("token").maxAge).toBe(0);
  });
});
