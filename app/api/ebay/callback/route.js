import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { getEbayConfig } from "@/lib/ebay/config";
import {
  EBAY_OAUTH_STATE_COOKIE,
  clearEbayOAuthStateCookie,
  exchangeCodeForTokens,
  fetchEbayIdentity,
  readEbayOAuthState,
  safeEqual,
} from "@/lib/ebay/oauth";
import { EbayAccountOwnershipError, linkEbayAccount } from "@/lib/ebay/accounts";
import { checkEbaySetup } from "@/lib/ebay/setup";
import { notify } from "@/lib/notifications";
import { logError, logWarn } from "@/lib/observability/log";

const MAX_CODE_LENGTH = 4096;

function redirectToIntegration(req, params) {
  const url = new URL("/Panel/Ecommerce/Integration", req.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  // The state is single-use: clear it on every outcome.
  return clearEbayOAuthStateCookie(NextResponse.redirect(url));
}

// eBay redirects here (the RuName's accepted/declined URL) with ?code&state,
// or without a code when the seller declined.
export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");

  // Declined consent: eBay may omit `state` on the declined URL. Nothing is
  // exchanged or stored without a code, so no state check is needed here.
  if (!code) {
    return redirectToIntegration(req, { error: "ebay_authorization_declined" });
  }
  const saved = readEbayOAuthState(req.cookies.get(EBAY_OAUTH_STATE_COOKIE)?.value);
  if (!state || !saved || !safeEqual(saved.nonce, state)) {
    return redirectToIntegration(req, { error: "invalid_state" });
  }
  if (code.length > MAX_CODE_LENGTH) {
    return redirectToIntegration(req, { error: "invalid_callback" });
  }

  const config = getEbayConfig();
  if (!config) {
    logError(req, "ebay_oauth_not_configured", null);
    return redirectToIntegration(req, { error: "ebay_not_configured" });
  }
  if (saved.env !== config.environment) {
    return redirectToIntegration(req, { error: "invalid_state" });
  }

  try {
    const user = await GetCurrentUser(req);
    if (!user || String(user._id) !== saved.uid) {
      return redirectToIntegration(req, { error: "session_mismatch" });
    }

    const tokens = await exchangeCodeForTokens(code, config);
    const identity = await fetchEbayIdentity(tokens.accessToken, config);

    await connectDB();
    const account = await linkEbayAccount({
      userId: user._id,
      environment: config.environment,
      marketplaceId: config.marketplaceId,
      identity,
      tokens,
      scopes: config.scopes,
    });

    // Read business policies and locations now so the Integrations page can
    // say what is missing. Never fails the connection.
    try {
      await checkEbaySetup(account);
    } catch (error) {
      logWarn(req, "ebay_setup_check_failed", error, { message: false });
    }

    await notify(
      user._id,
      "success",
      `eBay account ${identity.username || identity.ebayUserId} connected`,
      config.environment === "sandbox" ? "Connected to the eBay Sandbox." : "",
    );
    return redirectToIntegration(req, { connected: "ebay" });
  } catch (error) {
    if (error instanceof EbayAccountOwnershipError) {
      return redirectToIntegration(req, { error: "ebay_account_owned_by_another_account" });
    }
    // Never log the code, tokens or response bodies.
    logError(req, "ebay_callback_failed", error, {
      message: false,
      ...(error.status ? { status: error.status } : {}),
    });
    return redirectToIntegration(req, { error: "ebay_connection_failed" });
  }
}
