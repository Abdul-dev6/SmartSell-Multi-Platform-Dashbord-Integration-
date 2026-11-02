import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getActiveStores } from "@/lib/catalog";
import { getDashboardSummary } from "@/lib/analytics/dashboard";

// Monthly revenue / expense / profit for the current year, from MongoDB.
// Kept for compatibility; the dashboard now uses /api/dashboard/summary.
export async function GET(request) {
  try {
    const { user, response } = await requireUser(request);
    if (response) {
      return response;
    }

    const stores = await getActiveStores(user._id);
    const summary = await getDashboardSummary(user._id, stores);

    return Response.json({
      success: true,
      currency: summary.currency,
      year: summary.year,
      data: summary.monthly.map(({ month, revenue, expense, profit, ProfitMargin, Roi }) => ({
        month,
        revenue,
        expense,
        profit,
        ProfitMargin,
        Roi,
      })),
    });
  } catch (error) {
    console.error("Revenue API error:", error.name, error.message);

    return Response.json(
      {
        success: false,
        message: "Could not calculate monthly figures",
      },
      { status: 500 },
    );
  }
}
