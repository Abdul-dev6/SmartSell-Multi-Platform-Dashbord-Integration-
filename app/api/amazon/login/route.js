import { NextResponse } from "next/server";
import AmazonAccount from "@/models/AmazonAccount";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAmazonOAuthConfig, isAmazonConnectEnabled } from "@/lib/amazon/config";
import {
  buildAmazonCallbackRedirect,
  createOAuthState,
  isAmazonCallbackUri,
  noReferrer,
  redirectToIntegration,
  SELLING_PARTNER_RE,
} from "@/lib/amazon/oauth";
import { logError, logWarn } from "@/lib/observability/log";

// Log-in URI (register it in the Developer Console), steps 5–8 of Amazon's
// website authorization workflow. Amazon sends the seller here with
// amazon_callback_uri, amazon_state and selling_partner_id. The seller must be
// signed in to SmartSell; the authorization is bound to that user with a new
// single-use state, and the seller is sent back to Amazon to finish.
export async function GET(req) {
  if (!isAmazonConnectEnabled()) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  const params = new URL(req.url).searchParams;
  const amazonCallbackUri = params.get("amazon_callback_uri");
  const amazonState = params.get("amazon_state");
  const sellingPartnerId = params.get("selling_partner_id");

  if (!isAmazonCallbackUri(amazonCallbackUri) || !amazonState || amazonState.length > 2048 || !SELLING_PARTNER_RE.test(sellingPartnerId || "")) {
    logWarn(req, "amazon_login_invalid_request", null, {});
    return redirectToIntegration(req, { amazon_error: "invalid_request" });
  }
  try {
    const user = await GetCurrentUser(req);
    if (!user) {
      // Sign in first, then start again from SmartSell's Connect button (the
      // sign-in redirect only allows dashboard paths, so Amazon's one-time
      // parameters are not carried through it).
      const login = new URL("/Login", req.url);
      login.searchParams.set("next", "/Panel/Ecommerce/Integration?amazon_error=sign_in_required");
      return noReferrer(NextResponse.redirect(login));
    }
    // Each request stores a state record: limit them per user.
    const rate = await checkRateLimit(`amazon-oauth:${user._id}`, { limit: 30, windowSeconds: 600 });
    if (!rate.allowed) return redirectToIntegration(req, { amazon_error: "rate_limited" });
    const owner = await AmazonAccount.findOne({ environment: "production", sellingPartnerId }).select("user").lean();
    if (owner && String(owner.user) !== String(user._id)) return redirectToIntegration(req, { amazon_error: "linked_elsewhere" });

    const config = getAmazonOAuthConfig();
    const state = await createOAuthState(user._id, "callback", { sellingPartnerId });
    return noReferrer(NextResponse.redirect(buildAmazonCallbackRedirect(amazonCallbackUri, { amazonState, state, redirectUri: config.redirectUri, beta: config.beta })));
  } catch (error) {
    logError(req, "amazon_login_failed", error, { message: false });
    return redirectToIntegration(req, { amazon_error: "connect_failed" });
  }
}
