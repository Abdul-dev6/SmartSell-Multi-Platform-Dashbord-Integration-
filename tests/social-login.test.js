import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import { isSocialEmailVerified } from "@/lib/auth/verifiedEmail";
import { verifyToken } from "@/lib/jwt";
import { resetDatabase } from "./helpers/db";

const nextAuth = vi.hoisted(() => ({ session: null }));
vi.mock("@/auth", () => ({ auth: async () => nextAuth.session }));

const { completeSocialLogin } = await import("@/lib/auth/socialLogin");

const githubEmails = (emails) => vi.fn(async () => ({ ok: true, json: async () => emails }));
const callback = (provider) => completeSocialLogin(new NextRequest(`http://localhost:3000/api/auth/${provider}`), provider);
const location = (res) => new URL(res.headers.get("location"));
const sessionUserId = (res) => verifyToken(res.cookies.get("token").value)._id;

describe("isSocialEmailVerified", () => {
  it("Google: requires email_verified for the same address", async () => {
    const email = "owner@example.com";
    expect(await isSocialEmailVerified({ provider: "google", email, profile: { email, email_verified: true } })).toBe(true);
    expect(await isSocialEmailVerified({ provider: "google", email, profile: { email, email_verified: false } })).toBe(false);
    expect(await isSocialEmailVerified({ provider: "google", email, profile: { email } })).toBe(false);
    expect(await isSocialEmailVerified({ provider: "google", email, profile: { email: "other@example.com", email_verified: true } })).toBe(false);
  });

  it("GitHub: the sign-in email must be listed as verified", async () => {
    const fetchImpl = githubEmails([
      { email: "Owner@Example.com", primary: true, verified: true },
      { email: "unverified@example.com", primary: false, verified: false },
    ]);
    expect(await isSocialEmailVerified({ provider: "github", email: "owner@example.com", accessToken: "gho_x", fetchImpl })).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.github.com/user/emails");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer gho_x");

    expect(await isSocialEmailVerified({ provider: "github", email: "unverified@example.com", accessToken: "gho_x", fetchImpl })).toBe(false);
    expect(await isSocialEmailVerified({ provider: "github", email: "absent@example.com", accessToken: "gho_x", fetchImpl })).toBe(false);
  });

  it("GitHub: refuses when the check cannot be made", async () => {
    const email = "owner@example.com";
    expect(await isSocialEmailVerified({ provider: "github", email, accessToken: null, fetchImpl: githubEmails([]) })).toBe(false);
    expect(await isSocialEmailVerified({ provider: "github", email, accessToken: "t", fetchImpl: vi.fn(async () => ({ ok: false, status: 403 })) })).toBe(false);
    expect(await isSocialEmailVerified({ provider: "github", email, accessToken: "t", fetchImpl: vi.fn(async () => { throw new Error("network"); }) })).toBe(false);
    expect(await isSocialEmailVerified({ provider: "github", email, accessToken: "t", fetchImpl: githubEmails({ message: "Bad" }) })).toBe(false);
  });

  it("refuses unknown providers and missing emails", async () => {
    expect(await isSocialEmailVerified({ provider: "twitter", email: "a@b.co", profile: { email_verified: true } })).toBe(false);
    expect(await isSocialEmailVerified({ provider: "google", email: "", profile: { email: "", email_verified: true } })).toBe(false);
  });
});

describe("completeSocialLogin", () => {
  let victim;

  beforeEach(async () => {
    await resetDatabase();
    await User.init();
    victim = await User.create({ email: "victim@example.com", password: await bcrypt.hash("correct horse battery", 4) });
  });

  it("an unverified session cannot sign in as an existing password account", async () => {
    nextAuth.session = { user: { email: "victim@example.com", name: "Attacker" } }; // pre-fix session: no flag
    const res = await callback("github");
    expect(location(res).pathname).toBe("/Login");
    expect(location(res).searchParams.get("error")).toBe("github_email_unverified");
    expect(res.cookies.get("token")).toBeUndefined();
  });

  it("an explicitly unverified session is refused and creates no account", async () => {
    nextAuth.session = { user: { email: "new@example.com" }, emailVerified: false };
    const res = await callback("google");
    expect(location(res).searchParams.get("error")).toBe("google_email_unverified");
    expect(await User.countDocuments()).toBe(1);
  });

  it("a verified session signs in to the matching account", async () => {
    nextAuth.session = { user: { email: "Victim@Example.com" }, emailVerified: true, provider: "google" };
    const res = await callback("google");
    expect(location(res).pathname).toBe("/Panel");
    expect(sessionUserId(res)).toBe(String(victim._id));
  });

  it("a verified session for a new email creates one account", async () => {
    nextAuth.session = { user: { email: "fresh@example.com", name: "Fresh" }, emailVerified: true, provider: "github" };
    const res = await callback("github");
    expect(location(res).pathname).toBe("/Panel");
    const created = await User.findOne({ email: "fresh@example.com" }).lean();
    expect(sessionUserId(res)).toBe(String(created._id));
  });
});
