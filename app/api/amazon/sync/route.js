import { amazonRoute, ok, searchParams } from "@/lib/amazon/http";
import { AmazonServiceError } from "@/lib/amazon/errors";
import { loadAccount } from "@/lib/amazon/listingService";
import { enqueueSync, runJob, syncHistory } from "@/lib/amazon/sync";
import { SYNC_RESOURCES } from "@/models/AmazonSyncJob";

export const maxDuration = 60;

const toClientJob = (j) =>
  j && {
    id: String(j._id),
    kind: j.kind,
    status: j.status,
    active: j.active,
    resources: (j.resources || []).map((r) => ({ name: r.name, status: r.status, count: r.count || 0, error: r.error || null })),
    error: j.error || null,
    createdAt: j.createdAt,
    startedAt: j.startedAt || null,
    finishedAt: j.finishedAt || null,
  };

// GET  ?accountId — the current sync job and recent history.
// POST { accountId, resources? } — starts (or joins) a sync and runs it for up
//      to ~40 seconds; anything left continues in the cron worker.
export const GET = amazonRoute(async ({ req, user }) => {
  const account = await loadAccount(user._id, searchParams(req).get("accountId") || undefined, { write: false }).catch((error) => {
    if (error instanceof AmazonServiceError && error.code === "reconnect_required") return null;
    throw error;
  });
  if (!account) return ok({ current: null, history: [] });
  const history = await syncHistory(user._id, account._id);
  return ok({ current: toClientJob(history.find((j) => j.active) || null), history: history.map(toClientJob) });
}, { label: "amazon_sync_status_failed" });

export const POST = amazonRoute(
  async ({ user, body }) => {
    const account = await loadAccount(user._id, typeof body.accountId === "string" ? body.accountId : undefined, { write: false });
    const resources = Array.isArray(body.resources) ? body.resources.filter((r) => SYNC_RESOURCES.includes(r)) : SYNC_RESOURCES;
    if (!resources.length) throw new AmazonServiceError(422, "validation", "Choose what to sync.");
    const { job, created } = await enqueueSync(account, "manual", resources);
    const run = await runJob(job._id, { deadline: Date.now() + 40_000 });
    const [latest] = await syncHistory(user._id, account._id, { limit: 1 });
    return ok({ created, run: { status: run.status || null, resumable: Boolean(run.resumable) }, job: toClientJob(latest) }, created ? 202 : 200);
  },
  { label: "amazon_sync_failed", json: true, rateLimit: { bucket: "sync", limit: 10 } },
);
