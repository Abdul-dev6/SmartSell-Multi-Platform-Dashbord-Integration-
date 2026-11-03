import { gidToId, productGid, shopifyGraphql } from "@/lib/shopify/graphql";

// Product reads use the GraphQL Admin API: Shopify marks the REST product
// endpoints as deprecated for this app (X-Shopify-API-Deprecated-Reason).
// Results are converted to the REST product shape, which is also what
// product webhooks deliver, so mapping and upserts stay identical.
//
// Beyond the REST shape, reads add the product's category, collections,
// shipping fields (per variant) and, when the store granted
// read_publications, the sales channels it is published to. Webhook payloads
// lack collections, publications and variant shipping fields; mapping only
// sets fields a source actually carries, so a webhook never erases them.

const PAGE_SIZE = 50;
const VARIANTS_PER_PAGE = 100;
const COLLECTIONS_PER_PAGE = 50;
const PUBLICATIONS_PER_PAGE = 50;

const VARIANT_FIELDS = `
  fragment SmartSellVariant on ProductVariant {
    legacyResourceId title sku barcode price compareAtPrice inventoryPolicy position
    inventoryItem {
      legacyResourceId tracked requiresShipping countryCodeOfOrigin harmonizedSystemCode
      measurement { weight { unit value } }
    }
  }`;

const COLLECTION_FIELDS = `
  fragment SmartSellCollection on Collection { id title ruleSet { appliedDisjunctively } }`;

function productFields({ publications }) {
  return `
  fragment SmartSellProductFields on Product {
    legacyResourceId title handle descriptionHtml vendor productType status tags updatedAt
    category { id name fullName }
    variants(first: ${VARIANTS_PER_PAGE}) {
      pageInfo { hasNextPage endCursor }
      nodes { ...SmartSellVariant }
    }
    collections(first: ${COLLECTIONS_PER_PAGE}) {
      pageInfo { hasNextPage endCursor }
      nodes { ...SmartSellCollection }
    }
    ${publications ? `resourcePublicationsV2(first: ${PUBLICATIONS_PER_PAGE}, onlyPublished: true) {
      pageInfo { hasNextPage endCursor }
      nodes { publication { id } }
    }` : ""}
    media(first: 10) { nodes { ... on MediaImage { id alt image { url altText } } } }
  }
  ${VARIANT_FIELDS}
  ${COLLECTION_FIELDS}`;
}

const productsPageQuery = (opts) => `
  query SmartSellProducts($after: String) {
    products(first: ${PAGE_SIZE}, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes { ...SmartSellProductFields }
    }
  }
  ${productFields(opts)}`;

const singleProductQuery = (opts) => `
  query SmartSellProduct($id: ID!) {
    product(id: $id) { ...SmartSellProductFields }
  }
  ${productFields(opts)}`;

const MORE_VARIANTS = `
  query SmartSellProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: ${VARIANTS_PER_PAGE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...SmartSellVariant }
      }
    }
  }
  ${VARIANT_FIELDS}`;

const MORE_COLLECTIONS = `
  query SmartSellProductCollections($id: ID!, $after: String) {
    product(id: $id) {
      collections(first: ${COLLECTIONS_PER_PAGE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...SmartSellCollection }
      }
    }
  }
  ${COLLECTION_FIELDS}`;

const MORE_PUBLICATIONS = `
  query SmartSellProductPublications($id: ID!, $after: String) {
    product(id: $id) {
      resourcePublicationsV2(first: ${PUBLICATIONS_PER_PAGE}, after: $after, onlyPublished: true) {
        pageInfo { hasNextPage endCursor }
        nodes { publication { id } }
      }
    }
  }`;

// GraphQL product node -> REST product shape (as used by sync and webhooks),
// plus collections, publications and variant shipping fields.
export function toRestProduct(node, extra = {}) {
  const variants = extra.variants || node.variants?.nodes || [];
  const collections = extra.collections || node.collections?.nodes || [];
  const publications = extra.publications !== undefined
    ? extra.publications
    : node.resourcePublicationsV2?.nodes;

  return {
    id: node.legacyResourceId,
    title: node.title,
    handle: node.handle,
    body_html: node.descriptionHtml,
    vendor: node.vendor,
    product_type: node.productType,
    status: node.status ? node.status.toLowerCase() : null,
    tags: (node.tags || []).join(", "),
    updated_at: node.updatedAt,
    category: node.category
      ? { admin_graphql_api_id: node.category.id, name: node.category.name, full_name: node.category.fullName }
      : null,
    collections: collections.map((c) => ({ id: c.id, title: c.title, manual: !c.ruleSet })),
    ...(publications !== undefined
      ? { published_publication_ids: publications.map((p) => p.publication?.id).filter(Boolean) }
      : {}),
    variants: variants.map((v) => {
      const item = v.inventoryItem || {};
      const weight = item.measurement?.weight;
      return {
        id: v.legacyResourceId,
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
        compare_at_price: v.compareAtPrice,
        inventory_item_id: item.legacyResourceId ?? null,
        inventory_management: item.tracked ? "shopify" : null,
        inventory_policy: v.inventoryPolicy ? v.inventoryPolicy.toLowerCase() : null,
        position: v.position,
        requires_shipping: item.requiresShipping ?? null,
        weight: weight ? Number(weight.value) : null,
        weight_unit: weight?.unit || null,
        country_code_of_origin: item.countryCodeOfOrigin ?? null,
        harmonized_system_code: item.harmonizedSystemCode ?? null,
      };
    }),
    images: (node.media?.nodes || [])
      .filter((m) => m?.image?.url)
      .map((m) => ({ id: gidToId(m.id), src: m.image.url, alt: m.alt || m.image.altText || "" })),
  };
}

// Follows a product's nested connection to its end (rare: more than one page).
async function remaining(client, query, productId, field, first) {
  const nodes = [...(first?.nodes || [])];
  let pageInfo = first?.pageInfo;
  while (pageInfo?.hasNextPage) {
    const data = await shopifyGraphql(client, query, { id: productGid(productId), after: pageInfo.endCursor }, { idempotent: true });
    const connection = data.product?.[field];
    if (!connection) break;
    nodes.push(...connection.nodes);
    pageInfo = connection.pageInfo;
  }
  return nodes;
}

async function complete(client, node, opts) {
  const id = node.legacyResourceId;
  return toRestProduct(node, {
    variants: await remaining(client, MORE_VARIANTS, id, "variants", node.variants),
    collections: await remaining(client, MORE_COLLECTIONS, id, "collections", node.collections),
    ...(opts.publications
      ? { publications: await remaining(client, MORE_PUBLICATIONS, id, "resourcePublicationsV2", node.resourcePublicationsV2) }
      : {}),
  });
}

// One page of products. Returns { products (REST shape), nextCursor }.
// `publications: true` (store granted read_publications) also reads the
// sales channels each product is published to.
export async function fetchProductsPage(client, after = null, { publications = false } = {}) {
  const opts = { publications };
  const data = await shopifyGraphql(client, productsPageQuery(opts), { after }, { idempotent: true });
  const { nodes, pageInfo } = data.products;
  const products = [];
  for (const node of nodes) {
    products.push(await complete(client, node, opts));
  }
  return { products, nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null };
}

// One product by its numeric Shopify ID, or null if it no longer exists.
export async function fetchProduct(client, shopifyProductId, { publications = false } = {}) {
  const opts = { publications };
  const data = await shopifyGraphql(client, singleProductQuery(opts), { id: productGid(shopifyProductId) }, { idempotent: true });
  if (!data.product) return null;
  return complete(client, data.product, opts);
}
