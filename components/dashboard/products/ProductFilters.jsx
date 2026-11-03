"use client";

import { FilterSelect, ResultSummary, SearchInput } from "@/components/dashboard/shared/FilterControls";
import { DEFAULT_FILTERS, STATUS_LABELS, isFiltered } from "@/components/dashboard/shared/catalogFilters";

export default function SearchFilter({ filters, setFilters, productTypes = [], shown = 0, total = 0 }) {
  const set = (key) => (value) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2">
          <SearchInput
            value={filters.query}
            onChange={set("query")}
            placeholder="Search name, SKU, vendor..."
            label="Search products"
          />
        </div>

        <FilterSelect
          label="Product type"
          value={filters.productType}
          onChange={set("productType")}
          options={productTypes}
          allLabel="All product types"
        />

        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={set("status")}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          allLabel="All statuses"
        />
      </div>

      <ResultSummary
        shown={shown}
        total={total}
        noun="rows"
        filtered={isFiltered(filters)}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />
    </div>
  );
}
