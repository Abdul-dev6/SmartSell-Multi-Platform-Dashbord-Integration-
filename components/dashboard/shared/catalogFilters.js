// Search, filter, sort and CSV export for the product/listing/inventory rows
// returned by /api/inventory (one row per variant per location).

// Same thresholds as the tables' stock badges.
export const LOW_STOCK_THRESHOLD = 10;

export const STOCK_LABELS = {
  in: "In stock",
  low: "Low stock",
  out: "Out of stock",
  untracked: "Not tracked",
};

export const STATUS_LABELS = { active: "Active", draft: "Draft", archived: "Archived" };

export const SORT_OPTIONS = [
  { value: "title", label: "Name (A–Z)" },
  { value: "updated_desc", label: "Recently updated" },
  { value: "updated_asc", label: "Least recently updated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "stock_desc", label: "Stock: high to low" },
];

export const DEFAULT_FILTERS = {
  query: "",
  status: "all",
  vendor: "all",
  productType: "all",
  location: "all",
  stock: "all",
  sort: "title",
};

export function stockStatus(available) {
  if (typeof available !== "number") return "untracked";
  if (available <= 0) return "out";
  if (available <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}

// Distinct non-empty values of `key`, sorted, for building filter options.
export function uniqueValues(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter((v) => v !== null && v !== undefined && v !== ""))]
    .map(String)
    .sort((a, b) => a.localeCompare(b));
}

// Locations present in the rows, labelled by name when known.
export function locationOptions(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (row.location_id && !byId.has(row.location_id)) {
      byId.set(row.location_id, row.location_name || `Location ${row.location_id}`);
    }
  }
  return [...byId.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const numberOrNull = (value) => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || Number.isNaN(n) ? null : n;
};

// Sorts with missing values last in either direction.
function compareNullable(a, b, direction) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * (a < b ? -1 : a > b ? 1 : 0);
}

const SORTERS = {
  title: (a, b) => (a.title || "").localeCompare(b.title || "") || (a.variant_title || "").localeCompare(b.variant_title || ""),
  updated_desc: (a, b) => compareNullable(Date.parse(a.updated_at) || null, Date.parse(b.updated_at) || null, -1),
  updated_asc: (a, b) => compareNullable(Date.parse(a.updated_at) || null, Date.parse(b.updated_at) || null, 1),
  price_asc: (a, b) => compareNullable(numberOrNull(a.price), numberOrNull(b.price), 1),
  price_desc: (a, b) => compareNullable(numberOrNull(a.price), numberOrNull(b.price), -1),
  stock_desc: (a, b) => compareNullable(numberOrNull(a.available), numberOrNull(b.available), -1),
};

const SEARCH_FIELDS = ["title", "variant_title", "sku", "vendor", "product_type", "location_name"];

export function filterRows(rows, filters = DEFAULT_FILTERS) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const terms = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const result = rows.filter((row) => {
    if (terms.length) {
      const haystack = SEARCH_FIELDS.map((key) => row[key] || "").join(" ").toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (f.status !== "all" && row.status !== f.status) return false;
    if (f.vendor !== "all" && (row.vendor || "") !== f.vendor) return false;
    if (f.productType !== "all" && (row.product_type || "") !== f.productType) return false;
    if (f.location !== "all" && row.location_id !== f.location) return false;
    if (f.stock !== "all" && stockStatus(row.available) !== f.stock) return false;
    return true;
  });

  return result.sort(SORTERS[f.sort] || SORTERS.title);
}

export function isFiltered(filters) {
  return Object.entries(DEFAULT_FILTERS).some(([key, value]) => key !== "sort" && filters[key] !== value);
}

// CSV with quoting. Cells that a spreadsheet would treat as a formula
// (=, +, -, @, tab, CR) are prefixed with ' so opening the file can't run them.
export function toCsv(rows, columns) {
  const cell = (value) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(typeof c.value === "function" ? c.value(row) : row[c.key])).join(","));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename, csv) {
  // BOM so Excel opens UTF-8 (e.g. non-English product names) correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const CSV_COLUMNS = [
  { key: "title", label: "Product" },
  { key: "variant_title", label: "Variant" },
  { key: "sku", label: "SKU" },
  { key: "vendor", label: "Vendor" },
  { key: "product_type", label: "Product type" },
  { key: "status", label: "Status" },
  { key: "price", label: "Price" },
  { label: "Location", value: (row) => row.location_name || row.location_id || "" },
  { label: "Available", value: (row) => (typeof row.available === "number" ? row.available : "Not tracked") },
  { label: "Stock status", value: (row) => STOCK_LABELS[stockStatus(row.available)] },
  { key: "product_id", label: "Shopify product ID" },
  { key: "updated_at", label: "Updated" },
];

export function exportFilename(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
