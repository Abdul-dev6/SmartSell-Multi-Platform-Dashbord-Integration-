import AmazonAccount from "@/models/AmazonAccount";
import AmazonListing from "@/models/AmazonListing";
import AmazonInventory from "@/models/AmazonInventory";
import AmazonOrder from "@/models/AmazonOrder";
import AmazonFinancialEvent from "@/models/AmazonFinancialEvent";
import AmazonSyncJob, { SYNC_RESOURCES } from "@/models/AmazonSyncJob";
import AmazonSyncCheckpoint from "@/models/AmazonSyncCheckpoint";
import { getAmazonEnvironment, isRegionMarketplace } from "@/lib/amazon/config";
import { AmazonApiError } from "@/lib/amazon/client";
import { AmazonReconnectRequiredError, isInvalidGrant, withAccountClient } from "@/lib/amazon/accounts";
import { fetchMarketplaceParticipations } from "@/lib/amazon/sellers";
import { processingStatus, searchListingsItems } from "@/lib/amazon/listings";
import { getInventorySummariesPage } from "@/lib/amazon/fbaInventory";
import { searchOrdersPage } from "@/lib/amazon/orders";
import { listEventGroupsPage, listTransactionsPage } from "@/lib/amazon/finances";
import { logError, logInfo } from "@/lib/observability/log";

// Durable Amazon sync, processed by the existing cron pattern
// (/api/amazon/sync/process, CRON_SECRET) and by manual syncs.
//   - one active job per account (partial unique index); a job is claimed
//     with a lease (lockedUntil), so two workers never run it at once
//   - each resource has its own status; one failing resource makes the job
//     "partial", never silently "completed"
//   - checkpoints keep the page token and watermark, so an interrupted or
//     throttled sync resumes where it stopped
//   - before every save the account (still connected, same owner) and the job
//     (still active) are rechecked, so a disconnect mid-sync leaves no records
//   - all writes are idempotent upserts keyed by Amazon's identifiers

const DAY = 86400000;
const JOB_LEASE_MS = 5 * 60 * 1000;
const PENDING_LEASE_MS = 2 * 60 * 1000;
const INITIAL_ORDERS_DAYS = 30;
const INITIAL_FINANCE_DAYS = 30;
const EVENT_GROUP_LOOKBACK_DAYS = 30;
const INCREMENTAL_EVERY_MS = 20 * 60 * 60 * 1000;
// A job deferred this many runs (throttled or Amazon unavailable every time)
// gives up on the remaining resources, so it cannot block the account forever.
export const MAX_JOB_RUNS = 12;

class SyncAborted extends Error {
  constructor(reason) {
    super(`sync aborted: ${reason}`);
    this.name = "SyncAborted";
    this.reason = reason;
  }
}
class OutOfTime extends Error {}

