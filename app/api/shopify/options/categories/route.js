import { badRequest, withOwnedStore } from "@/lib/shopify/optionsRoute";
import { searchCategories } from "@/lib/shopify/catalogOptions";

// Searches Shopify's Standard Product Taxonomy: GET ?q=<2–100 characters>.
export async function GET(req) {
  return withOwnedStore(req, async ({ client, params }) => {
    const q = (params.get("q") || "").trim();
    if (q.length < 2 || q.length > 100) return badRequest("Type 2 to 100 characters to search categories.");
    return { categories: await searchCategories(client, q) };
  });
}
