// One-line JSON logs. Route logs carry the request ID set by proxy.js, so an
// error a user reports ("Reference: …") can be found in the Vercel logs;
// background work (sync, webhooks) carries store / webhook identifiers.
//
// Only names, codes, statuses, IDs, counts and (optionally) the error message
// are logged: never request bodies, tokens or customer data. Pass
// { message: false } where a message could contain personal data (e.g.
// MongoDB duplicate-key errors quote the duplicated value) or Shopify
// response text.
//
//   logError(req, "event_name", error, { shop, ... })
//   logWarn(req, "event_name", error, { ... })      // error may be null
//   logInfo(req, "event_name", { ... })

export const REQUEST_ID_HEADER = "x-request-id";
const MAX_MESSAGE = 300;

export function requestIdOf(req) {
  try {
    return req?.headers?.get(REQUEST_ID_HEADER) || req?.headers?.get("x-vercel-id") || null;
  } catch {
    return null;
  }
}

function errorFields(error, includeMessage) {
  if (!error) return {};
  return {
    error: error.name || "Error",
    ...(error.code !== undefined ? { code: String(error.code) } : {}),
    ...(error.response?.status ? { status: error.response.status } : {}),
    ...(includeMessage && error.message ? { message: String(error.message).slice(0, MAX_MESSAGE) } : {}),
  };
}

function write(level, req, event, error, { message = true, ...fields } = {}) {
  const entry = { level, event, requestId: requestIdOf(req), ...errorFields(error, message), ...fields };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logError(req, event, error, options) {
  write("error", req, event, error, options);
}

export function logWarn(req, event, error, options) {
  write("warn", req, event, error, options);
}

export function logInfo(req, event, fields = {}) {
  write("info", req, event, null, { message: false, ...fields });
}
