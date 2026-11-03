"use client";

import { useMemo, useState } from "react";
import { DEFAULT_FILTERS, filterRows, locationOptions, uniqueValues } from "@/components/dashboard/shared/catalogFilters";

// Filter state plus options built from the rows actually loaded.
// `initialQuery` pre-fills the search box (e.g. from the navbar search).
export default function useCatalogFilters(rows, initialQuery = "") {
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS, query: initialQuery }));
  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const options = useMemo(
    () => ({
      vendors: uniqueValues(rows, "vendor"),
      productTypes: uniqueValues(rows, "product_type"),
      locations: locationOptions(rows),
    }),
    [rows],
  );
  return { filters, setFilters, filtered, options };
}
