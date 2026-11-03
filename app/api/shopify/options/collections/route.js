import { badRequest, withOwnedStore } from "@/lib/shopify/optionsRoute";
import { listCollections } from "@/lib/shopify/catalogOptions";

// The store's collections, 50 per page: GET ?q=<title search>&after=<cursor>.
// Automated (smart) collections are included with manual: false.
export async function GET(req) {
  return withOwnedStore(req, async ({ client, params }) => {
    const search = (params.get("q") || "").trim();
    const after = params.get("after") || null;
    if (search.length > 100) return badRequest("Search must be at most 100 characters.");
    if (after && (after.length > 500 || !/^[A-Za-z0-9+/=_-]+$/.test(after))) return badRequest("Invalid page cursor.");
    return listCollections(client, { search, after });
  });
}
