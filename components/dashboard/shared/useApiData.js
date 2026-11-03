"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorText } from "./apiError";

// Loads JSON from a SmartSell API route that responds with
// { success, data, ... }. Returns the whole body so callers can read extra
// fields (e.g. sync state), plus loading/error state and a reload function.
export default function useApiData(url) {
  const [body, setBody] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(url, { cache: "no-store", signal });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) {
          throw new Error(apiErrorText(response, json, `Request failed (${response.status})`));
        }
        setBody(json);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Request failed");
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [url],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Deferred so state updates happen outside the effect body.
    const timer = setTimeout(() => load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  return { body, error, loading, reload: () => load() };
}
