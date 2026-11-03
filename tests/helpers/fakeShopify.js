// REST-shaped fixture -> GraphQL Product node, as the Admin API returns it.
// `publications`: the query asked for resourcePublicationsV2.
export function toGraphqlProduct(p, { publications = false } = {}) {
  return {
    legacyResourceId: String(p.id),
    title: p.title,
    handle: p.handle,
    descriptionHtml: p.body_html,
    vendor: p.vendor,
    productType: p.product_type,
    status: p.status ? String(p.status).toUpperCase() : null,
    tags: p.tags ? String(p.tags).split(",").map((t) => t.trim()).filter(Boolean) : [],
    updatedAt: p.updated_at,
    category: p.category ? { id: p.category.admin_graphql_api_id, name: p.category.name, fullName: p.category.full_name } : null,
    collections: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: (p.collections || []).map((c) => ({ id: c.id, title: c.title, ruleSet: c.manual === false ? { appliedDisjunctively: false } : null })),
    },
    ...(publications
      ? {
          resourcePublicationsV2: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: (p.published_publication_ids || []).map((id) => ({ publication: { id } })),
          },
        }
      : {}),
    variants: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: (p.variants || []).map((v) => ({
        legacyResourceId: String(v.id),
        title: v.title,
        sku: v.sku ?? null,
        barcode: v.barcode ?? null,
        price: v.price ?? null,
        compareAtPrice: v.compare_at_price ?? null,
        inventoryPolicy: "DENY",
        position: v.position ?? 1,
        inventoryItem: v.inventory_item_id
          ? {
              legacyResourceId: String(v.inventory_item_id),
              tracked: v.tracked ?? true,
              requiresShipping: v.requires_shipping ?? true,
              countryCodeOfOrigin: v.country_code_of_origin ?? null,
              harmonizedSystemCode: v.harmonized_system_code ?? null,
              measurement: { weight: { unit: v.weight_unit || "KILOGRAMS", value: v.weight ?? 0 } },
            }
          : null,
      })),
    },
    media: {
      nodes: (p.images || []).map((i) => ({
        id: `gid://shopify/MediaImage/${i.id}`,
        alt: i.alt || "",
        image: { url: i.src, altText: i.alt || "" },
      })),
    },
  };
}

// Answers the GraphQL product reads; returns null for other queries.
export function answerProductQuery(products, body, pageSize = 50) {
  const q = body.query;
  if (q.includes("SmartSellProducts(")) {
    const start = Number(body.variables?.after || 0);
    const slice = products.slice(start, start + pageSize);
    const hasNextPage = start + pageSize < products.length;
    return {
      data: {
        data: {
          products: {
            pageInfo: { hasNextPage, endCursor: hasNextPage ? String(start + pageSize) : null },
            nodes: slice.map((x) => toGraphqlProduct(x, { publications: q.includes("resourcePublicationsV2") })),
          },
        },
      },
    };
  }
  if (q.includes("SmartSellProduct(")) {
    const id = String(body.variables.id).split("/").pop();
    const p = products.find((x) => String(x.id) === id);
    return { data: { data: { product: p ? toGraphqlProduct(p, { publications: q.includes("resourcePublicationsV2") }) : null } } };
  }
  return null;
}

// Minimal stand-in for the axios Shopify client used by the sync services.
// Serves fixtures by URL and records every call.
export function fakeShopify({
  products = [],
  inventoryLevels = [],
  orders = [],
  pageSize = 250,
  fail = {},
  shop = { iana_timezone: "Asia/Karachi", currency: "PKR" },
} = {}) {
  const calls = [];

  const error = (status) =>
    Object.assign(new Error(`HTTP ${status}`), { response: { status, headers: {} } });

  const page = (items, url, key) => {
    const match = url.match(/page_info=(\d+)/);
    const start = match ? Number(match[1]) : 0;
    const slice = items.slice(start, start + pageSize);
    const next = start + pageSize < items.length
      ? `<https://test-store.myshopify.com/admin/api/2026-07/${key}.json?page_info=${start + pageSize}>; rel="next"`
      : undefined;
    return { data: { [key]: slice }, headers: next ? { link: next } : {} };
  };

  return {
    calls,
    async get(url, { params = {} } = {}) {
      calls.push({ url, params });
      if (url.startsWith("/locations.json")) {
        if (fail.locations) throw error(fail.locations);
        return { data: { locations: [{ id: 7, name: "Main Warehouse", active: true }] }, headers: {} };
      }
      if (url.startsWith("/shop.json")) {
        if (fail.shop) throw error(fail.shop);
        return { data: { shop }, headers: {} };
      }
      if (url.includes("products.json")) {
        if (fail.products) throw error(fail.products);
        return page(products, url, "products");
      }
      if (url.includes("inventory_levels.json")) {
        if (fail.inventory) throw error(fail.inventory);
        const ids = params.inventory_item_ids?.split(",") ?? [];
        return {
          data: { inventory_levels: inventoryLevels.filter((l) => ids.includes(String(l.inventory_item_id))) },
          headers: {},
        };
      }
      if (url.includes("orders.json")) {
        if (fail.orders) throw error(fail.orders);
        return page(orders, url, "orders");
      }
      throw error(404);
    },
    async post(url, body) {
      calls.push({ url, query: body.query.match(/query (\w+)/)?.[1], variables: body.variables });
      if (fail.products && body.query.includes("SmartSellProduct")) throw error(fail.products);
      const answer = answerProductQuery(products, body, pageSize);
      if (answer) return answer;
      throw new Error(`fakeShopify: unhandled GraphQL ${body.query.slice(0, 60)}`);
    },
  };
}

