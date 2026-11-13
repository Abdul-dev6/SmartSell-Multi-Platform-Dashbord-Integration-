import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { disconnectEbayAccount } from "@/lib/ebay/accounts";
import { logError } from "@/lib/observability/log";
import { withNotification } from "@/lib/notifyRoute";

// Disconnects one of the signed-in user's eBay accounts.
async function handleDELETE(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { id } = await params;
    const result = await disconnectEbayAccount(user._id, id);
    // Same response for "doesn't exist" and "belongs to someone else".
    if (!result) {
      return NextResponse.json({ success: false, message: "eBay account not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      username: result.username,
      message:
        "SmartSell deleted its eBay access tokens. To remove SmartSell from your eBay account too, open eBay → Account settings → Third-party app access.",
    });
  } catch (error) {
    logError(req, "ebay_disconnect_failed", error);
    return NextResponse.json({ success: false, message: "Failed to disconnect eBay" }, { status: 500 });
  }
}

export const DELETE = withNotification(handleDELETE, (b) => ({
  success: `eBay account ${b.username || ""} disconnected`,
  failure: "eBay account not disconnected",
  message: b.message,
}));
