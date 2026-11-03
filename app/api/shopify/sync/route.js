import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { getActiveStores } from "@/lib/catalog";
import { syncStore } from "@/lib/shopify/syncStore";
import { processDueEvents } from "@/lib/webhooks/queue";
import { logError } from "@/lib/observability/log";

// Large catalogs take time; 60s is within every Vercel plan's limit.
export const maxDuration = 60;

// Pulls products, inventory and orders from Shopify into MongoDB for the
// signed-in user's stores (or one store when `storeId` is given).
export async function POST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const body = (await readJsonBody(req)) || {};
    const stores = await getActiveStores(user._id);
    const targets = body.storeId
      ? stores.filter((store) => String(store._id) === String(body.storeId))
      : stores;

    if (!targets.length) {
      return NextResponse.json(
        { success: false, message: "No connected Shopify store" },
        { status: 404 },
      );
    }

    // Catch up on stored webhook events that have not been processed yet.
    await processDueEvents({
      storeIds: targets.map((store) => store._id),
      limit: 100,
      deadline: Date.now() + 10000,
    }).catch((error) => console.error("Webhook catch-up failed:", error.name));

    const results = [];
    for (const store of targets) {
      results.push({ storeId: String(store._id), ...(await syncStore(store._id, user._id)) });
    }

    const statuses = results.map((r) => r.status);
    if (statuses.every((s) => s === "busy")) {
      return NextResponse.json(
        { success: false, message: "A sync is already running.", results },
        { status: 409 },
      );
    }

    const anySucceeded = statuses.some((s) => s === "success" || s === "partial");
    return NextResponse.json(
      {
        success: anySucceeded,
        message: statuses.every((s) => s === "success")
          ? "Sync complete."
          : anySucceeded
            ? "Sync finished with some errors."
            : "Sync failed.",
        results,
      },
      { status: anySucceeded ? 200 : 502 },
    );
  } catch (error) {
    logError(req, "Sync route error", error);
    return NextResponse.json(
      { success: false, message: "Sync failed." },
      { status: 500 },
    );
  }
}
