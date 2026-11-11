import { NextResponse } from "next/server";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { getEbayConfig } from "@/lib/ebay/config";
import { isEncryptionConfigured } from "@/lib/ebay/crypto";
import { buildAuthorizeUrl, createEbayOAuthState, setEbayOAuthStateCookie } from "@/lib/ebay/oauth";
import { logError } from "@/lib/observability/log";

function redirectToIntegration(req, params) {
  const url = new URL("/Panel/Ecommerce/Integration", req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

// Starts eBay OAuth for the signed-in seller. Each seller authorizes their
// own eBay account; SmartSell's developer keys only identify the app.
export async function GET(req) {
  try {
    const user = await GetCurrentUser(req);
    if (!user) {
      const login = new URL("/Login", req.url);
      login.searchParams.set("next", "/Panel/Ecommerce/Integration");
      return NextResponse.redirect(login);
    }

    const config = getEbayConfig();
    if (!config || !isEncryptionConfigured()) {
      logError(req, "ebay_oauth_not_configured", null);
      return redirectToIntegration(req, { error: "ebay_not_configured" });
    }

    const { nonce, cookieValue } = createEbayOAuthState({ userId: user._id, environment: config.environment });
    return setEbayOAuthStateCookie(NextResponse.redirect(buildAuthorizeUrl(config, nonce)), cookieValue);
  } catch (error) {
    logError(req, "ebay_connect_failed", error);
    return redirectToIntegration(req, { error: "ebay_connection_failed" });
  }
}
