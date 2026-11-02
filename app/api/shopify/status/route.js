import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getShopifyOAuthConfig } from "@/lib/Shopify/oauth";
import { listStoresForUser } from "@/lib/Shopify/stores";
import { getWebhookCallbackUrl, WEBHOOK_TOPICS } from "@/lib/Shopify/webhookRegistration";

const REQUIRED_TOPICS = Object.values(WEBHOOK_TOPICS);

// Shopify reports only the write scope when both were requested:
// write_products implies read_products.
function missingScopes(requested, grantedScope) {
  const granted = new Set(
    (grantedScope || "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  return requested.filter(
    (scope) =>
      !granted.has(scope) &&
      !(scope.startsWith("read_") && granted.has(scope.replace(/^read_/, "write_"))),
  );
}

export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const requestedScopes = (getShopifyOAuthConfig()?.scopes || "")
      .split(",")
      .filter(Boolean);

    // Live updates are only "on" when Shopify delivers to THIS deployment.
    // Local and production share the database, so a registration made from
    // another environment (e.g. a dev tunnel) must not count as active here.
    const expectedUrl = getWebhookCallbackUrl();
    const stores = (await listStoresForUser(user._id)).map((store) => {
      const webhooks = store.webhooks || {};
      const pointsHere = Boolean(expectedUrl) && webhooks.callbackUrl === expectedUrl;
      // Registered before new topics were added (e.g. orders, inventory).
      const missingTopics = REQUIRED_TOPICS.filter((t) => !(webhooks.topics || []).includes(t));
      return {
        ...store,
        status: store.status || "active",
        missingScopes: missingScopes(requestedScopes, store.scope),
        webhooks: {
          status:
            webhooks.status === "active" && !pointsHere
              ? "elsewhere"
              : webhooks.status === "active" && missingTopics.length
                ? "outdated"
                : webhooks.status || "not_configured",
          missingTopics,
          registeredHost: webhooks.callbackUrl ? new URL(webhooks.callbackUrl).host : null,
          lastError: webhooks.lastError || null,
          registeredAt: webhooks.registeredAt || null,
        },
      };
    });

    return NextResponse.json({
      connected: stores.some((store) => store.status === "active"),
      stores,
    });
  } catch (error) {
    console.error("Shopify status error:", error.name, error.message);

    return NextResponse.json(
      {
        connected: false,
        error: "Failed to check Shopify connection",
      },
      { status: 500 },
    );
  }
}
