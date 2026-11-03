import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getActiveStores, syncSummary } from "@/lib/catalog";
import { getDashboardSummary } from "@/lib/analytics/dashboard";
import { logError } from "@/lib/observability/log";

export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const stores = await getActiveStores(user._id);
    // ?period=all (default) or YYYY-MM selects what the cards show.
    const period = new URL(req.url).searchParams.get("period") || "all";
    const summary = await getDashboardSummary(user._id, stores, { period });

    return NextResponse.json({
      success: true,
      data: { ...summary, sync: syncSummary(stores) },
    });
  } catch (error) {
    logError(req, "Dashboard summary error", error);
    return NextResponse.json(
      { success: false, message: "Could not load dashboard data." },
      { status: 500 },
    );
  }
}
