import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getActiveStores } from "@/lib/catalog";
import { getStoreHealth } from "@/lib/observability/health";
import { logError } from "@/lib/observability/log";

// Recovery status for the signed-in user's connected stores.
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const stores = await getActiveStores(user._id);
    return NextResponse.json({ success: true, ...(await getStoreHealth(stores)) });
  } catch (error) {
    logError(req, "store_health_failed", error);
    return NextResponse.json(
      { success: false, message: "Could not load the store health status." },
      { status: 500 },
    );
  }
}
