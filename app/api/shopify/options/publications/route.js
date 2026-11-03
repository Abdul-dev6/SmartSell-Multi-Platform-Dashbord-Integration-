import { withOwnedStore } from "@/lib/shopify/optionsRoute";
import { listPublications } from "@/lib/shopify/catalogOptions";
import { canManagePublications, missingPublicationScopes } from "@/lib/shopify/scopes";

// The store's sales channels. Without read_publications and
// write_publications they cannot be listed or changed; the response says
// which permissions are missing instead of failing.
export async function GET(req) {
  return withOwnedStore(req, async ({ store, client }) => {
    if (!canManagePublications(store)) {
      return { available: false, missingScopes: missingPublicationScopes(store), publications: [] };
    }
    return { available: true, missingScopes: [], publications: await listPublications(client) };
  });
}
