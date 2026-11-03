import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getActiveStores } from "@/lib/catalog";
import { getWebhookCallbackUrl, registerStoreWebhooks } from "@/lib/shopify/webhookRegistration";
import { logError } from "@/lib/observability/log";
import { withNotification } from "@/lib/notifyRoute";

export const maxDuration = 30;

// (Re)registers Shopify webhooks for the signed-in user's stores, e.g. after
// the app's public URL changes. Safe to repeat.
async function handlePOST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    if (!getWebhookCallbackUrl()) {
      return NextResponse.json(
        {
          success: false,
          code: "not_configured",
          message:
            "Live updates need a public HTTPS address. Set SHOPIFY_WEBHOOK_BASE_URL (e.g. your Vercel URL or a tunnel URL) and try again.",
        },
        { status: 400 },
      );
    }

    const stores = await getActiveStores(user._id);
    if (!stores.length) {
      return NextResponse.json({ success: false, message: "No connected Shopify store" }, { status: 404 });
    }

    const results = [];
    for (const store of stores) {
      results.push({ shop: store.shop, ...(await registerStoreWebhooks(store)) });
    }
    const allActive = results.every((r) => r.status === "active");
    return NextResponse.json(
      { success: allActive, results, message: allActive ? "Live updates are active." : "Some stores could not be set up." },
      { status: allActive ? 200 : 502 },
    );
  } catch (error) {
    logError(req, "Webhook register route error", error);
    return NextResponse.json({ success: false, message: "Could not set up live updates." }, { status: 500 });
  }
}

// Each outcome is recorded as a notification (toast + bell).
export const POST = withNotification(handlePOST, () => ({ success: "Live updates are active", failure: "Live updates could not be set up" }));
