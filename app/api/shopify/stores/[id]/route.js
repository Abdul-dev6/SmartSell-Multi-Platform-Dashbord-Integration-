import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { disconnectStore } from "@/lib/Shopify/stores";

// Disconnects one of the signed-in user's Shopify stores.
export async function DELETE(req, { params }) {
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
    console.error("Disconnect store error:", error.name, error.message);
    return NextResponse.json(
      { success: false, message: "Failed to disconnect store" },
      { status: 500 },
    );
  }
}
