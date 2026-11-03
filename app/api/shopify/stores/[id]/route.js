import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { disconnectStore } from "@/lib/shopify/stores";
import { logError } from "@/lib/observability/log";
import { withNotification } from "@/lib/notifyRoute";

// Disconnects one of the signed-in user's Shopify stores.
async function handleDELETE(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const { id } = await params;
    const result = await disconnectStore(user._id, id);

    // Same response for "doesn't exist" and "belongs to someone else".
    if (!result) {
      return NextResponse.json(
        { success: false, message: "Store not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      shop: result.shop,
      revokedAtShopify: result.revokedAtShopify,
      message: result.revokedAtShopify
        ? "Store disconnected and access revoked in Shopify."
        : "Store disconnected in SmartSell, but Shopify could not be reached to revoke access. Uninstall the app from your Shopify admin to fully revoke it.",
    });
  } catch (error) {
    logError(req, "Disconnect store error", error);
    return NextResponse.json(
      { success: false, message: "Failed to disconnect store" },
      { status: 500 },
    );
  }
}

// Each outcome is recorded as a notification (toast + bell).
export const DELETE = withNotification(handleDELETE, (b) => ({ success: `Store ${b.shop || ""} disconnected`, failure: "Store not disconnected", message: b.message }));
