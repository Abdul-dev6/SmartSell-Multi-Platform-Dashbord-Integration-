import { getNextPageUrl } from "@/lib/shopify/pagination";

// Shopify accepts at most 50 inventory_item_ids per inventory_levels request.
const MAX_IDS_PER_REQUEST = 50;

export async function Getinventory(client, inventoryItemIds) {
  const ids = [...new Set((inventoryItemIds || []).map(String))];
  const levels = [];

  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    let url = "/inventory_levels.json";
    let params = {
      inventory_item_ids: ids.slice(i, i + MAX_IDS_PER_REQUEST).join(","),
      limit: 250,
    };

    // One batch can span several pages when items are stocked at many locations.
    while (url) {
      const response = await client.get(url, { params });
      levels.push(...(response.data.inventory_levels || []));
      url = getNextPageUrl(response.headers?.link);
      params = {};
    }
  }

  return levels;
}
