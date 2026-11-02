import mongoose from "mongoose";

// How long processed events are kept for auditing and deduplication.
// Shopify retries a failed delivery for up to 48 hours, so this must be longer.
export const WEBHOOK_EVENT_RETENTION_DAYS = 30;
export const WEBHOOK_MAX_ATTEMPTS = 8;

// A Shopify webhook delivery, stored only after its HMAC has been verified
// and before it is processed. Processing reads from here, so an event that
// fails (or whose function times out) can be retried later.
const WebhookEventSchema = new mongoose.Schema(
  {
    // X-Shopify-Webhook-Id: identical across Shopify's retries of the same
    // delivery, so it is the deduplication key.
    webhookId: {
      type: String,
      required: true,
    },

    // X-Shopify-Topic, e.g. "products/update".
    topic: {
      type: String,
      required: true,
    },

    // X-Shopify-Shop-Domain, matched to an installed store before saving.
    shop: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    shopifyStore: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopifystore",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    apiVersion: String,
    // X-Shopify-Triggered-At: when the change happened in Shopify.
    triggeredAt: Date,
    receivedAt: {
      type: Date,
      default: Date.now,
    },

    // The Shopify resource the event is about, e.g. the product ID.
    resourceId: String,
    // The resource's own updated_at, used to ignore out-of-order events.
    resourceUpdatedAt: Date,

    // Verified JSON body. Only product topics are subscribed, whose payloads
    // contain no customer data.
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    attempts: {
      type: Number,
      default: 0,
    },
    // Earliest time a pending event may be (re)processed (retry backoff).
    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },
    // A worker holds the event until this time; a crashed worker's lock expires.
    lockedUntil: Date,
    processedAt: Date,
    // Short, safe summary (no payload contents or secrets).
    lastError: String,
    // What processing did, e.g. "updated", "archived", "skipped_stale".
    outcome: String,

    // Set once the event is finished; MongoDB deletes the document afterwards.
    expiresAt: Date,
  },
  { timestamps: true },
);

WebhookEventSchema.index({ webhookId: 1 }, { unique: true });
// Work queue: next due pending events.
WebhookEventSchema.index({ status: 1, nextAttemptAt: 1 });
WebhookEventSchema.index({ shopifyStore: 1, resourceId: 1, resourceUpdatedAt: -1 });
WebhookEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.WebhookEvent ||
  mongoose.model("WebhookEvent", WebhookEventSchema);
