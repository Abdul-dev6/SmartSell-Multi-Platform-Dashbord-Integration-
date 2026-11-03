import { shopifyGraphql } from "@/lib/shopify/graphql";

// Choices offered by the product form, read live from the store through the
// shared Shopify client: Shopify's product taxonomy, the store's collections
// and its sales channels (publications). Nothing here is hardcoded.

const CATEGORY_RESULTS = 25;
const COLLECTIONS_PER_PAGE = 50;
const MAX_PUBLICATIONS = 250;

const SEARCH_CATEGORIES = `
  query SmartSellCategories($search: String!, $first: Int!) {
    taxonomy {
      categories(search: $search, first: $first) {
        nodes { id name fullName isLeaf isArchived }
      }
    }
  }`;

const LIST_COLLECTIONS = `
  query SmartSellCollections($first: Int!, $after: String, $query: String) {
    collections(first: $first, after: $after, query: $query, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle ruleSet { appliedDisjunctively } }
    }
  }`;

const LIST_PUBLICATIONS = `
  query SmartSellPublications($first: Int!, $after: String) {
    publications(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id catalog { title } }
    }
  }`;

// Shopify search syntax for "titles containing words starting with …". Only
// letters, digits, - and _ are kept, so user text cannot add search
// operators; each word becomes a prefix match on the title.
export function collectionTitleQuery(search) {
  const words = String(search || "")
    .normalize("NFKC")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean)
    .slice(0, 5);
  return words.length ? words.map((w) => `title:${w}*`).join(" ") : null;
}

export async function searchCategories(client, search) {
  const data = await shopifyGraphql(
    client,
    SEARCH_CATEGORIES,
    { search, first: CATEGORY_RESULTS },
    { idempotent: true },
  );
  return data.taxonomy.categories.nodes
    .filter((c) => !c.isArchived)
    .map(({ id, name, fullName, isLeaf }) => ({ id, name, fullName, isLeaf }));
}

// One page of collections, optionally filtered by title. `manual` is false
// for automated (smart) collections: Shopify assigns those by rules, so
// products cannot be added to or removed from them directly.
export async function listCollections(client, { search = "", after = null } = {}) {
  const data = await shopifyGraphql(
    client,
    LIST_COLLECTIONS,
    {
      first: COLLECTIONS_PER_PAGE,
      after,
      query: collectionTitleQuery(search),
    },
    { idempotent: true },
  );
  const { nodes, pageInfo } = data.collections;
  return {
    collections: nodes.map((c) => ({ id: c.id, title: c.title, handle: c.handle, manual: !c.ruleSet })),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}

// Every sales channel the app can see. Requires read_publications.
export async function listPublications(client) {
  const publications = [];
  let after = null;
  do {
    const data = await shopifyGraphql(client, LIST_PUBLICATIONS, { first: 50, after }, { idempotent: true });
    const { nodes, pageInfo } = data.publications;
    publications.push(...nodes.map((p) => ({ id: p.id, name: p.catalog?.title || "Sales channel" })));
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after && publications.length < MAX_PUBLICATIONS);
  return publications;
}
