import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { generateToken, SESSION_MAX_AGE, verifyToken } from "@/lib/jwt";
import { createOAuthState } from "@/lib/shopify/oauth";

const user = { _id: "507f1f77bcf86cd799439011" };

describe("session JWT", () => {
  it("expires after 7 days", () => {
    const decoded = verifyToken(generateToken(user));
    expect(decoded._id).toBe(user._id);
    expect(decoded.exp - decoded.iat).toBe(SESSION_MAX_AGE);
    expect(SESSION_MAX_AGE).toBe(7 * 24 * 60 * 60);
  });

  it("rejects legacy tokens that never expire", () => {
    const legacy = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);
    expect(() => verifyToken(legacy)).toThrow();
  });

  it("rejects expired tokens", () => {
    const expired = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      audience: "smartsell-session",
      expiresIn: -10,
    });
    expect(() => verifyToken(expired)).toThrow();
  });

  it("rejects tokens signed with another secret or algorithm", () => {
    const forged = jwt.sign({ _id: user._id }, "attacker", {
      audience: "smartsell-session",
      expiresIn: 60,
    });
    expect(() => verifyToken(forged)).toThrow();

    const unsigned = jwt.sign({ _id: user._id }, null, {
      algorithm: "none",
      audience: "smartsell-session",
      expiresIn: 60,
    });
    expect(() => verifyToken(unsigned)).toThrow();
  });

  it("does not accept an OAuth state value as a session", () => {
    const { cookieValue } = createOAuthState({ shop: "a.myshopify.com", userId: user._id });
    expect(() => verifyToken(cookieValue)).toThrow();
  });
});
