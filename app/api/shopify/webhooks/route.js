import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Shopifystore from "@/models/ShopifyStore";
import { isValidShopDomain } from "@/lib/shopify/oauth";
import { verifyWebhookHmac } from "@/lib/webhooks/verify";
import { SUPPORTED_TOPICS } from "@/lib/webhooks/handlers";
import { processDueEvents, processWebhookEvent, recordWebhookEvent } from "@/lib/webhooks/queue";

export const maxDuration = 10;

const MAX_BODY_BYTES = 2 * 1024 * 1024;
// Shopify expects a response within 5 seconds.
const PROCESS_BUDGET_MS = 3000;

const ok = (body = {}) => NextResponse.json({ received: true, ...body }, { status: 200 });

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ status: "deferred" }), ms);
    }),
  ]);
}

// Receives Shopify webhooks. The HMAC is checked against the raw body before
// anything else; verified events are stored before they are processed, so an
// event that fails (or whose processing outlives this request) is retried later.
export async function POST(req) {
  const startedAt = Date.now();
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error("Webhook received but SHOPIFY_CLIENT_SECRET is not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const rawBody = Buffer.from(await req.arrayBuffer());
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  if (!verifyWebhookHmac(rawBody, req.headers.get("x-shopify-hmac-sha256"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic");
  const shop = req.headers.get("x-shopify-shop-domain")?.toLowerCase();
  const webhookId = req.headers.get("x-shopify-webhook-id");
  if (!topic || !webhookId || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: "missing_headers" }, { status: 400 });
  }

  if (!SUPPORTED_TOPICS.has(topic)) {
    return ok({ ignored: "topic" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const missingId =
    topic === "inventory_levels/update"
      ? !payload?.inventory_item_id || !payload?.location_id
      : /^(products|orders)\//.test(topic) && !payload?.id;
  if (!payload || typeof payload !== "object" || missingId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  let event;
  try {
    await connectDB();
    // The shop header is signed, but it still has to match an installed store.
    const store = await Shopifystore.findOne({ shop, status: { $ne: "disconnected" } }).select("_id user shop");
    if (!store) {
      // Acknowledge so Shopify stops retrying for a store we no longer serve.
      return ok({ ignored: "unknown_shop" });
    }

    const recorded = await recordWebhookEvent({
      webhookId,
      topic,
      shop,
      store,
      apiVersion: req.headers.get("x-shopify-api-version"),
      triggeredAt: req.headers.get("x-shopify-triggered-at"),
      payload,
    });
    if (recorded.duplicate) {
      return ok({ duplicate: true });
    }
    event = recorded.event;
  } catch (error) {
    // Not stored: return an error so Shopify delivers it again.
    console.error("Webhook could not be stored:", { topic, shop, error: error.name });
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }

  // The event is durable from here on; processing problems are retried later.
  try {
    const result = await withTimeout(processWebhookEvent(event._id), PROCESS_BUDGET_MS);
    const remaining = PROCESS_BUDGET_MS - (Date.now() - startedAt);
    if (remaining > 500) {
      // Use spare time to catch up on events that previously failed.
      await withTimeout(processDueEvents({ limit: 5, deadline: Date.now() + remaining - 300 }), remaining);
    }
    return ok({ status: result.status });
  } catch (error) {
    console.error("Webhook processing error (will retry):", { topic, shop, error: error.name });
    return ok({ status: "queued" });
  }
}
