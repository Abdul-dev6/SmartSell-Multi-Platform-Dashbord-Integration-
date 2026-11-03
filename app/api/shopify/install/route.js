import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Shopifystore from "@/models/ShopifyStore";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import {
  createOAuthState,
  getShopifyOAuthConfig,
  normalizeShopDomain,
  setOAuthStateCookie,
} from "@/lib/shopify/oauth";
import { logError } from "@/lib/observability/log";

function redirectToIntegration(req, params) {
  const url = new URL("/Panel/Ecommerce/Integration", req.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(req) {
  const url = new URL(req.url);
  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  const force = url.searchParams.get("force") === "true";

  if (!shop) {
    return redirectToIntegration(req, { error: "invalid_shop" });
  }

  try {
    const user = await GetCurrentUser(req);
    if (!user) {
      return NextResponse.redirect(new URL("/Login", req.url));
    }

    const config = getShopifyOAuthConfig();
    if (!config) {
      console.error("Shopify install: OAuth environment variables are missing");
      return redirectToIntegration(req, { error: "shopify_not_configured" });
    }

    await connectDB();
    const existingStore = await Shopifystore.findOne({ shop }).select(
      "user status",
    );

    if (existingStore && !existingStore.user.equals(user._id)) {
      return redirectToIntegration(req, {
        error: "store_owned_by_another_account",
      });
    }

    // Already connected → don't start OAuth again unless reconnecting
    // (e.g. to grant newly added scopes).
    if (existingStore && existingStore.status !== "disconnected" && !force) {
      return redirectToIntegration(req, { connected: "already" });
    }

    const { nonce, cookieValue } = createOAuthState({
      shop,
      userId: user._id,
    });

    const installUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    installUrl.searchParams.set("client_id", config.clientId);
    installUrl.searchParams.set("scope", config.scopes);
    installUrl.searchParams.set("redirect_uri", config.redirectUri);
    installUrl.searchParams.set("state", nonce);

    return setOAuthStateCookie(
      NextResponse.redirect(installUrl.toString()),
      cookieValue,
    );
  } catch (error) {
    logError(req, "Shopify install error", error);
    return redirectToIntegration(req, { error: "connection_failed" });
  }
}
