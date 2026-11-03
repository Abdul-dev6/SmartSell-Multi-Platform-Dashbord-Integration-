import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { safeEqual } from "@/lib/shopify/oauth";
import { processDueEvents } from "@/lib/webhooks/queue";
import { reconcileStaleStores } from "@/lib/shopify/syncStore";
import CronRun, { CRON_RUN_RETENTION_DAYS } from "@/models/CronRun";

const runExpiry = () => new Date(Date.now() + CRON_RUN_RETENTION_DAYS * 86400000);
import { logError, logInfo } from "@/lib/observability/log";

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

  const startedAt = new Date();
  try {
    await connectDB();
    const summary = await processDueEvents({ limit: 500, deadline: startedAt.getTime() + 20000 });
    const reconciliation = await reconcileStaleStores({ deadline: startedAt.getTime() + 30000 });
    await CronRun.create({
      startedAt,
      finishedAt: new Date(),
      status: reconciliation.failed ? "failed" : "success",
      processed: summary.processed,
      failed: summary.failed,
      reconciliation,
      expiresAt: runExpiry(),
    });
    logInfo(req, "recovery_worker_finished", { ...summary, reconciliation, durationMs: Date.now() - startedAt.getTime() });
    return NextResponse.json({ success: true, ...summary, reconciliation });
  } catch (error) {
    await CronRun.create({ startedAt, finishedAt: new Date(), status: "failed", error: error.name, expiresAt: runExpiry() }).catch(() => {});
    logError(req, "Webhook worker error", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
