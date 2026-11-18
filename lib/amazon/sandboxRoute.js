import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { isSandboxViewerEnabled } from "@/lib/amazon/sandboxViewer";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

// Shared guard for the Amazon Sandbox routes: 404 unless the Sandbox viewer
// is enabled (never in a production build without AMAZON_SANDBOX_VIEWER),
// then a session, then a per-user rate limit. Returns { user } or { response }.
export async function sandboxGuard(req, bucket, limit) {
  if (!isSandboxViewerEnabled()) {
    return { response: NextResponse.json({ success: false, message: "Not found" }, { status: 404 }) };
  }
  const { user, response } = await requireUser(req);
  if (response) return { response };
  const rate = await checkRateLimit(`amazon-sandbox-${bucket}:${user._id}`, { limit, windowSeconds: 600 });
  if (!rate.allowed) return { response: rateLimitedResponse(NextResponse, rate.retryAfter) };
  return { user };
}

export const sandboxFail = (status, code, message) => NextResponse.json({ success: false, code, message }, { status });