export async function enqueueSync(account, kind, resources = SYNC_RESOURCES) {
  const names = resources.filter((r) => SYNC_RESOURCES.includes(r));
  try {
    const job = await AmazonSyncJob.create({
      user: account.user,
      amazonAccount: account._id,
      kind,
      resources: names.map((name) => ({ name, status: "pending" })),
    });
    return { job: job.toObject(), created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    // An active job already exists for this account: no duplicate.
    const job = await AmazonSyncJob.findOne({ amazonAccount: account._id, user: account.user, active: true }).lean();
    return { job, created: false };
  }
}

const checkpointOf = (account, resource) =>
  AmazonSyncCheckpoint.findOne({ amazonAccount: account._id, user: account.user, resource }).lean();

const saveCheckpoint = (account, resource, fields) =>
  AmazonSyncCheckpoint.updateOne({ amazonAccount: account._id, user: account.user, resource }, { $set: fields }, { upsert: true });

// ── Resource handlers ─────────────────────────────────────────────────────
// Each receives ctx { account, client, guard, outOfTime, now } and returns a
// count. They save checkpoints between pages and throw OutOfTime to pause.

async function syncMarketplaces({ account, client, guard }) {
  const { participations } = await fetchMarketplaceParticipations(client);
  await guard();
  const marketplaces = participations.map((p) => ({ id: p.marketplaceId, name: p.name, countryCode: p.countryCode, currency: p.defaultCurrencyCode, isParticipating: p.isParticipating }));
  const marketplaceIds = marketplaces.filter((m) => m.isParticipating && isRegionMarketplace(m.id)).map((m) => m.id);
  await AmazonAccount.updateOne({ _id: account._id, user: account.user }, { $set: { marketplaces, marketplaceIds } });
  account.marketplaceIds = marketplaceIds;
  return marketplaces.length;
}

// Pages through the account's marketplaces; the cursor is
// { mp: marketplace ID, t: page token } as JSON (by ID, so a changed
// marketplace list cannot make a resume skip or repeat a marketplace).
async function pagedByMarketplace(ctx, resource, fetchPage, savePage, reconcile) {
  const { account, outOfTime } = ctx;
  const markets = account.marketplaceIds || [];
  const cp = await checkpointOf(account, resource);
  let saved = null;
  try {
    saved = cp?.cursor ? JSON.parse(cp.cursor) : null;
  } catch {
    saved = null;
  }
  const resumeAt = saved ? markets.indexOf(saved.mp) : -1;
  let cursor = resumeAt >= 0 ? { m: resumeAt, t: saved.t || null } : { m: 0, t: null };
  let passStart = resumeAt >= 0 && cp.cursorStart ? new Date(cp.cursorStart) : ctx.now;
  let count = 0;
  const persist = () => saveCheckpoint(account, resource, { cursor: JSON.stringify({ mp: markets[cursor.m], t: cursor.t }), cursorStart: passStart });
  while (cursor.m < markets.length) {
    if (outOfTime()) {
      await persist();
      throw new OutOfTime();
    }
    const marketplaceId = markets[cursor.m];
    let page;
    try {
      page = await fetchPage(marketplaceId, cursor.t);
    } catch (error) {
      await persist();
      await saveCheckpoint(account, resource, { lastError: error.code || error.name });
      throw error;
    }
    await ctx.guard();
    count += await savePage(marketplaceId, page.items, passStart);
    if (page.nextToken) cursor = { m: cursor.m, t: page.nextToken };
    else {
      if (reconcile) await reconcile(marketplaceId, passStart);
      cursor = { m: cursor.m + 1, t: null };
    }
    if (cursor.m < markets.length) await persist();
  }
  await saveCheckpoint(account, resource, { cursor: null, cursorStart: null, watermark: passStart, lastSuccessAt: new Date(), lastError: null });
  return count;
}

async function syncListings(ctx) {
  const { account, client } = ctx;
  return pagedByMarketplace(
    ctx,
    "listings",
    (marketplaceId, pageToken) => searchListingsItems(client, { sellerId: account.sellingPartnerId, marketplaceId, pageToken }),
    async (marketplaceId, items, passStart) => {
      if (!items.length) return 0;
      const existing = await AmazonListing.find({ user: account.user, amazonAccount: account._id, marketplaceId, sku: { $in: items.map((i) => i.sku) } })
        .select("sku pendingOperation submission")
        .lean();
      const bySku = new Map(existing.map((e) => [e.sku, e]));
      const cutoff = new Date(Date.now() - PENDING_LEASE_MS);
      await AmazonListing.bulkWrite(
        items.map((record) => {
          const prior = bySku.get(record.sku);
          const set = { ...record, environment: account.environment, lastSyncedAt: passStart };
          // A change SmartSell is sending right now wins over what Amazon still shows.
          if (prior?.pendingOperation?.startedAt > cutoff) for (const k of ["price", "currency", "quantity"]) delete set[k];
          if (prior?.submission?.status === "processing") set["submission.status"] = processingStatus(record);
          return {
            updateOne: {
              filter: { user: account.user, amazonAccount: account._id, marketplaceId, sku: record.sku },
              update: { $set: set, $setOnInsert: { origin: "amazon" } },
              upsert: true,
            },
          };
        }),
      );
      await ctx.afterWrite(AmazonListing);
      return items.length;
    },
    // Listings no longer on Amazon (imported ones only) after a full pass.
    (marketplaceId, passStart) =>
      AmazonListing.deleteMany({ user: account.user, amazonAccount: account._id, marketplaceId, origin: "amazon", lastSyncedAt: { $lt: passStart }, pendingOperation: { $exists: false } }),
  );
}

async function syncFbaInventory(ctx) {
  const { account, client } = ctx;
  return pagedByMarketplace(
    ctx,
    "fbaInventory",
    (marketplaceId, nextToken) => getInventorySummariesPage(client, { marketplaceId, nextToken }),
    async (marketplaceId, items, passStart) => {
      if (!items.length) return 0;
      await AmazonInventory.bulkWrite(
        items.map((record) => ({
          updateOne: {
            filter: { user: account.user, amazonAccount: account._id, marketplaceId, sellerSku: record.sellerSku },
            update: { $set: { ...record, environment: account.environment, lastSyncedAt: passStart } },
            upsert: true,
          },
        })),
      );
      await ctx.afterWrite(AmazonInventory);
      return items.length;
    },
    (marketplaceId, passStart) => AmazonInventory.deleteMany({ user: account.user, amazonAccount: account._id, marketplaceId, lastSyncedAt: { $lt: passStart } }),
  );
}

// Single time window resumed with a page token; the next watermark comes
// from `nextWatermark(lastPage, windowStart)`.
async function pagedWindow(ctx, resource, defaultStart, fetchPage, savePage, nextWatermark) {
  const { account, outOfTime } = ctx;
  const cp = await checkpointOf(account, resource);
  const windowStart = cp?.cursor && cp.cursorStart ? new Date(cp.cursorStart) : cp?.watermark ? new Date(cp.watermark) : defaultStart;
  let token = cp?.cursor || null;
  let count = 0;
  let last = null;
  for (;;) {
    if (outOfTime()) {
      await saveCheckpoint(account, resource, { cursor: token, cursorStart: windowStart });
      throw new OutOfTime();
    }
    try {
      last = await fetchPage(windowStart, token);
    } catch (error) {
      await saveCheckpoint(account, resource, { cursor: token, cursorStart: windowStart, lastError: error.code || error.name });
      throw error;
    }
    await ctx.guard();
    count += await savePage(last.items);
    token = last.nextToken;
    if (!token) break;
    await saveCheckpoint(account, resource, { cursor: token, cursorStart: windowStart });
  }
  await saveCheckpoint(account, resource, { cursor: null, cursorStart: null, watermark: nextWatermark(last, windowStart), lastSuccessAt: new Date(), lastError: null });
  return count;
}

const upsertFinancial = (ctx) => async (items) => {
  const { account } = ctx;
  if (!items.length) return 0;
  await AmazonFinancialEvent.bulkWrite(
    items.map((record) => ({
      updateOne: {
        filter: { user: account.user, amazonAccount: account._id, kind: record.kind, eventId: record.eventId },
        update: { $set: { ...record, environment: account.environment, lastSyncedAt: new Date() } },
        upsert: true,
      },
    })),
  );
  await ctx.afterWrite(AmazonFinancialEvent);
  return items.length;
};

async function syncOrders(ctx) {
  const { account, client, now } = ctx;
  return pagedWindow(
    ctx,
    "orders",
    new Date(now.getTime() - INITIAL_ORDERS_DAYS * DAY),
    (start, token) => searchOrdersPage(client, { marketplaceIds: account.marketplaceIds, lastUpdatedAfter: start, paginationToken: token }).then((p) => ({ ...p, items: p.orders })),
    async (orders) => {
      if (!orders.length) return 0;
      await AmazonOrder.bulkWrite(
        orders.map((order) => ({
          updateOne: {
            filter: { user: account.user, amazonAccount: account._id, orderId: order.orderId },
            update: { $set: { ...order, environment: account.environment, lastSyncedAt: new Date() } },
            upsert: true,
          },
        })),
      );
      await ctx.afterWrite(AmazonOrder);
      return orders.length;
    },
    // Amazon's lastUpdatedBefore is the exact upper bound of what was returned;
    // without it, continue from two minutes ago (overlap is idempotent).
    (last) => last?.lastUpdatedBefore || new Date(Date.now() - 2 * 60 * 1000),
  );
}

async function syncTransactions(ctx) {
  const { client, now } = ctx;
  return pagedWindow(
    ctx,
    "transactions",
    new Date(now.getTime() - INITIAL_FINANCE_DAYS * DAY),
    (start, token) => listTransactionsPage(client, { postedAfter: start, nextToken: token }),
    upsertFinancial(ctx),
    // Overlap one day: late postings are picked up; upserts are idempotent.
    () => new Date(now.getTime() - DAY),
  );
}

async function syncEventGroups(ctx) {
  const { client, now } = ctx;
  return pagedWindow(
    ctx,
    "eventGroups",
    new Date(now.getTime() - 90 * DAY),
    (start, token) => listEventGroupsPage(client, { startedAfter: start, nextToken: token }),
    upsertFinancial(ctx),
    // Open settlement groups change until they close: look back 30 days.
    () => new Date(now.getTime() - EVENT_GROUP_LOOKBACK_DAYS * DAY),
  );
}

const HANDLERS = {
  marketplaces: syncMarketplaces,
  listings: syncListings,
  fbaInventory: syncFbaInventory,
  orders: syncOrders,
  transactions: syncTransactions,
  eventGroups: syncEventGroups,
};

// Throttled or temporarily unavailable: retry on the next run, not a failure.
// Judged by HTTP status: on 5xx Amazon sends its own error code (for example
// InternalFailure), so the code alone cannot tell a temporary failure.
const TEMPORARY_STATUS = new Set([429, 500, 502, 503, 504]);
const isDeferrable = (error) =>
  error instanceof AmazonApiError && (TEMPORARY_STATUS.has(error.status) || ["throttled", "amazon_unavailable", "network_error"].includes(error.code));

async function setResource(job, name, fields) {
  const set = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`resources.$.${k}`, v]));
  await AmazonSyncJob.updateOne({ _id: job._id, "resources.name": name }, { $set: set });
}

