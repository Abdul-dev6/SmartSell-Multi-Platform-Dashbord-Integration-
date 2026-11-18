import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { AmazonApiError } from "@/lib/amazon/client";
import { AmazonAuthError } from "@/lib/amazon/lwa";
import { AmazonReconnectRequiredError } from "@/lib/amazon/accounts";
import { AmazonServiceError } from "@/lib/amazon/errors";
import { logError } from "@/lib/observability/log";

// Shared wrapper for the Amazon management API routes: a session is required,
// optional per-user rate limit, and every error becomes a safe JSON response
// (no tokens, credentials, stack traces or Amazon response bodies).

export const ok = (body, status = 200) => NextResponse.json({ success: true, ...body }, { status });
const fail = (status, code, message, extra = {}) => NextResponse.json({ success: false, code, message, ...extra }, { status });

export function amazonErrorResponse(error, req, label) {
  if (error instanceof AmazonServiceError) return fail(error.status, error.code, error.message, error.extra);
  if (error instanceof AmazonReconnectRequiredError) return fail(409, "reconnect_required", "Amazon no longer accepts SmartSell's authorization. Reconnect your Amazon account.");
  if (error instanceof AmazonApiError) {
    if (error.status === 429 || error.code === "throttled") return fail(429, "amazon_throttled", "Amazon is limiting requests right now. Try again in a few minutes.");
    if (error.status === 404) return fail(404, "amazon_not_found", "Amazon could not find this item.");
    if (error.status === 401 || error.status === 403) return fail(502, "amazon_forbidden", "Amazon refused the request. The app may be missing a required SP-API role.");
    if (error.status === 400 || error.status === 422) return fail(422, "amazon_rejected", `Amazon rejected the request (${error.code}).`);
    return fail(502, "amazon_unavailable", "Amazon is not responding right now. Try again later.");
  }
  if (error instanceof AmazonAuthError) return fail(502, "amazon_auth_failed", "Could not sign in to Amazon (LWA).");
  logError(req, label || "amazon_route_error", error, { message: false });
  return fail(500, "unexpected", "The Amazon request could not be completed.");
}

// handler({ req, ctx, user, body }) → Response
export function amazonRoute(handler, { label, rateLimit, json = false } = {}) {
  return async (req, ctx) => {
    try {
      const { user, response } = await requireUser(req);
      if (response) return response;
      if (rateLimit) {
        const rate = await checkRateLimit(`amazon-${rateLimit.bucket}:${user._id}`, { limit: rateLimit.limit, windowSeconds: rateLimit.windowSeconds || 600 });
        if (!rate.allowed) return rateLimitedResponse(NextResponse, rate.retryAfter);
      }
      const body = json ? (await readJsonBody(req)) || {} : undefined;
      return await handler({ req, ctx, user, body });
    } catch (error) {
      return amazonErrorResponse(error, req, label);
    }
  };
}

export const searchParams = (req) => new URL(req.url).searchParams;
export const intParam = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function toClientListing(l) {
  return {
    id: String(l._id),
    accountId: String(l.amazonAccount),
    environment: l.environment,
    marketplaceId: l.marketplaceId,
    sku: l.sku,
    asin: l.asin || null,
    title: l.itemName || null,
    productType: l.productType || null,
    conditionType: l.conditionType || null,
    statuses: l.statuses || [],
    price: l.price ?? null,
    currency: l.currency || null,
    fulfillment: l.fulfillmentChannel ? (l.fulfillmentChannel === "DEFAULT" ? "MFN" : "FBA") : null,
    quantity: l.quantity ?? null,
    issues: l.issues || [],
    origin: l.origin,
    submission: l.submission?.status ? { operation: l.submission.operation, status: l.submission.status, submittedAt: l.submission.submittedAt || null } : null,
    pending: Boolean(l.pendingOperation?.startedAt),
    lastSyncedAt: l.lastSyncedAt || null,
  };
}
