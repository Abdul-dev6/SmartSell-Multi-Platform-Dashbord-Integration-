import { gidToId, productGid, shopifyGraphql } from "@/lib/shopify/graphql";

// Product reads use the GraphQL Admin API: Shopify marks the REST product
// endpoints as deprecated for this app (X-Shopify-API-Deprecated-Reason).
// Results are converted to the REST product shape, which is also what
// product webhooks deliver, so mapping and upserts stay identical.

const PAGE_SIZE = 50;
const VARIANTS_PER_PAGE = 100;

const FRAGMENTS = `
  fragment SmartSellVariant on ProductVariant {
    legacyResourceId title sku barcode price compareAtPrice inventoryPolicy position
    inventoryItem { legacyResourceId tracked }
  }
  fragment SmartSellProductFields on Product {
    legacyResourceId title handle descriptionHtml vendor productType status tags updatedAt
    variants(first: ${VARIANTS_PER_PAGE}) {
      pageInfo { hasNextPage endCursor }
      nodes { ...SmartSellVariant }
    }
    media(first: 10) { nodes { ... on MediaImage { id alt image { url altText } } } }
  }`;

const PRODUCTS_PAGE = `
  query SmartSellProducts($after: String) {
    products(first: ${PAGE_SIZE}, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes { ...SmartSellProductFields }
    }
  }
  ${FRAGMENTS}`;

const SINGLE_PRODUCT = `
  query SmartSellProduct($id: ID!) {
    product(id: $id) { ...SmartSellProductFields }
  }
  ${FRAGMENTS}`;

const MORE_VARIANTS = `
  query SmartSellProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: ${VARIANTS_PER_PAGE}, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...SmartSellVariant }
      }
    }
  }
  fragment SmartSellVariant on ProductVariant {
    legacyResourceId title sku barcode price compareAtPrice inventoryPolicy position
    inventoryItem { legacyResourceId tracked }
  }`;

// GraphQL product node -> REST product shape (as used by sync and webhooks).
export function toRestProduct(node, variants = node.variants?.nodes || []) {
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
    variants: variants.map((v) => ({
      id: v.legacyResourceId,
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      compare_at_price: v.compareAtPrice,
      inventory_item_id: v.inventoryItem?.legacyResourceId ?? null,
      inventory_management: v.inventoryItem?.tracked ? "shopify" : null,
      inventory_policy: v.inventoryPolicy ? v.inventoryPolicy.toLowerCase() : null,
      position: v.position,
    })),
    images: (node.media?.nodes || [])
      .filter((m) => m?.image?.url)
      .map((m) => ({ id: gidToId(m.id), src: m.image.url, alt: m.alt || m.image.altText || "" })),
  };
}

// Products with more than one page of variants need follow-up requests.
async function allVariants(client, node) {
  const variants = [...(node.variants?.nodes || [])];
  let pageInfo = node.variants?.pageInfo;
  while (pageInfo?.hasNextPage) {
    const data = await shopifyGraphql(
      client,
      MORE_VARIANTS,
      { id: productGid(node.legacyResourceId), after: pageInfo.endCursor },
      { idempotent: true },
    );
    const connection = data.product?.variants;
    if (!connection) break;
    variants.push(...connection.nodes);
    pageInfo = connection.pageInfo;
  }
  return variants;
}

// One page of products. Returns { products (REST shape), nextCursor }.
export async function fetchProductsPage(client, after = null) {
  const data = await shopifyGraphql(client, PRODUCTS_PAGE, { after }, { idempotent: true });
  const { nodes, pageInfo } = data.products;
  const products = [];
  for (const node of nodes) {
    products.push(toRestProduct(node, await allVariants(client, node)));
  }
  return { products, nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null };
}

// One product by its numeric Shopify ID, or null if it no longer exists.
export async function fetchProduct(client, shopifyProductId) {
  const data = await shopifyGraphql(client, SINGLE_PRODUCT, { id: productGid(shopifyProductId) }, { idempotent: true });
  if (!data.product) return null;
  return toRestProduct(data.product, await allVariants(client, data.product));
}
