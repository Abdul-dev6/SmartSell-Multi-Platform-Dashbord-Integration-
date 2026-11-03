// One-line JSON logs that carry the request ID set by proxy.js, so an error a
// user reports ("Reference: …") can be found in the Vercel logs.
//
// Only names, codes, statuses, IDs and (optionally) the error message are
// logged: never request bodies, tokens or customer data. Pass
// { message: false } where a message could contain personal data (e.g.
// MongoDB duplicate-key errors quote the duplicated value).

export const REQUEST_ID_HEADER = "x-request-id";
const MAX_MESSAGE = 300;

export function requestIdOf(req) {
  try {
    return req?.headers?.get(REQUEST_ID_HEADER) || req?.headers?.get("x-vercel-id") || null;
  } catch {
    return null;
  }
}

export function logError(req, event, error, { message = true, ...fields } = {}) {
  const entry = {
    level: "error",
    event,
    requestId: requestIdOf(req),
    error: error?.name || "Error",
    ...(error?.code !== undefined ? { code: String(error.code) } : {}),
    ...(error?.response?.status ? { status: error.response.status } : {}),
    ...(message && error?.message ? { message: String(error.message).slice(0, MAX_MESSAGE) } : {}),
    ...fields,
  };
  console.error(JSON.stringify(entry));
}
