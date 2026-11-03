import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import {
  OAUTH_STATE_COOKIE,
  clearOAuthStateCookie,
  exchangeCodeForToken,
  getShopifyOAuthConfig,
  isValidShopDomain,
  readOAuthState,
  safeEqual,
  verifyOAuthQueryHmac,
} from "@/lib/shopify/oauth";
import { linkStore, StoreOwnershipError } from "@/lib/shopify/stores";
import { registerStoreWebhooks } from "@/lib/shopify/webhookRegistration";
import { notify } from "@/lib/notifications";
import { logError } from "@/lib/observability/log";

function redirectToIntegration(req, params) {
  const url = new URL("/Panel/Ecommerce/Integration", req.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  // The state is single-use: clear it on every outcome.
  return clearOAuthStateCookie(NextResponse.redirect(url));
}

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const shop = params.get("shop");
  const code = params.get("code");
  const state = params.get("state");

  // Validate everything before contacting Shopify or the database. The shop
  // domain decides where the client secret is sent, so it must be strict.
  if (!isValidShopDomain(shop) || !code || !state) {
    return redirectToIntegration(req, { error: "invalid_callback" });
  }

  const config = getShopifyOAuthConfig();
  if (!config) {
    logError(req, "shopify_oauth_not_configured", null);
    return redirectToIntegration(req, { error: "shopify_not_configured" });
  }

  if (!verifyOAuthQueryHmac(params, config.clientSecret)) {
    return redirectToIntegration(req, { error: "invalid_signature" });
  }

  const savedState = readOAuthState(req.cookies.get(OAUTH_STATE_COOKIE)?.value);
  if (
    !savedState ||
    !safeEqual(savedState.nonce, state) ||
    savedState.shop !== shop
  ) {
    return redirectToIntegration(req, { error: "invalid_state" });
  }

  try {
    const user = await GetCurrentUser(req);
    if (!user || String(user._id) !== savedState.uid) {
      return redirectToIntegration(req, { error: "session_mismatch" });
    }

    const { accessToken, scope } = await exchangeCodeForToken(
      shop,
      code,
      config,
    );

    await connectDB();
    const store = await linkStore({ userId: user._id, shop, accessToken, scope });
    // Subscribe to product/uninstall webhooks. Never fails the connection;
    // the outcome is stored on the store and shown on the Integrations page.
    await registerStoreWebhooks({ _id: store._id, shop, accessToken });
    await notify(user._id, "success", `Shopify store ${shop} connected`, `Permissions granted: ${scope || "none"}.`);

    return redirectToIntegration(req, { connected: "shopify" });
  } catch (error) {
    if (error instanceof StoreOwnershipError) {
      return redirectToIntegration(req, {
        error: "store_owned_by_another_account",
      });
    }

    // Never log the code, token or response body.
    logError(req, "shopify_callback_failed", error, {
      message: false,
      shop,
      ...(error.status ? { status: error.status } : {}),
    });
    return redirectToIntegration(req, { error: "connection_failed" });
  }
}
