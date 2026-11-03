import { withOwnedStore } from "@/lib/shopify/optionsRoute";
import { canManageInventory, missingInventoryScopes } from "@/lib/shopify/scopes";

// The store's active locations (refreshed by every sync), and whether stock
// can be edited from SmartSell (needs write_inventory).
export async function GET(req) {
  return withOwnedStore(req, async ({ store }) => ({
    editable: canManageInventory(store),
    missingScopes: missingInventoryScopes(store),
    locations: (store.locations || [])
      .filter((l) => l.active !== false)
      .map((l) => ({ id: String(l.id), name: l.name })),
  }));
}