// Runs (or resumes) one job until done or `deadline` (ms timestamp).
export async function runJob(jobId, { deadline = Date.now() + 50_000, clientOptions, now = new Date() } = {}) {
  const job = await AmazonSyncJob.findOneAndUpdate(
    { _id: jobId, active: true, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lt: new Date() } }] },
    { $set: { lockedUntil: new Date(Date.now() + JOB_LEASE_MS), status: "running" }, $inc: { runs: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!job) return { ran: false, reason: "locked_or_finished" };
  if (!job.startedAt) await AmazonSyncJob.updateOne({ _id: job._id }, { $set: { startedAt: new Date() } });

  const account = await AmazonAccount.findOne({ _id: job.amazonAccount, user: job.user }).select("+refreshTokenEnc").lean();
  if (!account || account.status !== "active") {
    await AmazonSyncJob.updateOne({ _id: job._id }, { $set: { status: "cancelled", active: false, finishedAt: new Date(), error: account ? "reconnect_required" : "account_removed" }, $unset: { lockedUntil: 1 } });
    return { ran: false, reason: account ? "reconnect_required" : "account_removed" };
  }

  // "active" | "reconnect_required" | "disconnecting" | "gone"
  const accountState = async () => (await AmazonAccount.findOne({ _id: account._id, user: account.user }).select("status").lean())?.status || "gone";
  const guard = async () => {
    const [state, stillJob] = await Promise.all([accountState(), AmazonSyncJob.exists({ _id: job._id, active: true })]);
    if (state !== "active") throw new SyncAborted(state === "reconnect_required" ? "reconnect_required" : "account_disconnected");
    if (!stillJob) throw new SyncAborted("job_cancelled");
  };
  // After a write: if the account was disconnected meanwhile, the write may
  // have recreated records the disconnect already deleted, so remove them.
  const afterWrite = async (Model) => {
    const state = await accountState();
    if (state === "gone" || state === "disconnecting") {
      await Model.deleteMany({ user: account.user, amazonAccount: account._id });
      throw new SyncAborted("account_disconnected");
    }
    if (state !== "active") throw new SyncAborted("reconnect_required");
  };
  const outOfTime = () => Date.now() > deadline;

  // Deferred too many times: give up on what is left.
  if (job.runs > MAX_JOB_RUNS) {
    await AmazonSyncJob.updateOne(
      { _id: job._id },
      { $set: { "resources.$[r].status": "failed", "resources.$[r].error": "gave_up_after_retries", "resources.$[r].finishedAt": new Date() } },
      { arrayFilters: [{ "r.status": { $in: ["pending", "running"] } }] },
    );
    job.resources = (await AmazonSyncJob.findById(job._id).select("resources").lean()).resources;
  }

  let paused = false;
  let aborted = null;
  let crashed = null;
  try {
    await withAccountClient(
      account,
      async (client) => {
        const ctx = { account, client, guard, afterWrite, outOfTime, now };
        for (const resource of job.resources) {
          if (resource.status === "completed" || resource.status === "skipped" || resource.status === "failed") continue;
          if (outOfTime()) {
            paused = true;
            break;
          }
          await setResource(job, resource.name, { status: "running", startedAt: new Date() });
          try {
            const count = await HANDLERS[resource.name](ctx);
            await setResource(job, resource.name, { status: "completed", count, finishedAt: new Date(), error: null });
          } catch (error) {
            if (error instanceof OutOfTime || isDeferrable(error)) {
              await setResource(job, resource.name, { status: "pending", error: error instanceof OutOfTime ? null : "throttled_will_retry" });
              paused = true;
              break;
            }
            // Authorization revoked: stop the whole job (withAccountClient marks
            // the account reconnect_required).
            if (error instanceof SyncAborted || error instanceof AmazonReconnectRequiredError || isInvalidGrant(error)) throw error;
            logError(null, "amazon_sync_resource_failed", error, { message: false, resource: resource.name, code: error.code || null });
            await setResource(job, resource.name, { status: "failed", finishedAt: new Date(), error: String(error.code || error.name || "error").slice(0, 100) });
          }
        }
      },
      clientOptions,
    );
  } catch (error) {
    if (error instanceof SyncAborted) aborted = error.reason;
    else if (error instanceof AmazonReconnectRequiredError) aborted = "reconnect_required";
    else crashed = error;
  }

  // Anything unexpected (undecryptable token, missing or inactive environment
  // configuration, a bug) fails this job and releases it; it never stays
  // locked as "running" or stops other accounts' syncs.
  if (crashed) {
    logError(null, "amazon_sync_job_failed", crashed, { message: false, code: crashed.code || null });
    await AmazonSyncJob.updateOne({ _id: job._id }, { $set: { status: "failed", active: false, finishedAt: new Date(), error: String(crashed.code || crashed.name || "error").slice(0, 100) }, $unset: { lockedUntil: 1 } });
    await AmazonAccount.updateOne({ _id: account._id, user: account.user }, { $set: { lastSyncAt: new Date() } });
    return { ran: true, status: "failed", reason: crashed.code || crashed.name };
  }

  if (aborted) {
    await AmazonSyncJob.updateOne({ _id: job._id }, { $set: { status: "cancelled", active: false, finishedAt: new Date(), error: aborted }, $unset: { lockedUntil: 1 } });
    return { ran: true, status: "cancelled", reason: aborted };
  }

  const fresh = await AmazonSyncJob.findById(job._id).lean();
  if (!fresh) return { ran: true, status: "cancelled", reason: "job_removed" };
  if (paused || fresh.resources.some((r) => r.status === "pending" || r.status === "running")) {
    await AmazonSyncJob.updateOne({ _id: job._id }, { $set: { status: "queued" }, $unset: { lockedUntil: 1 } });
    return { ran: true, status: "queued", resumable: true };
  }
  const failed = fresh.resources.filter((r) => r.status === "failed").length;
  const status = failed === 0 ? "completed" : failed === fresh.resources.length ? "failed" : "partial";
  await AmazonSyncJob.updateOne({ _id: job._id }, { $set: { status, active: false, finishedAt: new Date() }, $unset: { lockedUntil: 1 } });
  await AmazonAccount.updateOne(
    { _id: account._id, user: account.user },
    { $set: { lastSyncAt: new Date(), ...(status === "completed" ? { lastSuccessfulSyncAt: new Date() } : {}) } },
  );
  logInfo(null, "amazon_sync_finished", { status, environment: account.environment, failed });
  return { ran: true, status };
}