export function shopifyProduct(id, overrides = {}) {
  return {
    id,
    title: `Product ${id}`,
    handle: `product-${id}`,
    body_html: "<p>desc</p>",
    vendor: "Vendor",
    product_type: "Type",
    status: "active",
    tags: "a, b",
    updated_at: "2026-10-01T10:00:00Z",
    variants: [
      { id: id * 10, title: "Default", sku: `SKU-${id}`, price: "10.00", inventory_item_id: id * 100, position: 1 },
    ],
    images: [{ id: id * 1000, src: `https://cdn.shopify.com/${id}.png`, alt: "" }],
    ...overrides,
  };
}

export function shopifyOrder(id, overrides = {}) {
  return {
    id,
    name: `#${1000 + id}`,
    order_number: 1000 + id,
    created_at: "2026-10-15T10:00:00Z",
    updated_at: "2026-10-15T10:00:00Z",
    cancelled_at: null,
    financial_status: "paid",
    fulfillment_status: null,
    total_price: "110.00",
    current_total_price: "110.00",
    subtotal_price: "100.00",
    total_tax: "10.00",
    total_discounts: "0.00",
    currency: "PKR",
    customer: {
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      default_address: { address1: "1 Secret St" },
    },
    shipping_address: { address1: "1 Secret St" },
    line_items: [{ product_id: 1, variant_id: 10, title: "Product 1", quantity: 2, price: "50.00", sku: "SKU-1" }],
    ...overrides,
  };
}

// In-memory Shopify that also answers the GraphQL product mutations used by
// lib/products/service.js. `failNext` makes the next matching call fail:
//   { productSet: "userErrors" | "timeout" | "http500" | "throttled" | "accessDenied" | "lostResponse", ... }
// "lostResponse" applies the change in Shopify but loses the response.
export const FAKE_TAXONOMY = [
  { id: "gid://shopify/TaxonomyCategory/hg-11-10-12", name: "Mugs", fullName: "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs", isLeaf: true, isArchived: false },
  { id: "gid://shopify/TaxonomyCategory/hg-11-10-99", name: "Mug Trees", fullName: "Home & Garden > Kitchen & Dining > Mug Trees", isLeaf: true, isArchived: false },
  { id: "gid://shopify/TaxonomyCategory/old-1", name: "Mugs (old)", fullName: "Retired > Mugs", isLeaf: true, isArchived: true },
];
export const FAKE_COLLECTIONS = [
  { id: "gid://shopify/Collection/1", title: "Summer", handle: "summer", manual: true },
  { id: "gid://shopify/Collection/2", title: "Kitchen", handle: "kitchen", manual: true },
  { id: "gid://shopify/Collection/3", title: "On sale (auto)", handle: "on-sale", manual: false },
];
export const FAKE_PUBLICATIONS = [
  { id: "gid://shopify/Publication/11", title: "Online Store" },
  { id: "gid://shopify/Publication/12", title: "Point of Sale" },
];

