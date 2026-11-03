import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  DEFAULT_FILTERS,
  filterRows,
  isFiltered,
  locationOptions,
  stockStatus,
  toCsv,
  uniqueValues,
} from "@/components/dashboard/shared/catalogFilters";
import { inventoryHealth } from "@/components/dashboard/inventory/InventoryHealth";
import { getInventoryRows } from "@/lib/catalog";
import { linkStore } from "@/lib/shopify/stores";
import { upsertShopifyProducts } from "@/lib/shopify/syncProduct";
import Inventory from "@/models/Inventory";
import Shopifystore from "@/models/ShopifyStore";
import { createUser, resetDatabase } from "./helpers/db";
import { shopifyProduct } from "./helpers/fakeShopify";

const row = (o) => ({
  title: "T",
  variant_title: "Default",
  sku: "S",
  vendor: "V",
  product_type: "P",
  status: "active",
  price: "1.00",
  available: 5,
  location_id: "1",
  location_name: "Main",
  updated_at: "2026-10-01T00:00:00Z",
  ...o,
});

const rows = [
  row({ title: "Blue Mug", sku: "MUG-B", vendor: "Acme", product_type: "Mugs", price: "12.00", available: 0, location_id: "1", location_name: "Lahore Shop", updated_at: "2026-10-03T00:00:00Z" }),
  row({ title: "Red Mug", sku: "MUG-R", vendor: "Acme", product_type: "Mugs", price: "9.50", available: 40, location_id: "2", location_name: "Main", status: "draft", updated_at: "2026-10-01T00:00:00Z" }),
  row({ title: "Gift Card", sku: "GIFT", vendor: "Store", product_type: "", price: null, available: null, location_id: null, location_name: null, updated_at: "2026-10-02T00:00:00Z" }),
  row({ title: "Tea", sku: "TEA-1", vendor: "Leaf", product_type: "Drinks", price: "3.00", available: 7, location_id: "2", location_name: "Main" }),
];

describe("stock status", () => {
  it("matches the table thresholds and keeps untracked separate from zero", () => {
    expect([null, undefined, -1, 0, 1, 10, 11].map(stockStatus)).toEqual([
      "untracked", "untracked", "out", "out", "low", "low", "in",
    ]);
  });
});

describe("filterRows", () => {
  const titles = (f) => filterRows(rows, { ...DEFAULT_FILTERS, ...f }).map((r) => r.title);

  it("searches name, SKU, vendor, type and location; every word must match", () => {
    expect(titles({ query: "mug" })).toEqual(["Blue Mug", "Red Mug"]);
    expect(titles({ query: "MUG-R" })).toEqual(["Red Mug"]);
    expect(titles({ query: "acme lahore" })).toEqual(["Blue Mug"]);
    expect(titles({ query: "leaf" })).toEqual(["Tea"]);
    expect(titles({ query: "nothing-matches" })).toEqual([]);
  });

  it("filters by status, vendor, type, location and stock", () => {
    expect(titles({ status: "draft" })).toEqual(["Red Mug"]);
    expect(titles({ vendor: "Acme" })).toEqual(["Blue Mug", "Red Mug"]);
    expect(titles({ productType: "Drinks" })).toEqual(["Tea"]);
    expect(titles({ location: "2" })).toEqual(["Red Mug", "Tea"]);
    expect(titles({ stock: "out" })).toEqual(["Blue Mug"]);
    expect(titles({ stock: "low" })).toEqual(["Tea"]);
    expect(titles({ stock: "untracked" })).toEqual(["Gift Card"]);
    expect(titles({ vendor: "Acme", stock: "in" })).toEqual(["Red Mug"]);
  });

  it("sorts, with missing values last in both directions", () => {
    expect(titles({ sort: "price_asc" })).toEqual(["Tea", "Red Mug", "Blue Mug", "Gift Card"]);
    expect(titles({ sort: "price_desc" })).toEqual(["Blue Mug", "Red Mug", "Tea", "Gift Card"]);
    expect(titles({ sort: "stock_desc" })).toEqual(["Red Mug", "Tea", "Blue Mug", "Gift Card"]);
    expect(titles({ sort: "updated_desc" })[0]).toBe("Blue Mug");
    expect(titles({})).toEqual(["Blue Mug", "Gift Card", "Red Mug", "Tea"]);
  });

  it("does not mutate the input and reports whether filters are active", () => {
    const copy = [...rows];
    filterRows(rows, { ...DEFAULT_FILTERS, sort: "price_desc" });
    expect(rows).toEqual(copy);
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, sort: "price_asc" })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, query: "x" })).toBe(true);
  });
});

describe("options come from real data", () => {
  it("lists distinct vendors/types and named locations", () => {
    expect(uniqueValues(rows, "vendor")).toEqual(["Acme", "Leaf", "Store"]);
    expect(uniqueValues(rows, "product_type")).toEqual(["Drinks", "Mugs"]);
    expect(locationOptions(rows)).toEqual([
      { value: "1", label: "Lahore Shop" },
      { value: "2", label: "Main" },
    ]);
    expect(locationOptions([row({ location_id: "9", location_name: null })])).toEqual([
      { value: "9", label: "Location 9" },
    ]);
  });
});

describe("CSV export", () => {
  it("quotes, escapes and neutralises spreadsheet formulas", () => {
    const csv = toCsv(
      [row({ title: 'Mug, "large"', sku: '=HYPERLINK("http://evil")', vendor: "+cmd", product_type: "@x", available: null })],
      CSV_COLUMNS,
    );
    const [header, line] = csv.split("\r\n");
    expect(header.startsWith("Product,Variant,SKU,Vendor")).toBe(true);
    expect(line).toContain('"Mug, ""large"""');
    expect(line).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(line).toContain("'+cmd");
    expect(line).toContain("'@x");
    expect(line).toContain("Not tracked");
  });
});

describe("inventory health", () => {
  it("is the share of tracked rows in stock, excluding untracked", () => {
    expect(inventoryHealth(rows)).toEqual({ tracked: 3, inStock: 2, outOfStock: 1, percentage: 67 });
    expect(inventoryHealth([row({ available: null })]).percentage).toBeNull();
    expect(inventoryHealth([]).percentage).toBeNull();
  });
});

describe("catalog rows include location names", () => {
  it("maps location IDs to names from the store", async () => {
    await resetDatabase();
    await Shopifystore.init();
    const user = await createUser();
    const store = await linkStore({ userId: user._id, shop: "loc-test.myshopify.com", accessToken: "t", scope: "" });
    await upsertShopifyProducts(store, [shopifyProduct(1)]);
    await Inventory.create({ user: user._id, shopifyStore: store._id, inventoryItemId: "100", locationId: "7", available: 3 });

    const storesById = new Map([
      [String(store._id), { shop: store.shop, locations: [{ id: "7", name: "Main Warehouse" }] }],
    ]);
    const { rows: result } = await getInventoryRows(user._id, [store._id], storesById);
    expect(result[0]).toMatchObject({ location_id: "7", location_name: "Main Warehouse", shop: "loc-test.myshopify.com" });
  });
});
