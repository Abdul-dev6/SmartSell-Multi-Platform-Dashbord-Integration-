import WebhookEvent, {
  WEBHOOK_EVENT_RETENTION_DAYS,
  WEBHOOK_MAX_ATTEMPTS,
} from "@/models/WebhookEvent";
import Shopifystore from "@/models/ShopifyUser";
import { handleWebhookEvent, storablePayload } from "./handlers";

const LOCK_MS = 60 * 1000;
const RETENTION_MS = WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

// Exponential backoff with jitter: ~1 min, 2, 4 … capped at 1 hour.
export function retryDelayMs(attempts) {
  const base = Math.min(60 * 1000 * 2 ** Math.max(attempts - 1, 0), 60 * 60 * 1000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function safeError(error) {
  return `${error?.name || "Error"}${error?.code ? ` (${error.code})` : ""}`.slice(0, 200);
}

// Stores a verified delivery. Returns { event, duplicate }. A delivery Shopify
// retries carries the same webhook ID and is recognised as a duplicate.
export async function recordWebhookEvent({ webhookId, topic, shop, store, apiVersion, triggeredAt, payload }) {
  const isProduct = topic.startsWith("products/");
  try {
    const event = await WebhookEvent.create({
      webhookId,
      topic,
      shop,
      shopifyStore: store._id,
      user: store.user,
      apiVersion,
      triggeredAt: toDate(triggeredAt),
      resourceId: payload?.id !== undefined ? String(payload.id) : undefined,
      resourceUpdatedAt: isProduct ? toDate(payload?.updated_at) : undefined,
      payload: storablePayload(topic, payload),
    });
    return { event, duplicate: false };
  } catch (error) {
    if (error?.code === 11000) {
      return { event: await WebhookEvent.findOne({ webhookId }), duplicate: true };
    }
    throw error;
  }
}

// Atomically takes one event for processing. Also reclaims events whose
// worker stopped (e.g. the function was frozen) once their lock expires.
async function claim(filter) {
  const now = new Date();
  return WebhookEvent.findOneAndUpdate(
    {
      ...filter,
      $or: [
        { status: "pending", nextAttemptAt: { $lte: now }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
        { status: "processing", lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: "processing", lockedUntil: new Date(now.getTime() + LOCK_MS) },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } },
  );
}

async function run(event) {
  try {
    const store = await Shopifystore.findById(event.shopifyStore);
    if (!store) {
      throw Object.assign(new Error("Store no longer exists"), { permanent: true });
    }

    const outcome = await handleWebhookEvent(event, store);
    await WebhookEvent.updateOne(
      { _id: event._id },
      {
        $set: {
          status: "completed",
          outcome,
          processedAt: new Date(),
          lastError: null,
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
        $unset: { lockedUntil: 1 },
      },
    );
    return { status: "completed", outcome };
  } catch (error) {
    const giveUp = error?.permanent || event.attempts >= WEBHOOK_MAX_ATTEMPTS;
    console.error("Webhook processing failed:", {
      webhookId: event.webhookId,
      topic: event.topic,
      attempt: event.attempts,
      error: safeError(error),
    });
    await WebhookEvent.updateOne(
      { _id: event._id },
      {
        $set: giveUp
          ? { status: "failed", lastError: safeError(error), expiresAt: new Date(Date.now() + RETENTION_MS) }
          : { status: "pending", lastError: safeError(error), nextAttemptAt: new Date(Date.now() + retryDelayMs(event.attempts)) },
        $unset: { lockedUntil: 1 },
      },
    );
    return { status: giveUp ? "failed" : "retry_scheduled" };
  }
}

// Processes one specific event if it is due and not held by another worker.
export async function processWebhookEvent(eventId) {
  const event = await claim({ _id: eventId });
  return event ? run(event) : { status: "not_claimed" };
}

// Drains due events (oldest first) until the limit or the deadline.
export async function processDueEvents({ limit = 25, deadline = Date.now() + 20000, storeIds } = {}) {
  const filter = storeIds ? { shopifyStore: { $in: storeIds } } : {};
  const summary = { processed: 0, completed: 0, retrying: 0, failed: 0 };

  while (summary.processed < limit && Date.now() < deadline) {
    const event = await claim(filter);
    if (!event) break;
    const result = await run(event);
    summary.processed += 1;
    if (result.status === "completed") summary.completed += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.retrying += 1;
  }
  return summary;
}
