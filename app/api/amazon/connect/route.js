import { NextResponse } from "next/server";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAmazonOAuthConfig, isAmazonConnectEnabled } from "@/lib/amazon/config";
import { buildConsentUrl, createOAuthState, noReferrer, redirectToIntegration } from "@/lib/amazon/oauth";
import { logError } from "@/lib/observability/log";

// Step 3 of Amazon's website authorization workflow: sends the signed-in
// seller to Seller Central's consent page. Also used to reconnect (same
// seller → same account record). 404 unless AMAZON_CONNECT_ENABLED=true and
// the production OAuth settings are complete.
export async function GET(req) {
  if (!isAmazonConnectEnabled()) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  try {
    const user = await GetCurrentUser(req);
    if (!user) {
      const login = new URL("/Login", req.url);
      login.searchParams.set("next", "/Panel/Ecommerce/Integration");
      return noReferrer(NextResponse.redirect(login));
    }
    // Each request stores a state record: limit them per user.
    const rate = await checkRateLimit(`amazon-oauth:${user._id}`, { limit: 30, windowSeconds: 600 });
    if (!rate.allowed) return redirectToIntegration(req, { amazon_error: "rate_limited" });
    const state = await createOAuthState(user._id, "consent");
    return noReferrer(NextResponse.redirect(buildConsentUrl(getAmazonOAuthConfig(), state)));
  } catch (error) {
    logError(req, "amazon_connect_failed", error, { message: false });
    return redirectToIntegration(req, { amazon_error: "connect_failed" });
  }
}
