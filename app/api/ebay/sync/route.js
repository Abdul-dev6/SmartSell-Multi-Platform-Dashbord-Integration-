import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import EbayAccount from "@/models/EbayAccount";
import { syncEbayAccount } from "@/lib/ebay/sync";
import { EbayApiError } from "@/lib/ebay/client";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { logError } from "@/lib/observability/log";
import { withNotification } from "@/lib/notifyRoute";

export const maxDuration = 60;

// Imports products from the user's eBay account(s): all active accounts, or
// the one given as { accountId }.
async function handlePOST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limit = await checkRateLimit(`ebay-sync:${user._id}`, { limit: 10, windowSeconds: 600 });
    if (!limit.allowed) return rateLimitedResponse(NextResponse, limit.retryAfter);

    const body = (await readJsonBody(req)) || {};
    const filter = { user: user._id, status: "active" };
    if (body.accountId !== undefined) {
      if (!mongoose.isValidObjectId(body.accountId)) {
        return NextResponse.json({ success: false, message: "eBay account not found" }, { status: 404 });
      }
      filter._id = body.accountId;
    }
    const accounts = await EbayAccount.find(filter).select("_id username").lean();
    if (!accounts.length) {
      return NextResponse.json({ success: false, code: "no_ebay_account", message: "Connect an eBay account first." }, { status: 409 });
    }

    const results = [];
    for (const account of accounts) {
      try {
        const result = await syncEbayAccount(account._id);
        results.push({ accountId: String(account._id), username: account.username, ...result });
      } catch (error) {
        if (!(error instanceof EbayApiError)) logError(req, "ebay_sync_failed", error);
        results.push({
          accountId: String(account._id),
          username: account.username,
          status: "failed",
          message: error instanceof EbayApiError ? error.message : "Unexpected error while importing from eBay.",
        });
      }
    }

    const failed = results.filter((r) => r.status === "failed");
    const imported = results.reduce((n, r) => n + (r.counts?.products || 0), 0);
    return NextResponse.json(
      {
        success: failed.length < results.length,
        results,
        imported,
        message: failed.length ? failed.map((r) => r.message).join(" ") : `${imported} eBay products up to date.`,
      },
      { status: failed.length === results.length ? 502 : 200 },
    );
  } catch (error) {
    logError(req, "ebay_sync_route_failed", error);
    return NextResponse.json({ success: false, message: "Could not sync eBay." }, { status: 500 });
  }
}

export const POST = withNotification(handlePOST, (b) => ({
  success: "eBay sync finished",
  failure: "eBay sync failed",
  message: b.message,
}));
