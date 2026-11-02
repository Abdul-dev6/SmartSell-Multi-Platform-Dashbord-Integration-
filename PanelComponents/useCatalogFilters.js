"use client";

import { useMemo, useState } from "react";
import { DEFAULT_FILTERS, filterRows, locationOptions, uniqueValues } from "./catalogFilters";

// Filter state plus options built from the rows actually loaded.
export default function useCatalogFilters(rows) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
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