export function fakeShopifyStore({ products = [], collections = FAKE_COLLECTIONS, publications = FAKE_PUBLICATIONS, taxonomy = FAKE_TAXONOMY } = {}) {
  const base = fakeShopify({ products });
  const state = {
    products: [...products],
    nextId: 9000,
    clock: Date.parse("2026-10-20T00:00:00Z"),
    failNext: {},
    mutations: [],
    collections: [...collections],
    publications: [...publications],
    taxonomy: [...taxonomy],
    // Variables of each mutation, by name, for assertions.
    inputs: {},
    // Available stock: "<inventoryItemId>:<locationId>" -> quantity.
    inventory: new Map(),
  };
  const numId = (gid) => String(gid).split("/").pop();
  const variantByItem = (itemId) => {
    for (const product of state.products) {
      const v = (product.variants || []).find((x) => String(x.inventory_item_id) === String(itemId));
      if (v) return v;
    }
    return null;
  };
  const categoryById = (id) => {
    const c = state.taxonomy.find((t) => t.id === id);
    return c ? { admin_graphql_api_id: c.id, name: c.name, full_name: c.fullName } : null;
  };
  const collectionById = (id) => state.collections.find((c) => c.id === id);
  const applyInventoryItem = (variant, item = {}) => {
    if (item.sku !== undefined) variant.sku = item.sku;
    if (item.requiresShipping !== undefined) variant.requires_shipping = item.requiresShipping;
    if (item.measurement?.weight) {
      variant.weight = item.measurement.weight.value;
      variant.weight_unit = item.measurement.weight.unit;
    }
    if (item.harmonizedSystemCode !== undefined) variant.harmonized_system_code = item.harmonizedSystemCode;
    if (item.tracked !== undefined) variant.tracked = item.tracked;
    if (item.countryCodeOfOrigin !== undefined) variant.country_code_of_origin = item.countryCodeOfOrigin;
  };
  const userError = (name, message) => ({ [name]: { userErrors: [{ field: ["id"], message }] } });
  const tick = () => new Date((state.clock += 1000)).toISOString();
  const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status, headers: {} } });
  const find = (gid) => state.products.find((p) => `gid://shopify/Product/${p.id}` === gid);

  function failure(name) {
    const mode = state.failNext[name];
    if (!mode) return null;
    delete state.failNext[name];
    return mode;
  }

  function apply(name, variables) {
    if (name === "productSet") {
      const input = variables.input;
      const id = state.nextId++;
      const v = input.variants[0];
      state.products.push({
        id,
        title: input.title,
        body_html: input.descriptionHtml,
        vendor: input.vendor,
        product_type: input.productType,
        status: input.status.toLowerCase(),
        tags: (input.tags || []).join(", "),
        handle: input.handle || `p-${id}`,
        updated_at: tick(),
        created_at: new Date(state.clock).toISOString(),
        variants: [{ id: id * 10, title: "Default Title", price: v.price, compare_at_price: v.compareAtPrice ?? null, sku: v.sku || "", barcode: v.barcode || null, inventory_item_id: id * 100, position: 1, requires_shipping: true, weight: 0, weight_unit: "KILOGRAMS" }],
        images: [],
        metafield: input.metafields?.[0]?.value,
        category: input.category ? categoryById(input.category) : null,
        collections: (input.collections || []).map((cid) => ({ ...collectionById(cid) })),
        published_publication_ids: [],
      });
      applyInventoryItem(state.products.at(-1).variants[0], v.inventoryItem);
      for (const q of v.inventoryQuantities || []) state.inventory.set(`${id * 100}:${numId(q.locationId)}`, q.quantity);
      return { productSet: { product: { id: `gid://shopify/Product/${id}` }, userErrors: [] } };
    }
    if (name === "productUpdate") {
      const p = find(variables.product.id);
      if (!p) return { productUpdate: { product: null, userErrors: [{ field: ["id"], message: "Product does not exist" }] } };
      const f = variables.product;
      if (f.title !== undefined) p.title = f.title;
      if (f.descriptionHtml !== undefined) p.body_html = f.descriptionHtml;
      if (f.status !== undefined) p.status = f.status.toLowerCase();
      if (f.vendor !== undefined) p.vendor = f.vendor;
      if (f.tags !== undefined) p.tags = f.tags.join(", ");
      if (f.category !== undefined) p.category = f.category ? categoryById(f.category) : null;
      for (const cid of f.collectionsToJoin || []) {
        const c = collectionById(cid);
        if (!c) return { productUpdate: { product: null, userErrors: [{ field: ["collectionsToJoin"], message: "Collection does not exist" }] } };
        if (!c.manual) return { productUpdate: { product: null, userErrors: [{ field: ["collectionsToJoin"], message: "Can't add products to a smart collection" }] } };
        p.collections = [...(p.collections || []), { ...c }];
      }
      if (f.collectionsToLeave?.length) p.collections = (p.collections || []).filter((c) => !f.collectionsToLeave.includes(c.id));
      p.updated_at = tick();
      return { productUpdate: { product: { id: f.id }, userErrors: [] } };
    }
    if (name === "productVariantsBulkUpdate") {
      const p = find(variables.productId);
      const v = variables.variants[0];
      const variant = p.variants.find((x) => `gid://shopify/ProductVariant/${x.id}` === v.id);
      if (v.price !== undefined) variant.price = v.price;
      if (v.compareAtPrice !== undefined) variant.compare_at_price = v.compareAtPrice;
      applyInventoryItem(variant, v.inventoryItem);
      if (v.barcode !== undefined) variant.barcode = v.barcode;
      p.updated_at = tick();
      return { productVariantsBulkUpdate: { productVariants: [{ id: v.id }], userErrors: [] } };
    }
    if (name === "publishablePublish" || name === "publishableUnpublish") {
      const p = find(variables.id);
      if (!p) return userError(name, "Resource does not exist");
      const ids = variables.input.map((i) => i.publicationId);
      if (ids.some((id) => !state.publications.some((x) => x.id === id))) return userError(name, "Publication does not exist or is not publishable");
      const current = new Set(p.published_publication_ids || []);
      for (const id of ids) {
        if (name === "publishablePublish") current.add(id);
        else current.delete(id);
      }
      p.published_publication_ids = [...current];
      return { [name]: { userErrors: [] } };
    }
    if (name === "inventorySetQuantities") {
      const quantities = variables.input.quantities;
      // Validate all first: Shopify applies the whole request or none of it.
      for (const q of quantities) {
        const key = `${numId(q.inventoryItemId)}:${numId(q.locationId)}`;
        if (!variantByItem(numId(q.inventoryItemId))) return { [name]: { userErrors: [{ code: "INVALID_INVENTORY_ITEM", field: ["input"], message: "The specified inventory item could not be found." }] } };
        if (!state.inventory.has(key)) return { [name]: { userErrors: [{ code: "ITEM_NOT_STOCKED_AT_LOCATION", field: ["input"], message: "The item is not stocked at the location." }] } };
        if (!("changeFromQuantity" in q)) return { [name]: { userErrors: [{ code: "COMPARE_QUANTITY_REQUIRED", field: ["input"], message: "changeFromQuantity is required." }] } };
        if (q.changeFromQuantity !== null && q.changeFromQuantity !== state.inventory.get(key)) {
          return { [name]: { userErrors: [{ code: "CHANGE_FROM_QUANTITY_STALE", field: ["input"], message: "The quantity has changed." }] } };
        }
      }
      for (const q of quantities) state.inventory.set(`${numId(q.inventoryItemId)}:${numId(q.locationId)}`, q.quantity);
      return { [name]: { userErrors: [] } };
    }
    if (name === "inventoryActivate") {
      const key = `${numId(variables.inventoryItemId)}:${numId(variables.locationId)}`;
      if (!state.inventory.has(key)) state.inventory.set(key, variables.available ?? 0);
      return { [name]: { userErrors: [] } };
    }
    if (name === "productDelete") {
      const p = find(variables.input.id);
      if (!p) return { productDelete: { deletedProductId: null, userErrors: [{ field: ["id"], message: "Product does not exist" }] } };
      state.products = state.products.filter((x) => x !== p);
      return { productDelete: { deletedProductId: variables.input.id, userErrors: [] } };
    }
    if (name === "products") {
      return {
        products: {
          nodes: [...state.products].reverse().map((p) => ({
            id: `gid://shopify/Product/${p.id}`,
            metafield: p.metafield ? { value: p.metafield } : null,
          })),
        },
      };
    }
    throw new Error(`fakeShopifyStore: unhandled ${name}`);
  }

  return {
    state,
    calls: base.calls,
    async get(url, options = {}) {
      const match = url.match(/^\/products\/(\d+)\.json$/);
      if (match) {
        base.calls.push({ url });
        const p = state.products.find((x) => String(x.id) === match[1]);
        if (!p) throw httpError(404);
        return { data: { product: p }, headers: {} };
      }
      base.calls.push({ url, params: options.params });
      if (url.includes("products.json")) return { data: { products: state.products }, headers: {} };
      if (url.includes("inventory_levels.json")) {
        const ids = (options.params?.inventory_item_ids || "").split(",");
        const levels = [...state.inventory.entries()]
          .map(([key, available]) => ({ key, available }))
          .filter(({ key }) => ids.includes(key.split(":")[0]))
          .map(({ key, available }) => ({ inventory_item_id: Number(key.split(":")[0]), location_id: Number(key.split(":")[1]), available, updated_at: tick() }));
        return { data: { inventory_levels: levels }, headers: {} };
      }
      return base.get(url, options);
    },
    async post(url, body) {
      const q = body.query;
      if (/query SmartSell(Categories|Collections|Publications)\b/.test(q)) {
        const op = q.match(/query SmartSell(Categories|Collections|Publications)\b/)[1];
        state.mutations.push(`read:${op}`);
        const mode = failure(op);
        if (mode === "accessDenied") return { data: { errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] } };
        if (mode === "http500") throw httpError(500);
        const v = body.variables || {};
        if (op === "Categories") {
          const term = v.search.toLowerCase();
          return { data: { data: { taxonomy: { categories: { nodes: state.taxonomy.filter((c) => c.name.toLowerCase().includes(term)).slice(0, v.first) } } } } };
        }
        if (op === "Collections") {
          const words = (v.query || "").split(" ").filter(Boolean).map((w) => w.replace(/^title:/, "").replace(/\*$/, "").toLowerCase());
          const matching = state.collections.filter((c) => words.every((w) => c.title.toLowerCase().split(/\W+/).some((t) => t.startsWith(w))));
          const start = Number(v.after || 0);
          const slice = matching.slice(start, start + v.first);
          const hasNextPage = start + v.first < matching.length;
          return {
            data: {
              data: {
                collections: {
                  pageInfo: { hasNextPage, endCursor: hasNextPage ? String(start + v.first) : null },
                  nodes: slice.map((c) => ({ id: c.id, title: c.title, handle: c.handle, ruleSet: c.manual ? null : { appliedDisjunctively: false } })),
                },
              },
            },
          };
        }
        return {
          data: {
            data: {
              publications: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: state.publications.map((x) => ({ id: x.id, catalog: { title: x.title } })),
              },
            },
          },
        };
      }
      if (q.includes("query SmartSellInventoryLevels")) {
        state.mutations.push("read:InventoryLevels");
        const itemId = numId(body.variables.id);
        const variant = variantByItem(itemId);
        if (!variant) return { data: { data: { inventoryItem: null } } };
        const nodes = [...state.inventory.entries()]
          .filter(([key]) => key.startsWith(`${itemId}:`))
          .map(([key, quantity]) => ({ location: { id: `gid://shopify/Location/${key.split(":")[1]}` }, quantities: [{ name: "available", quantity }] }));
        return { data: { data: { inventoryItem: { tracked: variant.tracked ?? true, inventoryLevels: { nodes } } } } };
      }
      const read = answerProductQuery(state.products, body);
      if (read) {
        state.mutations.push("read");
        return read;
      }
      const name = body.query.match(/(productSet|productUpdate|productVariantsBulkUpdate|productDelete|publishablePublish|publishableUnpublish|inventorySetQuantities|inventoryActivate|products)\(/)?.[1];
      // Since 2026-04 these require an @idempotent key.
      if (["inventorySetQuantities", "inventoryActivate"].includes(name) && !(/@idempotent\(key: \$idempotencyKey\)/.test(body.query) && body.variables?.idempotencyKey)) {
        return { data: { errors: [{ message: "The @idempotent directive is required for this mutation." }] } };
      }
      state.mutations.push(name);
      state.inputs[name] = [...(state.inputs[name] || []), body.variables];
      const mode = failure(name);
      if (mode === "timeout") throw Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
      if (mode === "http500") throw httpError(500);
      if (mode === "errorAfterApply") {
        // The mutation runs, then a field in the response fails (e.g. an
        // unsupported argument): Shopify returns errors together with data.
        const data = apply(name, body.variables);
        return { data: { errors: [{ message: "using last without before is not supported" }], data: { [name]: { ...data[name], product: null } } } };
      }
      if (mode === "lostResponse") {
        apply(name, body.variables);
        throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
      }
      if (mode === "throttled") {
        return { data: { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }], extensions: { cost: { requestedQueryCost: 10, throttleStatus: { currentlyAvailable: 0, restoreRate: 1000 } } } } };
      }
      if (mode === "accessDenied") {
        return { data: { errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] } };
      }
      if (mode === "userErrors") {
        return { data: { data: { [name]: { product: null, userErrors: [{ field: ["title"], message: "Title is too long", code: "INVALID" }] } } } };
      }
      return { data: { data: apply(name, body.variables) } };
    },
  };
}
