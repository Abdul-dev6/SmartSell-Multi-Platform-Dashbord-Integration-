import crypto from "node:crypto";
import { assertNoUserErrors, shopifyGraphql } from "@/lib/shopify/graphql";

// Setting a product's available stock per location (Admin API 2026-07).
//
// Safety:
// - Every change carries changeFromQuantity: Shopify applies it only if the
//   stock is still what SmartSell showed the user, so a sale made in the
//   meantime is never overwritten (CHANGE_FROM_QUANTITY_STALE otherwise).
// - Every mutation carries an @idempotent key (required since 2026-04).
// - Before sending, the live stock is read; a location already at the
//   requested quantity is skipped, so repeating a request (a retry after a
//   lost response) changes nothing.

export const itemGid = (id) => `gid://shopify/InventoryItem/${id}`;
export const locationGid = (id) => `gid://shopify/Location/${id}`;
const numericId = (gid) => String(gid).split("/").pop();

const ITEM_LEVELS = `
  query SmartSellInventoryLevels($id: ID!) {
    inventoryItem(id: $id) {
      tracked
      inventoryLevels(first: 50) {
        nodes { location { id } quantities(names: ["available"]) { name quantity } }
      }
    }
  }`;

const SET_QUANTITIES = `
  mutation SmartSellSetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { code field message }
    }
  }`;

const ACTIVATE = `
  mutation SmartSellActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int, $idempotencyKey: String!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }`;

// Stock changed since the user loaded it; nothing was sent for it.
export class StockChangedError extends Error {
  constructor(changes) {
    super("Stock changed in Shopify since it was loaded");
    this.name = "StockChangedError";
    this.code = "STOCK_CHANGED";
    this.changes = changes; // [{ locationId, expected, current }]
  }
}

// { tracked, levels: Map(numeric location ID -> available) } for one item.
export async function readItemLevels(client, inventoryItemId) {
  const data = await shopifyGraphql(client, ITEM_LEVELS, { id: itemGid(inventoryItemId) }, { idempotent: true });
  const item = data.inventoryItem;
  if (!item) return null;
  const levels = new Map(
    item.inventoryLevels.nodes.map((level) => [
      numericId(level.location.id),
      level.quantities.find((q) => q.name === "available")?.quantity ?? 0,
    ]),
  );
  return { tracked: item.tracked, levels };
}

// What to send for `requested` ([{ locationId, available, expected }]) given
// the live levels. Throws StockChangedError when a location's stock is
// neither what the user saw nor what they asked for.
export function planInventory(requested, live) {
  const set = [];
  const activate = [];
  const changed = [];
  for (const { locationId, available, expected } of requested) {
    const current = live.levels.has(locationId) ? live.levels.get(locationId) : null;
    if (current === available) continue; // already there (e.g. a retry)
    if (current === null) {
      activate.push({ locationId, available }); // not stocked here yet
      continue;
    }
    if (expected !== null && expected !== undefined && expected !== current) {
      changed.push({ locationId, expected, current });
      continue;
    }
    set.push({ locationId, quantity: available, changeFromQuantity: current });
  }
  if (changed.length) throw new StockChangedError(changed);
  return { set, activate };
}

export async function applyInventory(client, inventoryItemId, { set, activate }, { reference } = {}) {
  for (const { locationId, available } of activate) {
    const data = await shopifyGraphql(client, ACTIVATE, {
      inventoryItemId: itemGid(inventoryItemId),
      locationId: locationGid(locationId),
      available,
      idempotencyKey: crypto.randomUUID(),
    });
    assertNoUserErrors(data.inventoryActivate, "inventoryActivate");
  }
  if (set.length) {
    const data = await shopifyGraphql(client, SET_QUANTITIES, {
      input: {
        name: "available",
        reason: "correction",
        ...(reference ? { referenceDocumentUri: reference } : {}),
        quantities: set.map((q) => ({
          inventoryItemId: itemGid(inventoryItemId),
          locationId: locationGid(q.locationId),
          quantity: q.quantity,
          changeFromQuantity: q.changeFromQuantity,
        })),
      },
      idempotencyKey: crypto.randomUUID(),
    });
    const payload = data.inventorySetQuantities;
    if (payload?.userErrors?.some((e) => e.code === "CHANGE_FROM_QUANTITY_STALE")) {
      // Changed between SmartSell's read and the write.
      throw new StockChangedError(set.map((q) => ({ locationId: q.locationId, expected: q.changeFromQuantity, current: null })));
    }
    assertNoUserErrors(payload, "inventorySetQuantities");
  }
  return { set: set.length, activated: activate.length };
}
