import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getActiveStores } from "@/lib/catalog";
import { getWebhookCallbackUrl, registerStoreWebhooks } from "@/lib/Shopify/webhookRegistration";

export const maxDuration = 30;

// (Re)registers Shopify webhooks for the signed-in user's stores, e.g. after
// the app's public URL changes. Safe to repeat.
export async function POST(req) {
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
    console.error("Webhook register route error:", error.name, error.message);
    return NextResponse.json({ success: false, message: "Could not set up live updates." }, { status: 500 });
  }
}
