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
export function fakeShopifyStore({ products = [] } = {}) {
  const base = fakeShopify({ products });
  const state = { products: [...products], nextId: 9000, clock: Date.parse("2026-10-20T00:00:00Z"), failNext: {}, mutations: [] };
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
        variants: [{ id: id * 10, title: "Default Title", price: v.price, compare_at_price: v.compareAtPrice ?? null, sku: v.sku || "", barcode: v.barcode || null, inventory_item_id: id * 100, position: 1 }],
        images: [],
        metafield: input.metafields?.[0]?.value,
      });
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
      p.updated_at = tick();
      return { productUpdate: { product: { id: f.id }, userErrors: [] } };
    }
    if (name === "productVariantsBulkUpdate") {
      const p = find(variables.productId);
      const v = variables.variants[0];
      const variant = p.variants.find((x) => `gid://shopify/ProductVariant/${x.id}` === v.id);
      if (v.price !== undefined) variant.price = v.price;
      if (v.compareAtPrice !== undefined) variant.compare_at_price = v.compareAtPrice;
      if (v.inventoryItem?.sku !== undefined) variant.sku = v.inventoryItem.sku;
      if (v.barcode !== undefined) variant.barcode = v.barcode;
      p.updated_at = tick();
      return { productVariantsBulkUpdate: { productVariants: [{ id: v.id }], userErrors: [] } };
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
      return base.get(url, options);
    },
    async post(url, body) {
      const name = body.query.match(/(productSet|productUpdate|productVariantsBulkUpdate|productDelete|products)\(/)?.[1];
      state.mutations.push(name);
      const mode = failure(name);
      if (mode === "timeout") throw Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
      if (mode === "http500") throw httpError(500);
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