// Cron: schedule incremental syncs for production accounts not synced
// recently, then process due jobs within the time budget.
export async function processDueJobs({ deadline = Date.now() + 50_000, limit = 20, clientOptions } = {}) {
  let scheduled = 0;
  if (getAmazonEnvironment() === "production") {
    const due = await AmazonAccount.find({
      environment: "production",
      status: "active",
      $or: [{ lastSyncAt: { $exists: false } }, { lastSyncAt: { $lt: new Date(Date.now() - INCREMENTAL_EVERY_MS) } }],
    })
      .select("_id user")
      .limit(200)
      .lean();
    for (const account of due) if ((await enqueueSync(account, "incremental")).created) scheduled += 1;
  }
  const jobs = await AmazonSyncJob.find({ active: true, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lt: new Date() } }] })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select("_id")
    .lean();
  const results = [];
  for (const { _id } of jobs) {
    if (Date.now() > deadline) break;
    try {
      results.push(await runJob(_id, { deadline, clientOptions }));
    } catch (error) {
      // One job's failure must not stop the others.
      logError(null, "amazon_sync_job_crashed", error, { message: false });
      results.push({ ran: false, reason: "crashed" });
    }
  }
  return { scheduled, processed: results.length, results };
}

export async function syncHistory(userId, accountId, { limit = 10 } = {}) {
  return AmazonSyncJob.find({ user: userId, amazonAccount: accountId }).sort({ createdAt: -1 }).limit(limit).lean();
}
