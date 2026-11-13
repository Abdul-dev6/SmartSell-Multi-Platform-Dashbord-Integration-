import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, DEFAULT_FILTERS, filterRows, isFiltered, toCsv } from "@/components/dashboard/shared/catalogFilters";

const rows = [
  { title: "Shopify mug", sku: "MUG", marketplace: "shopify", platform: "Shopify", available: 4 },
  { title: "Legacy row", sku: "OLD", platform: "Shopify", available: 1 },
  { title: "eBay lamp", sku: "LAMP", marketplace: "ebay", platform: "eBay", available: 2 },
];
const titles = (f) => filterRows(rows, { ...DEFAULT_FILTERS, ...f }).map((r) => r.title);

describe("marketplace filter", () => {
  it("shows all marketplaces by default", () => {
    expect(DEFAULT_FILTERS.marketplace).toBe("all");
    expect(titles({})).toEqual(["eBay lamp", "Legacy row", "Shopify mug"]);
  });

  it("narrows to Shopify only (rows without a marketplace are Shopify)", () => {
    expect(titles({ marketplace: "shopify" })).toEqual(["Legacy row", "Shopify mug"]);
  });

  it("narrows to eBay only and combines with other filters", () => {
    expect(titles({ marketplace: "ebay" })).toEqual(["eBay lamp"]);
    expect(titles({ marketplace: "ebay", query: "mug" })).toEqual([]);
  });

  it("counts as an active filter and is exported to CSV", () => {
    expect(isFiltered({ ...DEFAULT_FILTERS, marketplace: "ebay" })).toBe(true);
    const [header, , , lamp] = toCsv(rows, CSV_COLUMNS).split("\r\n");
    expect(header.endsWith(",Marketplace")).toBe(true);
    expect(lamp.endsWith(",eBay")).toBe(true);
  });
});
