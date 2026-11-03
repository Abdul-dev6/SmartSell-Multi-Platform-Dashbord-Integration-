import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "token";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

const SESSION_AUDIENCE = "smartsell-session";

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

export const generateToken = (user) => {
  return jwt.sign({ _id: String(user._id), sv: user.sessionVersion || 0 }, getJwtSecret(), {
    algorithm: "HS256",
    audience: SESSION_AUDIENCE,
    expiresIn: SESSION_MAX_AGE,
  });
};

// Throws when the token is missing, expired, tampered with, or not a session token.
export const verifyToken = (token) => {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    audience: SESSION_AUDIENCE,
  });

  if (!decoded?._id || !decoded.exp) {
    throw new Error("Invalid session token");
  }

  return decoded;
};

// A session is current while its version matches the account's. Tokens
// issued before versions existed carry none and count as version 0.
export function sessionVersionMatches(decoded, user) {
  return (decoded?.sv || 0) === (user?.sessionVersion || 0);
}

function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  };
}

export function setSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return response;
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
