import Shopifystore from "@/models/ShopifyStore";
import { createClient } from "@/lib/shopify/client";
import { assertNoUserErrors, shopifyGraphql } from "@/lib/shopify/graphql";

export const WEBHOOK_PATH = "/api/shopify/webhooks";

// GraphQL topic enum → the X-Shopify-Topic header value.
export const WEBHOOK_TOPICS = {
  PRODUCTS_CREATE: "products/create",
  PRODUCTS_UPDATE: "products/update",
  PRODUCTS_DELETE: "products/delete",
  ORDERS_CREATE: "orders/create",
  ORDERS_UPDATED: "orders/updated",
  ORDERS_DELETE: "orders/delete",
  INVENTORY_LEVELS_UPDATE: "inventory_levels/update",
  INVENTORY_LEVELS_CONNECT: "inventory_levels/connect",
  INVENTORY_LEVELS_DISCONNECT: "inventory_levels/disconnect",
  APP_UNINSTALLED: "app/uninstalled",
};

const LIST = `
  query SmartSellWebhooks {
    webhookSubscriptions(first: 100) { nodes { id topic uri } }
  }`;

const CREATE = `
  mutation SmartSellWebhookCreate($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }`;

const UPDATE = `
  mutation SmartSellWebhookUpdate($id: ID!, $uri: String!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: { uri: $uri }) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }`;

const DELETE = `
  mutation SmartSellWebhookDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }`;

// Shopify must reach the endpoint over public HTTPS. Returns the callback URL
// or null when no usable base URL is configured (e.g. plain localhost).
export function getWebhookCallbackUrl() {
  const base = (process.env.SHOPIFY_WEBHOOK_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  let url;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    return null;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${WEBHOOK_PATH}`;
}

// Makes the store's subscriptions match exactly one per topic at `callbackUrl`.
// Re-running it changes nothing. A topic Shopify refuses does not stop the
// others. Returns { created, updated, deleted, unchanged, failed: [{ topic, error }] }.
export async function ensureWebhookSubscriptions(client, callbackUrl) {
  const data = await shopifyGraphql(client, LIST, {}, { idempotent: true });
  const existing = data.webhookSubscriptions.nodes;
  const summary = { created: 0, updated: 0, deleted: 0, unchanged: 0, failed: [] };

  for (const topic of Object.keys(WEBHOOK_TOPICS)) {
    try {
      await ensureTopic(client, callbackUrl, topic, existing, summary);
    } catch (error) {
      summary.failed.push({ topic: WEBHOOK_TOPICS[topic], error: describeError(error) });
    }
  }

  return summary;
}

function describeError(error) {
  return error?.code === "USER_ERRORS"
    ? error.userErrors.map((e) => e.message).join("; ").slice(0, 300)
    : `${error?.name || "Error"}${error?.response?.status ? ` (HTTP ${error.response.status})` : error?.code ? ` (${error.code})` : ""}`;
}

async function ensureTopic(client, callbackUrl, topic, existing, summary) {
  const forTopic = existing.filter((s) => s.topic === topic);
  const exact = forTopic.find((s) => s.uri === callbackUrl);
  // Every subscription made with this app's token belongs to SmartSell, so a
  // different URI is an old address (previous tunnel or domain).
  const keep = exact || forTopic[0];

  if (!keep) {
    const result = await shopifyGraphql(client, CREATE, { topic, uri: callbackUrl });
    assertNoUserErrors(result.webhookSubscriptionCreate, "webhookSubscriptionCreate");
    summary.created += 1;
  } else if (keep.uri !== callbackUrl) {
    const result = await shopifyGraphql(client, UPDATE, { id: keep.id, uri: callbackUrl });
    assertNoUserErrors(result.webhookSubscriptionUpdate, "webhookSubscriptionUpdate");
    summary.updated += 1;
  } else {
    summary.unchanged += 1;
  }

  // Extra subscriptions for the same topic would deliver every event twice.
  for (const extra of forTopic.filter((s) => s !== keep)) {
    const result = await shopifyGraphql(client, DELETE, { id: extra.id });
    assertNoUserErrors(result.webhookSubscriptionDelete, "webhookSubscriptionDelete");
    summary.deleted += 1;
  }
}

// Registers webhooks for one store and records the result on it. Never throws:
// a failure here must not break connecting the store.
export async function registerStoreWebhooks(store) {
  const callbackUrl = getWebhookCallbackUrl();
  const topics = Object.values(WEBHOOK_TOPICS);

  if (!callbackUrl) {
    await Shopifystore.updateOne(
      { _id: store._id },
      {
        $set: {
          webhooks: {
            status: "not_configured",
            topics: [],
            lastError: "SHOPIFY_WEBHOOK_BASE_URL is not set to a public HTTPS address.",
          },
        },
      },
    );
    return { status: "not_configured" };
  }

  try {
    const token = store.accessToken
      ? store.accessToken
      : (await Shopifystore.findById(store._id).select("+accessToken")).accessToken;
    const summary = await ensureWebhookSubscriptions(createClient(store.shop, token), callbackUrl);
    const failedTopics = summary.failed.map((f) => f.topic);
    const status = failedTopics.length === 0 ? "active" : failedTopics.length === topics.length ? "failed" : "partial";
    const lastError = failedTopics.length
      ? summary.failed.map((f) => `${f.topic}: ${f.error}`).join(" | ").slice(0, 500)
      : null;
    await Shopifystore.updateOne(
      { _id: store._id },
      {
        $set: {
          webhooks: {
            status,
            callbackUrl,
            topics: topics.filter((t) => !failedTopics.includes(t)),
            registeredAt: new Date(),
            lastError,
          },
        },
      },
    );
    return { status, callbackUrl, ...summary, ...(lastError ? { error: lastError } : {}) };
  } catch (error) {
    const message = describeError(error);
    console.error("Webhook registration failed:", store.shop, message);
    await Shopifystore.updateOne(
      { _id: store._id },
      { $set: { webhooks: { status: "failed", callbackUrl, topics: [], lastError: message } } },
    );
    return { status: "failed", error: message };
  }
}
