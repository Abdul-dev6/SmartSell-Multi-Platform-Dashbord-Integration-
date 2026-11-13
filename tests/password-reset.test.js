import fs from "node:fs";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import User from "@/models/User";
import RateLimit from "@/models/RateLimit";
import Notification from "@/models/Notification";
import { hashResetToken, newResetToken, RESET_TOKEN_TTL_MS } from "@/lib/auth/passwordReset";
import { sessionStatus } from "@/lib/auth/sessionStatus";
import { passwordStrength } from "@/lib/auth/passwordStrength";
import { resetDatabase, sessionCookieFor } from "./helpers/db";

// Capture outgoing email instead of sending it.
const mail = vi.hoisted(() => ({ sent: [], configured: true, fail: false }));
vi.mock("@/lib/email", () => ({
  isEmailConfigured: () => mail.configured,
  sendEmail: async (message) => {
    if (mail.fail) throw new Error("SMTP down");
    mail.sent.push(message);
  },
}));

const { POST: forgot } = await import("@/app/api/auth/forgot-password/route");
const { POST: reset } = await import("@/app/api/auth/reset-password/route");
const { POST: login } = await import("@/app/api/auth/login/route");

const BASE = "http://localhost:3000";
let ipSeq = 0;
const post = (handler, path, body, ip = `10.1.0.${++ipSeq}`) =>
  handler(new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }));
const tokenFrom = (message) => message.text.match(/token=([a-f0-9]{64})/)[1];

let user;
beforeEach(async () => {
  await resetDatabase();
  await Promise.all([User.init(), RateLimit.init(), Notification.init()]);
  mail.sent = [];
  mail.configured = true;
  mail.fail = false;
  user = await User.create({ email: "owner@example.com", password: await bcrypt.hash("old-password-1", 4) });
});
afterEach(() => vi.useRealTimers());

describe("forgot password", () => {
  it("emails a one-time link and stores only a hash of the token", async () => {
    const res = await post(forgot, "/api/auth/forgot-password", { email: "Owner@Example.com" });
    expect(res.status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "owner@example.com", subject: "Reset your SmartSell password" });
    expect(mail.sent[0].text).toContain(`${BASE}/ResetPassword?token=`);

    const token = tokenFrom(mail.sent[0]);
    const stored = await User.findById(user._id).select("+passwordResetHash +passwordResetExpires").lean();
    expect(stored.passwordResetHash).toBe(hashResetToken(token));
    expect(stored.passwordResetHash).not.toContain(token);
    expect(stored.passwordResetExpires.getTime()).toBeGreaterThan(Date.now() + RESET_TOKEN_TTL_MS - 5000);
  });

  it("gives the same answer for unknown emails and sends nothing", async () => {
    const known = await (await post(forgot, "/api/auth/forgot-password", { email: "owner@example.com" })).json();
    const unknown = await (await post(forgot, "/api/auth/forgot-password", { email: "nobody@example.com" })).json();
    expect(unknown).toEqual(known);
    expect(mail.sent).toHaveLength(1);
  });

  it("keeps the same answer when sending fails", async () => {
    mail.fail = true;
    const res = await post(forgot, "/api/auth/forgot-password", { email: "owner@example.com" });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("says so when email is not set up, and rejects invalid addresses", async () => {
    mail.configured = false;
    const off = await post(forgot, "/api/auth/forgot-password", { email: "owner@example.com" });
    expect(off.status).toBe(503);
    expect((await off.json()).code).toBe("email_not_configured");
    mail.configured = true;
    expect((await post(forgot, "/api/auth/forgot-password", { email: "not-an-email" })).status).toBe(400);
  });

  it("is rate limited per email across IPs", async () => {
    for (let i = 0; i < 3; i++) await post(forgot, "/api/auth/forgot-password", { email: "owner@example.com" });
    const res = await post(forgot, "/api/auth/forgot-password", { email: "owner@example.com" });
    expect(res.status).toBe(429);
    expect(mail.sent).toHaveLength(3);
  });
});

describe("reset password", () => {
  async function requestToken() {
    await post(forgot, "/api/auth/forgot-password", { email: "owner@example.com" });
    return tokenFrom(mail.sent.at(-1));
  }

  it("sets the new password, signs out every session, and the link works once", async () => {
    const oldSession = sessionCookieFor(user).split("=")[1];
    const token = await requestToken();

    const res = await post(reset, "/api/auth/reset-password", { token, password: "new-password-1" });
    expect(res.status).toBe(200);
    expect(await sessionStatus(oldSession)).toBe("invalid");
    expect((await post(login, "/api/auth/login", { email: "owner@example.com", password: "new-password-1" })).status).toBe(200);
    expect((await post(login, "/api/auth/login", { email: "owner@example.com", password: "old-password-1" })).status).toBe(401);
    expect((await Notification.findOne({ user: user._id }).lean()).title).toBe("Password reset");

    const again = await post(reset, "/api/auth/reset-password", { token, password: "another-pass-2" });
    expect(again.status).toBe(400);
    expect((await again.json()).code).toBe("invalid_token");
  });

  it("refuses expired, unknown or malformed links, and weak passwords", async () => {
    const token = await requestToken();
    await User.updateOne({ _id: user._id }, { $set: { passwordResetExpires: new Date(Date.now() - 1000) } });
    expect((await post(reset, "/api/auth/reset-password", { token, password: "new-password-1" })).status).toBe(400);

    expect((await post(reset, "/api/auth/reset-password", { token: newResetToken().token, password: "new-password-1" })).status).toBe(400);
    expect((await post(reset, "/api/auth/reset-password", { token: "abc", password: "new-password-1" })).status).toBe(400);

    const fresh = await requestToken();
    const weak = await post(reset, "/api/auth/reset-password", { token: fresh, password: "short" });
    expect(weak.status).toBe(400);
    expect((await weak.json()).message).toMatch(/between 8 and 72/);
  });

  it("a new request replaces the previous link", async () => {
    const first = await requestToken();
    await requestToken();
    expect((await post(reset, "/api/auth/reset-password", { token: first, password: "new-password-1" })).status).toBe(400);
  });
});

describe("sign-in pages", () => {
  it("login has show/hide password and a Forgot password link; signup uses the strength meter", () => {
    const loginPage = fs.readFileSync("app/(public)/Login/page.jsx", "utf8");
    const signupPage = fs.readFileSync("app/(public)/Signup/page.jsx", "utf8");
    expect(loginPage).toContain('href="/ForgotPassword"');
    expect(loginPage).toContain("<PasswordInput");
    expect(signupPage).toMatch(/<PasswordInput[\s\S]*showStrength/);
  });

  it("password strength guidance", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("Abcdefghijkl")).toBe(3);
    expect(passwordStrength("Abcdefghijk1!")).toBe(4);
  });
});
