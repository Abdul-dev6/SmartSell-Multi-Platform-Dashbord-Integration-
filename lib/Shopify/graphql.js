// GraphQL Admin API calls over the same axios client used for REST.

const MAX_THROTTLE_RETRIES = 3;
const MAX_THROTTLE_WAIT_MS = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ShopifyGraphQLError extends Error {
  constructor(message, { code, errors = [], userErrors = [] } = {}) {
    super(message);
    this.name = "ShopifyGraphQLError";
    this.code = code;
    this.errors = errors;
    this.userErrors = userErrors;
  }
}

function isThrottled(body) {
  return body?.errors?.some((e) => e?.extensions?.code === "THROTTLED");
}

// How long until enough query cost has been restored to run this request.
export function throttleWaitMs(body) {
  const cost = body?.extensions?.cost;
  const status = cost?.throttleStatus;
  if (!status?.restoreRate) {
    return 1000;
  }
  const deficit = (cost.requestedQueryCost ?? 0) - (status.currentlyAvailable ?? 0);
  const ms = Math.ceil((Math.max(deficit, 0) / status.restoreRate) * 1000);
  return Math.min(Math.max(ms, 1000), MAX_THROTTLE_WAIT_MS);
}

// Runs a query or mutation and returns `data`.
//
// - THROTTLED responses are retried for queries and mutations alike: Shopify
//   rejects a throttled request before executing it.
// - Pass { idempotent: true } for queries so transport failures (429/5xx,
//   network) are retried by the client; mutations are not, because a request
//   that failed in transit may already have been applied.
// - Top-level `errors` throw. Mutation `userErrors` are returned in `data`;
//   use assertNoUserErrors to turn them into an exception.
export async function shopifyGraphql(
  client,
  query,
  variables = {},
  { idempotent = false } = {},
) {
  for (let attempt = 0; ; attempt++) {
    const response = await client.post(
      "/graphql.json",
      { query, variables },
      { shopifyRetry: idempotent },
    );
    const body = response.data;

    if (isThrottled(body)) {
      if (attempt >= MAX_THROTTLE_RETRIES) {
        throw new ShopifyGraphQLError("Shopify GraphQL rate limit exceeded", {
          code: "THROTTLED",
          errors: body.errors,
        });
      }
      await sleep(throttleWaitMs(body));
      continue;
    }

    if (body?.errors?.length) {
      throw new ShopifyGraphQLError("Shopify GraphQL request failed", {
        code: body.errors[0]?.extensions?.code || "GRAPHQL_ERROR",
        errors: body.errors,
      });
    }

    if (!body?.data) {
      throw new ShopifyGraphQLError("Shopify GraphQL response had no data", {
        code: "NO_DATA",
      });
    }

    return body.data;
  }
}

// Throws if a mutation payload reports userErrors (validation failures).
export function assertNoUserErrors(payload, operation) {
  const userErrors = payload?.userErrors || [];
  if (userErrors.length) {
    throw new ShopifyGraphQLError(`${operation} was rejected by Shopify`, {
      code: "USER_ERRORS",
      userErrors: userErrors.map(({ field, message, code }) => ({
        field,
        message,
        code,
      })),
    });
  }
  return payload;
}

// Converts Shopify GIDs to the numeric IDs used by REST and stored locally.
export function gidToId(gid) {
  if (typeof gid !== "string") {
    return null;
  }
  const match = gid.match(/\/(\d+)(?:\?.*)?$/);
  return match ? match[1] : null;
}

export function productGid(id) {
  return `gid://shopify/Product/${id}`;
}
