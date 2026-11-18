import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { safeEqual } from "@/lib/shopify/oauth";
import { processDueJobs } from "@/lib/amazon/sync";
import { logError, logInfo } from "@/lib/observability/log";

export const maxDuration = 60;

// Amazon sync worker, called by Vercel Cron (see vercel.json) with
// "Authorization: Bearer <CRON_SECRET>", like /api/shopify/webhooks/process.
// Schedules incremental syncs for connected production accounts and resumes
// queued jobs (initial syncs after connecting, throttled or interrupted runs).
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    await connectDB();
    const summary = await processDueJobs({ deadline: startedAt + 50_000 });
    logInfo(req, "amazon_sync_worker_finished", { scheduled: summary.scheduled, processed: summary.processed, durationMs: Date.now() - startedAt });
    return NextResponse.json({ success: true, scheduled: summary.scheduled, processed: summary.processed });
  } catch (error) {
    logError(req, "amazon_sync_worker_failed", error, { message: false });
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
