import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getEbayConfig } from "@/lib/ebay/config";
import { isEncryptionConfigured } from "@/lib/ebay/crypto";
import { listEbayAccounts, toClientAccount } from "@/lib/ebay/accounts";
import { logError } from "@/lib/observability/log";

// The signed-in user's eBay accounts and whether eBay is configured.
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const config = getEbayConfig();
    const accounts = (await listEbayAccounts(user._id)).map(toClientAccount);
    return NextResponse.json({
      success: true,
      configured: Boolean(config) && isEncryptionConfigured(),
      environment: config?.environment || null,
      connected: accounts.some((a) => a.status === "active"),
      accounts,
    });
  } catch (error) {
    logError(req, "ebay_status_failed", error);
    return NextResponse.json({ success: false, message: "Could not check the eBay connection." }, { status: 500 });
  }
}
