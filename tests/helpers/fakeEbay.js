// In-memory eBay Sandbox for tests: OAuth, Identity, Account (policies),
// Inventory (items, offers, locations) and Taxonomy APIs. Install with
// vi.stubGlobal("fetch", ebay.fetch).

const API = "https://api.sandbox.ebay.com";
const APIZ = "https://apiz.sandbox.ebay.com";

const json = (body, status = 200) => Response.json(body, { status });
const ebayError = (status, errorId, message) =>
  json({ errors: [{ errorId, domain: "API_INVENTORY", category: "REQUEST", message, longMessage: message }] }, status);

export function createFakeEbay({ userId = "ebay-user-1", username = "test_seller", optedIn = true, withSetup = true } = {}) {
  const state = {
    userId,
    username,
    optedIn,
    revoked: false,
    accessTokenSeq: 0,
    policies: { fulfillment: [], payment: [], return: [] },
    locations: [],
    items: new Map(),
    offers: new Map(),
    offerSeq: 100,
    listingSeq: 9000,
    // [{ method, path (substring or RegExp), status, errorId, message, times, networkError }]
    failures: [],
    calls: [],
  };

  if (withSetup) {
    state.policies.fulfillment.push({ fulfillmentPolicyId: "F1", name: "Free shipping", categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }] });
    state.policies.payment.push({ paymentPolicyId: "P1", name: "Managed payments", categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }] });
    state.policies.return.push({ returnPolicyId: "R1", name: "30 days", categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true }] });
    state.locations.push({ merchantLocationKey: "warehouse-1", name: "Main warehouse", merchantLocationStatus: "ENABLED", location: { address: { country: "US", postalCode: "95125" } } });
  }

  function fail(spec) {
    state.failures.push({ times: 1, status: 500, ...spec });
  }

  function takeFailure(method, path) {
    const index = state.failures.findIndex(
      (f) => (!f.method || f.method === method) && (f.path instanceof RegExp ? f.path.test(path) : path.includes(f.path)),
    );
    if (index === -1) return null;
    const failure = state.failures[index];
    failure.times -= 1;
    if (failure.times <= 0) state.failures.splice(index, 1);
    return failure;
  }

  function issueAccess() {
    state.accessTokenSeq += 1;
    return `v^1.1#user-access-${state.accessTokenSeq}`;
  }

  function offersFor(sku) {
    return [...state.offers.values()].filter((o) => o.sku === sku);
  }

  async function handle(method, url, body, headers) {
    const path = url.pathname;

    // ---- OAuth
    if (url.origin === API && path === "/identity/v1/oauth2/token") {
      const params = new URLSearchParams(body);
      const grant = params.get("grant_type");
      if (!String(headers.authorization || "").startsWith("Basic ")) return json({ error: "invalid_client" }, 401);
      if (grant === "authorization_code") {
        if (params.get("code") !== "good-code") return json({ error: "invalid_grant" }, 400);
        state.revoked = false;
        return json({ access_token: issueAccess(), expires_in: 7200, refresh_token: "v^1.1#refresh", refresh_token_expires_in: 47304000, token_type: "User Access Token" });
      }
      if (grant === "refresh_token") {
        if (state.revoked || params.get("refresh_token") !== "v^1.1#refresh") return json({ error: "invalid_grant" }, 400);
        return json({ access_token: issueAccess(), expires_in: 7200, token_type: "User Access Token" });
      }
      if (grant === "client_credentials") return json({ access_token: "app-token", expires_in: 7200 });
      return json({ error: "unsupported_grant_type" }, 400);
    }

    const auth = String(headers.authorization || "");
    if (!auth.startsWith("Bearer ")) return ebayError(401, 1001, "Invalid access token");

    // ---- Identity
    if (url.origin === APIZ && path === "/commerce/identity/v1/user/") {
      return json({ userId: state.userId, username: state.username });
    }

    // ---- Taxonomy (application token)
    if (path === "/commerce/taxonomy/v1/get_default_category_tree_id") return json({ categoryTreeId: "0" });
    if (path === "/commerce/taxonomy/v1/category_tree/0/get_category_suggestions") {
      return json({
        categorySuggestions: [
          { category: { categoryId: "9355", categoryName: "Cell Phones & Smartphones" }, categoryTreeNodeAncestors: [{ categoryName: "Cell Phones & Accessories" }] },
        ],
      });
    }
    if (path === "/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category") {
      return json({
        aspects: [
          { localizedAspectName: "Brand", aspectConstraint: { aspectRequired: true, aspectMode: "FREE_TEXT", itemToAspectCardinality: "SINGLE" }, aspectValues: [{ localizedValue: "Apple" }] },
          { localizedAspectName: "Model", aspectConstraint: { aspectRequired: true, aspectMode: "FREE_TEXT", itemToAspectCardinality: "SINGLE" } },
          { localizedAspectName: "Color", aspectConstraint: { aspectRequired: false, aspectMode: "FREE_TEXT", itemToAspectCardinality: "MULTI" } },
        ],
      });
    }
    if (path === "/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies") {
      return json({ itemConditionPolicies: [{ categoryId: url.searchParams.get("filter")?.match(/\d+/)?.[0], itemConditions: [{ conditionId: "1000", conditionDescription: "New" }, { conditionId: "3000", conditionDescription: "Used" }] }] });
    }

    // ---- Account API
    const policyMatch = path.match(/^\/sell\/account\/v1\/(fulfillment|payment|return)_policy$/);
    if (policyMatch) {
      const kind = policyMatch[1];
      if (!state.optedIn) return ebayError(400, 20403, "User is not eligible for Business Policy.");
      const listField = { fulfillment: "fulfillmentPolicies", payment: "paymentPolicies", return: "returnPolicies" }[kind];
      if (method === "GET") return json({ [listField]: state.policies[kind], total: state.policies[kind].length });
      const idField = { fulfillment: "fulfillmentPolicyId", payment: "paymentPolicyId", return: "returnPolicyId" }[kind];
      const created = { ...JSON.parse(body), [idField]: `${kind[0].toUpperCase()}${state.policies[kind].length + 10}` };
      state.policies[kind].push(created);
      return json(created, 201);
    }
    if (path === "/sell/account/v1/program/opt_in" && method === "POST") {
      state.optedIn = true;
      return json({});
    }

    // ---- Inventory locations
    if (path === "/sell/inventory/v1/location" && method === "GET") {
      return json({ locations: state.locations, total: state.locations.length });
    }
    const locationMatch = path.match(/^\/sell\/inventory\/v1\/location\/([^/]+)$/);
    if (locationMatch && method === "POST") {
      const key = decodeURIComponent(locationMatch[1]);
      if (state.locations.some((l) => l.merchantLocationKey === key)) return ebayError(409, 25803, "Location already exists");
      state.locations.push({ merchantLocationKey: key, ...JSON.parse(body) });
      return new Response(null, { status: 204 });
    }

    // ---- Inventory items
    if (path === "/sell/inventory/v1/inventory_item" && method === "GET") {
      const limit = Number(url.searchParams.get("limit") || 25);
      const offset = Number(url.searchParams.get("offset") || 0);
      const all = [...state.items.values()];
      return json({ total: all.length, inventoryItems: all.slice(offset, offset + limit), limit, offset });
    }
    const itemMatch = path.match(/^\/sell\/inventory\/v1\/inventory_item\/([^/]+)$/);
    if (itemMatch) {
      const sku = decodeURIComponent(itemMatch[1]);
      if (method === "PUT") {
        if (!headers["content-language"]) return ebayError(400, 25709, "Content-Language header missing");
        const existed = state.items.has(sku);
        state.items.set(sku, { sku, ...JSON.parse(body) });
        return new Response(null, { status: existed ? 204 : 201 });
      }
      if (method === "GET") return state.items.has(sku) ? json(state.items.get(sku)) : ebayError(404, 25710, "Inventory item not found");
      if (method === "DELETE") {
        if (!state.items.has(sku)) return ebayError(404, 25710, "Inventory item not found");
        state.items.delete(sku);
        for (const offer of offersFor(sku)) state.offers.delete(offer.offerId);
        return new Response(null, { status: 204 });
      }
    }

    // ---- Offers
    if (path === "/sell/inventory/v1/offer" && method === "GET") {
      const sku = url.searchParams.get("sku");
      const list = offersFor(sku);
      // Stricter than a 404, so callers must recognise the error ID.
      if (!list.length) return ebayError(400, 25713, "This Offer is not available.");
      return json({ offers: list, total: list.length });
    }
    if (path === "/sell/inventory/v1/offer" && method === "POST") {
      const input = JSON.parse(body);
      if (!state.items.has(input.sku)) return ebayError(400, 25702, "SKU not found");
      if (offersFor(input.sku).some((o) => o.marketplaceId === input.marketplaceId)) {
        return ebayError(400, 25002, "Offer entity already exists.");
      }
      state.offerSeq += 1;
      const offer = { ...input, offerId: String(state.offerSeq), status: "UNPUBLISHED" };
      state.offers.set(offer.offerId, offer);
      return json({ offerId: offer.offerId }, 201);
    }
    const offerMatch = path.match(/^\/sell\/inventory\/v1\/offer\/([^/]+)(\/publish|\/withdraw)?$/);
    if (offerMatch) {
      const offer = state.offers.get(offerMatch[1]);
      if (!offer) return ebayError(404, 25713, "This Offer is not available.");
      const action = offerMatch[2];
      if (action === "/publish" && method === "POST") {
        const lp = offer.listingPolicies || {};
        if (!offer.categoryId || !lp.fulfillmentPolicyId || !lp.paymentPolicyId || !lp.returnPolicyId || !offer.merchantLocationKey) {
          return ebayError(400, 25007, "Missing listing details.");
        }
        if (!offer.listing?.listingId) {
          state.listingSeq += 1;
          offer.listing = { listingId: String(state.listingSeq) };
        }
        offer.listing.listingStatus = "ACTIVE";
        offer.status = "PUBLISHED";
        return json({ listingId: offer.listing.listingId });
      }
      if (action === "/withdraw" && method === "POST") {
        if (offer.status !== "PUBLISHED") return ebayError(400, 25713, "Offer is not published.");
        offer.status = "UNPUBLISHED";
        offer.listing.listingStatus = "ENDED";
        return json({ listingId: offer.listing.listingId });
      }
      if (!action && method === "GET") return json(offer);
      if (!action && method === "PUT") {
        const input = JSON.parse(body);
        if (input.sku || input.marketplaceId || input.format) {
          return ebayError(400, 25002, "sku, marketplaceId and format cannot be updated.");
        }
        Object.assign(offer, input, { offerId: offer.offerId, status: offer.status, listing: offer.listing });
        return new Response(null, { status: 204 });
      }
      if (!action && method === "DELETE") {
        state.offers.delete(offer.offerId);
        return new Response(null, { status: 204 });
      }
    }

    return ebayError(404, 0, `Fake eBay has no route for ${method} ${path}`);
  }

  async function fetch(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    const method = (init.method || "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body instanceof URLSearchParams ? init.body.toString() : init.body;
    state.calls.push({ method, path: url.pathname, search: url.search, body, headers });

    const failure = takeFailure(method, url.pathname);
    if (failure) {
      if (failure.networkError) throw new TypeError("fetch failed");
      return ebayError(failure.status, failure.errorId ?? 0, failure.message || "Injected failure");
    }
    return handle(method, url, body, headers);
  }

  return { fetch, state, fail, calls: state.calls };
}
