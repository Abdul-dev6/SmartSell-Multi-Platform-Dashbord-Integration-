"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorText } from "@/components/dashboard/shared/apiError";

// Loads product-form choices (collections, sales channels, categories) from
// the store via SmartSell's API. `url` null = nothing to load yet.
export function useShopifyOptions(url) {
  const [state, setState] = useState({ loading: Boolean(url), error: null, data: null });

  const load = useCallback(
    async (signal) => {
      if (!url) {
        setState({ loading: false, error: null, data: null });
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const response = await fetch(url, { cache: "no-store", signal });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(apiErrorText(response, json, "Could not load options from Shopify."));
        setState({ loading: false, error: null, data: json });
      } catch (error) {
        if (error.name !== "AbortError") setState({ loading: false, error: error.message, data: null });
      }
    },
    [url],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  return { ...state, reload: () => load() };
}

// Value that follows `value` after it has stopped changing for `ms`.
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
