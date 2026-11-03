import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { safeEqual } from "@/lib/shopify/oauth";
import { processDueEvents } from "@/lib/webhooks/queue";
import { reconcileStaleStores } from "@/lib/shopify/syncStore";

export const maxDuration = 60;

// Recovery worker, called daily by Vercel Cron (see vercel.json), which sends
// "Authorization: Bearer <CRON_SECRET>". It retries stored webhook events that
// failed or were not finished, then re-syncs stores not synced in the last
// day, which repairs anything a webhook that never arrived would have changed.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const startedAt = Date.now();
    const summary = await processDueEvents({ limit: 500, deadline: startedAt + 20000 });
    const reconciliation = await reconcileStaleStores({ deadline: startedAt + 30000 });
    return NextResponse.json({ success: true, ...summary, reconciliation });
  } catch (error) {
    console.error("Webhook worker error:", error.name, error.message);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
