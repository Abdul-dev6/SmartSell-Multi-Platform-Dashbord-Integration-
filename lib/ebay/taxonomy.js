import { requireEbayConfig, EbayApiError } from "@/lib/ebay/client";
import { getApplicationToken } from "@/lib/ebay/oauth";

// Category suggestions, item specifics (aspects) and allowed conditions for a
// category. Public eBay data, read with the application token.

const CONDITION_IDS = {
  1000: "NEW",
  1500: "NEW_OTHER",
  1750: "NEW_WITH_DEFECTS",
  2000: "CERTIFIED_REFURBISHED",
  2010: "EXCELLENT_REFURBISHED",
  2020: "VERY_GOOD_REFURBISHED",
  2030: "GOOD_REFURBISHED",
  2500: "SELLER_REFURBISHED",
  2750: "LIKE_NEW",
  3000: "USED_EXCELLENT",
  4000: "USED_VERY_GOOD",
  5000: "USED_GOOD",
  6000: "USED_ACCEPTABLE",
  7000: "FOR_PARTS_OR_NOT_WORKING",
};

const treeIds = new Map();

async function appGet(path, query) {
  const config = requireEbayConfig();
  const token = await getApplicationToken(config).catch(() => {
    throw new EbayApiError({ code: "token_refresh_failed", message: "Could not reach eBay. Please try again." });
  });
  const url = new URL(`${config.apiBase}${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EbayApiError({ code: "network_error", message: "eBay did not respond in time. Please try again." });
  }
  // 204: no suggestions.
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new EbayApiError({
      code: response.status === 404 ? "not_found" : response.status >= 500 ? "ebay_unavailable" : "ebay_rejected",
      status: response.status,
      message: data?.errors?.[0]?.message || "eBay could not load category data.",
    });
  }
  return data;
}

export async function getCategoryTreeId(marketplaceId) {
  if (treeIds.has(marketplaceId)) return treeIds.get(marketplaceId);
  const data = await appGet("/commerce/taxonomy/v1/get_default_category_tree_id", { marketplace_id: marketplaceId });
  if (!data?.categoryTreeId) throw new EbayApiError({ code: "ebay_rejected", message: "eBay has no category tree for this marketplace." });
  treeIds.set(marketplaceId, String(data.categoryTreeId));
  return String(data.categoryTreeId);
}

export async function suggestCategories(marketplaceId, query) {
  const treeId = await getCategoryTreeId(marketplaceId);
  const data = await appGet(`/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions`, { q: query });
  return (data?.categorySuggestions || []).slice(0, 15).map((s) => {
    const path = [...(s.categoryTreeNodeAncestors || [])].reverse().map((a) => a.categoryName);
    return {
      id: String(s.category.categoryId),
      name: s.category.categoryName,
      path: [...path, s.category.categoryName].join(" > "),
    };
  });
}

export async function getCategoryDetails(marketplaceId, categoryId) {
  const treeId = await getCategoryTreeId(marketplaceId);
  const [aspectData, conditionData] = await Promise.all([
    appGet(`/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category`, { category_id: categoryId }),
    appGet(`/sell/metadata/v1/marketplace/${marketplaceId}/get_item_condition_policies`, {
      filter: `categoryIds:{${categoryId}}`,
    }).catch(() => null),
  ]);

  const aspects = (aspectData?.aspects || []).slice(0, 60).map((a) => ({
    name: a.localizedAspectName,
    required: Boolean(a.aspectConstraint?.aspectRequired),
    freeText: a.aspectConstraint?.aspectMode !== "SELECTION_ONLY",
    multiple: a.aspectConstraint?.itemToAspectCardinality === "MULTI",
    values: (a.aspectValues || []).slice(0, 50).map((v) => v.localizedValue),
  }));
  // Required first, then eBay's order.
  aspects.sort((a, b) => Number(b.required) - Number(a.required));

  const policy = (conditionData?.itemConditionPolicies || [])[0];
  const conditions = (policy?.itemConditions || [])
    .map((c) => ({ value: CONDITION_IDS[c.conditionId], label: c.conditionDescription }))
    .filter((c) => c.value);

  return { aspects, conditions };
}
