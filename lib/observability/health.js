import WebhookEvent from "@/models/WebhookEvent";
import CronRun from "@/models/CronRun";

const WINDOW_DAYS = 7;
// The worker runs daily at 04:00 UTC (vercel.json); allow some slack.
const CRON_OVERDUE_MS = 26 * 60 * 60 * 1000;
// An event still pending after this long is stuck rather than just queued.
const STUCK_PENDING_MS = 15 * 60 * 1000;

// Recovery status for the signed-in user's stores: webhook events that ran
// out of retries or are stuck, the last sync, and whether the daily worker
// is running. Only this user's events are read; the worker's global totals
// are never exposed, only when it last ran and whether it succeeded.
export async function getStoreHealth(stores, { now = new Date() } = {}) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);

  const perStore = await Promise.all(
    stores.map(async (store) => {
      const scope = { shopifyStore: store._id };
      const [failedCount, recentFailures, pending, oldestPending] = await Promise.all([
        WebhookEvent.countDocuments({ ...scope, status: "failed", updatedAt: { $gte: since } }),
        WebhookEvent.find({ ...scope, status: "failed", updatedAt: { $gte: since } })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select("topic lastError attempts receivedAt updatedAt")
          .lean(),
        WebhookEvent.countDocuments({ ...scope, status: { $in: ["pending", "processing"] } }),
        WebhookEvent.findOne({ ...scope, status: { $in: ["pending", "processing"] } })
          .sort({ receivedAt: 1 })
          .select("receivedAt")
          .lean(),
      ]);
      const oldestPendingAt = oldestPending?.receivedAt || null;
      return {
        storeId: String(store._id),
        shop: store.shop,
        lastSync: {
          at: store.lastSyncAt || null,
          status: store.lastSyncStatus || null,
          error: store.lastSyncError || null,
        },
        webhooks: {
          failedLast7Days: failedCount,
          recentFailures: recentFailures.map((e) => ({
            topic: e.topic,
            error: e.lastError || null,
            attempts: e.attempts,
            receivedAt: e.receivedAt,
            failedAt: e.updatedAt,
          })),
          pending,
          oldestPendingAt,
          stuck: Boolean(oldestPendingAt && now - oldestPendingAt > STUCK_PENDING_MS),
        },
      };
    }),
  );

  const lastRun = await CronRun.findOne().sort({ startedAt: -1 }).select("startedAt status").lean();
  const cron = {
    lastRunAt: lastRun?.startedAt || null,
    status: lastRun?.status || null,
    overdue: !lastRun || now - lastRun.startedAt > CRON_OVERDUE_MS,
  };

  return { stores: perStore, cron };
}
