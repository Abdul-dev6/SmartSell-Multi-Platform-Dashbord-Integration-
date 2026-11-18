import { NextResponse } from "next/server";
import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { getAmazonConfig, getAmazonOAuthConfig, isAmazonConnectEnabled, isRegionMarketplace } from "@/lib/amazon/config";
import { consumeOAuthState, redirectToIntegration, SELLING_PARTNER_RE } from "@/lib/amazon/oauth";
import { exchangeAuthorizationCode } from "@/lib/amazon/lwa";
import { createAmazonClient } from "@/lib/amazon/client";
import { fetchMarketplaceParticipations } from "@/lib/amazon/sellers";
import { AmazonAccountOwnershipError, linkAmazonAccount } from "@/lib/amazon/accounts";
import { enqueueSync } from "@/lib/amazon/sync";
import { notify } from "@/lib/notifications";
import { logError, logInfo, logWarn } from "@/lib/observability/log";

const MAX_CODE_LENGTH = 4096;

// Redirect URI (register exactly AMAZON_REDIRECT_URI in the Developer
// Console), steps 10–14 of Amazon's website authorization workflow. Amazon
// sends state, selling_partner_id and spapi_oauth_code. The state must be one
// this SmartSell user's log-in step created (single use, ten minutes) for the
// same seller. The code (valid five minutes) is exchanged for a refresh
// token, the token is verified with getMarketplaceParticipations, and the
// account is saved encrypted. The initial sync is queued as a durable job.
// Codes and tokens are never logged.
export async function GET(req) {
  if (!isAmazonConnectEnabled()) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  const params = new URL(req.url).searchParams;

  if (params.get("error")) {
    logWarn(req, "amazon_authorization_declined", null, { error: (params.get("error") || "").slice(0, 40) });
    return redirectToIntegration(req, { amazon_error: "authorization_declined" });
  }
  const state = params.get("state");
  const sellingPartnerId = params.get("selling_partner_id");
  const code = params.get("spapi_oauth_code");
  if (!code || code.length > MAX_CODE_LENGTH) return redirectToIntegration(req, { amazon_error: "missing_code" });
  if (!SELLING_PARTNER_RE.test(sellingPartnerId || "")) return redirectToIntegration(req, { amazon_error: "invalid_request" });

  try {
    const user = await GetCurrentUser(req);
    if (!user) return redirectToIntegration(req, { amazon_error: "session_required" });

    const stored = await consumeOAuthState(state, user._id, "callback");
    if (!stored || stored.sellingPartnerId !== sellingPartnerId) {
      logWarn(req, "amazon_invalid_state", null, {});
      return redirectToIntegration(req, { amazon_error: "invalid_state" });
    }

    const config = getAmazonOAuthConfig();
    let refreshToken;
    try {
      ({ refreshToken } = await exchangeAuthorizationCode({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, code }));
    } catch (error) {
      logWarn(req, "amazon_token_exchange_failed", null, { code: error.code || null, oauthError: error.oauthError || null, status: error.status || null });
      return redirectToIntegration(req, { amazon_error: "token_exchange_failed" });
    }

    // Verify the new authorization works and read the seller's marketplaces.
    let participations;
    try {
      const client = createAmazonClient({ ...getAmazonConfig("production"), refreshToken });
      ({ participations } = await fetchMarketplaceParticipations(client));
    } catch (error) {
      logWarn(req, "amazon_connect_verification_failed", null, { code: error.code || null, status: error.status || null });
      return redirectToIntegration(req, { amazon_error: "verification_failed" });
    }
    const marketplaces = participations.map((p) => ({ id: p.marketplaceId, name: p.name, countryCode: p.countryCode, currency: p.defaultCurrencyCode, isParticipating: p.isParticipating }));
    if (!marketplaces.some((m) => m.isParticipating && isRegionMarketplace(m.id))) {
      return redirectToIntegration(req, { amazon_error: "no_supported_marketplace" });
    }

    let account;
    try {
      account = await linkAmazonAccount({
        userId: user._id,
        environment: "production",
        sellingPartnerId,
        marketplaces: marketplaces.filter((m) => isRegionMarketplace(m.id)),
        refreshToken,
      });
    } catch (error) {
      if (error instanceof AmazonAccountOwnershipError) return redirectToIntegration(req, { amazon_error: "linked_elsewhere" });
      throw error;
    }

    await enqueueSync(account, "initial");
    await notify(user._id, "success", "Amazon connected", `Seller ${sellingPartnerId} connected. SmartSell is importing your Amazon data.`).catch(() => {});
    logInfo(req, "amazon_connected", { environment: "production", marketplaces: account.marketplaceIds.length });
    return redirectToIntegration(req, { amazon: "connected" });
  } catch (error) {
    logError(req, "amazon_callback_failed", error, { message: false });
    return redirectToIntegration(req, { amazon_error: "connect_failed" });
  }
}
