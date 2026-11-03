"use client";

import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { FilterSelect, ResultSummary, SearchInput } from "@/components/dashboard/shared/FilterControls";
import { DEFAULT_FILTERS, SORT_OPTIONS, STATUS_LABELS, isFiltered } from "@/components/dashboard/shared/catalogFilters";

export default function ListingFilters({
  filters,
  setFilters,
  vendors = [],
  productTypes = [],
  shown = 0,
  total = 0,
  onExport,
}) {
  const set = (key) => (value) => setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mt-8 bg-white rounded-2xl shadow-lg p-4 sm:p-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="md:col-span-2 xl:col-span-2">
          <SearchInput
            value={filters.query}
            onChange={set("query")}
            placeholder="Search name, SKU, vendor..."
            label="Search listings"
          />
        </div>

        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={set("status")}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          allLabel="All statuses"
        />

        <FilterSelect
          label="Product type"
          value={filters.productType}
          onChange={set("productType")}
          options={productTypes}
          allLabel="All product types"
        />

        <FilterSelect
          label="Vendor"
          value={filters.vendor}
          onChange={set("vendor")}
          options={vendors}
          allLabel="All vendors"
        />

        <FilterSelect label="Sort by" value={filters.sort} onChange={set("sort")} options={SORT_OPTIONS} />
      </div>

      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ResultSummary
          shown={shown}
          total={total}
          noun="rows"
          filtered={isFiltered(filters)}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />
        <button
          type="button"
          onClick={onExport}
          disabled={!shown}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-medium text-white shadow-lg transition-all duration-300 hover:bg-indigo-700 disabled:opacity-50"
        >
          <Download size={18} aria-hidden="true" />
          Export CSV
        </button>
      </div>
    </motion.div>
  );
}
