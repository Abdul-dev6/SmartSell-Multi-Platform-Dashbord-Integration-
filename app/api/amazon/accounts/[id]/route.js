import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { disconnectAmazonAccount } from "@/lib/amazon/accounts";
import { logError, logInfo } from "@/lib/observability/log";
import { withNotification } from "@/lib/notifyRoute";

// Disconnects one of the signed-in user's Amazon accounts: deletes the
// account (with its encrypted refresh token) and every Amazon record synced
// for it. Shopify and eBay data are not touched.
async function handleDELETE(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { id } = await params;
    const result = await disconnectAmazonAccount(user._id, id);
    // Same response for "doesn't exist" and "belongs to someone else".
    if (!result) {
      return NextResponse.json({ success: false, message: "Amazon account not found" }, { status: 404 });
    }
    logInfo(req, "amazon_account_disconnected", { environment: result.environment, deleted: result.deleted });
    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: "SmartSell deleted this Amazon account and its synced data.",
    });
  } catch (error) {
    logError(req, "amazon_disconnect_failed", error, { message: false });
    return NextResponse.json({ success: false, message: "Failed to disconnect Amazon" }, { status: 500 });
  }
}

export const DELETE = withNotification(handleDELETE, (b) => ({
  success: "Amazon account disconnected",
  failure: "Amazon account not disconnected",
  message: b.message,
}));
