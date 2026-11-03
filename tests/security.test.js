import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import User from "@/models/User";
import RateLimit from "@/models/RateLimit";
import { proxy } from "@/proxy";
import { isCrossSiteRequest } from "@/lib/security/csrf";
import { checkPassword, passwordTooLong } from "@/lib/auth/password";
import { sessionStatus } from "@/lib/auth/sessionStatus";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { generateToken, SESSION_COOKIE } from "@/lib/jwt";
import { PRODUCT_WRITE_LIMIT } from "@/lib/products/http";
import nextConfig from "@/next.config";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: signup } = await import("@/app/api/auth/signup/route");
const { POST: logoutAll } = await import("@/app/api/auth/logout-all/route");
const { POST: createProductRoute } = await import("@/app/api/products/route");

const BASE = "http://localhost:3000";
const apiRequest = (path, { method = "POST", headers = {}, body } = {}) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const blocked = (res) => res.status === 403;

beforeEach(async () => {
  await resetDatabase();
  await Promise.all([User.init(), RateLimit.init()]);
});

describe("cross-site request guard", () => {
  it("blocks state-changing API calls another site started", async () => {
    for (const headers of [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" }, // sibling subdomain
      { origin: "https://evil.example" },
      { origin: "null" },
    ]) {
      for (const method of ["POST", "PATCH", "DELETE"]) {
        const res = await proxy(apiRequest("/api/products/abc", { method, headers, body: {} }));
        expect(blocked(res)).toBe(true);
        expect(await res.json()).toMatchObject({ code: "cross_site_request" });
      }
    }
  });

  it("allows same-origin calls, reads, and non-browser callers (webhooks, cron)", async () => {
    const pass = (req) => expect(proxy(req)).resolves.toSatisfy((res) => res.headers.get("x-middleware-next") === "1");
    await pass(apiRequest("/api/products", { headers: { "sec-fetch-site": "same-origin", origin: BASE }, body: {} }));
    await pass(apiRequest("/api/products", { headers: { origin: BASE }, body: {} }));
    await pass(apiRequest("/api/shopify/webhooks", { headers: { "x-shopify-topic": "products/update" }, body: {} }));
    await pass(apiRequest("/api/inventory", { method: "GET", headers: { "sec-fetch-site": "cross-site" } }));
  });

  it("accepts the forwarded public host behind a proxy", () => {
    const req = apiRequest("/api/products", { headers: { origin: "https://smartsell.example", "x-forwarded-host": "smartsell.example" }, body: {} });
    expect(isCrossSiteRequest(req)).toBe(false);
  });
});

describe("security headers", () => {
  it("forbid framing and MIME sniffing on every path", async () => {
    const [rule] = await nextConfig.headers();
    expect(rule.source).toBe("/:path*");
    const headers = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
    expect(headers).toMatchObject({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
  });
});

describe("sign out everywhere", () => {
  it("invalidates every existing session of the account, but not other accounts", async () => {
    const user = await createUser();
    const other = await createUser();
    const sessionA = sessionCookieFor(user);
    const sessionB = sessionCookieFor(user);
    const otherSession = sessionCookieFor(other);
    const tokenOf = (cookie) => cookie.split("=")[1];

    const res = await logoutAll(apiRequest("/api/auth/logout-all", { headers: { cookie: sessionA } }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE).maxAge).toBe(0);

    expect(await sessionStatus(tokenOf(sessionA))).toBe("invalid");
    expect(await sessionStatus(tokenOf(sessionB))).toBe("invalid");
    expect(await GetCurrentUser(apiRequest("/x", { headers: { cookie: sessionB } }))).toBeNull();
    expect(await sessionStatus(tokenOf(otherSession))).toBe("valid");

    // A new sign-in works again.
    const fresh = await User.findById(user._id);
    expect(await sessionStatus(generateToken(fresh))).toBe("valid");
  });

  it("sessions issued before session versions existed stay valid", async () => {
    const user = await createUser();
    const jwt = (await import("jsonwebtoken")).default;
    const legacy = jwt.sign({ _id: String(user._id) }, process.env.JWT_SECRET, { algorithm: "HS256", audience: "smartsell-session", expiresIn: 600 });
    expect(await sessionStatus(legacy)).toBe("valid");
  });

  it("requires a session", async () => {
    expect((await logoutAll(apiRequest("/api/auth/logout-all"))).status).toBe(401);
  });
});

describe("passwords", () => {
  it("limits passwords to 72 bytes, not characters", () => {
    expect(passwordTooLong("a".repeat(72))).toBe(false);
    expect(passwordTooLong("é".repeat(37))).toBe(true); // 74 bytes, 37 characters
  });

  it("checkPassword always runs a comparison and flags old cheap hashes", async () => {
    const cost10 = await bcrypt.hash("secret-password", 10);
    expect(await checkPassword("secret-password", cost10)).toEqual({ ok: true, needsRehash: true });
    expect(await checkPassword("wrong", cost10)).toEqual({ ok: false, needsRehash: false });
    const compare = vi.spyOn(bcrypt, "compare");
    expect(await checkPassword("anything", undefined)).toEqual({ ok: false, needsRehash: false });
    expect(compare).toHaveBeenCalledTimes(1);
    compare.mockRestore();
  });

  it("signup rejects multi-byte passwords over 72 bytes and stores a cost-12 hash", async () => {
    const tooLong = await signup(apiRequest("/api/auth/signup", { body: { email: "long@example.com", password: "é".repeat(40) } }));
    expect(tooLong.status).toBe(400);

    const ok = await signup(apiRequest("/api/auth/signup", { body: { email: "ok@example.com", password: "correct horse battery" } }));
    expect(ok.status).toBe(201);
    const stored = await User.findOne({ email: "ok@example.com" }).lean();
    expect(bcrypt.getRounds(stored.password)).toBe(12);
  });

  it("login upgrades a cost-10 hash after a successful sign-in", async () => {
    await User.create({ email: "old@example.com", password: await bcrypt.hash("correct horse battery", 10) });
    const res = await login(apiRequest("/api/auth/login", { body: { email: "old@example.com", password: "correct horse battery" } }));
    expect(res.status).toBe(200);
    const stored = await User.findOne({ email: "old@example.com" }).lean();
    expect(bcrypt.getRounds(stored.password)).toBe(12);
    expect(await bcrypt.compare("correct horse battery", stored.password)).toBe(true);
  });
});

describe("rate limits", () => {
  it("caps login attempts per email across different IPs", async () => {
    await User.create({ email: "target@example.com", password: await bcrypt.hash("correct horse battery", 4) });
    const attempt = (ip) =>
      login(apiRequest("/api/auth/login", { headers: { "x-forwarded-for": ip }, body: { email: "target@example.com", password: "wrong-guess" } }));

    for (let i = 0; i < 30; i++) {
      expect((await attempt(`10.0.0.${i}`)).status).toBe(401);
    }
    const res = await attempt("10.0.1.1");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  }, 60000);

  it("caps product writes per account", async () => {
    const user = await createUser();
    await RateLimit.create({
      key: `product-writes:${user._id}`,
      windowStart: new Date(Math.floor(Date.now() / (PRODUCT_WRITE_LIMIT.windowSeconds * 1000)) * PRODUCT_WRITE_LIMIT.windowSeconds * 1000),
      count: PRODUCT_WRITE_LIMIT.limit,
      expiresAt: new Date(Date.now() + 600000),
    });
    const res = await createProductRoute(apiRequest("/api/products", { headers: { cookie: sessionCookieFor(user) }, body: {} }));
    expect(res.status).toBe(429);
  });
});
