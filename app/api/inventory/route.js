import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import {
  getActiveStores,
  getInventoryRows,
  getProductsNeedingAttention,
  syncSummary,
} from "@/lib/catalog";

// Product/variant/inventory rows from MongoDB for the signed-in user.
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const stores = await getActiveStores(user._id);
    const { rows, truncated } = stores.length
      ? await getInventoryRows(
          user._id,
          stores.map((s) => s._id),
          new Map(stores.map((s) => [String(s._id), s.shop])),
        )
      : { rows: [], truncated: false };
    const needsAttention = stores.length
      ? await getProductsNeedingAttention(user._id, stores.map((s) => s._id))
      : [];

    return NextResponse.json({
      success: true,
      data: rows,
      truncated,
      needsAttention,
      hasStore: stores.length > 0,
      sync: syncSummary(stores),
    });
  } catch (error) {
    console.error("Inventory route error:", error.name, error.message);
    return NextResponse.json(
      { success: false, message: "Could not load products." },
      { status: 500 },
    );
  }
}
