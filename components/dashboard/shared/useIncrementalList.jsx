"use client";

import { useEffect, useState } from "react";

export const LIST_STEP = 5;

// How many items to show after the user reaches the end of `shown`.
export function nextCount(shown, total, step = LIST_STEP) {
  return Math.min(total, shown + step);
}

// Shows `step` items at first and `step` more each time the user scrolls to
// the bottom of the list's scroll container; earlier items stay above, so
// scrolling up shows them again. A different list (new filter or search)
// starts again from the first `step`.
//
// Pass `setRoot` as the ref of the scrolling element and `setSentinel` as
// the ref of an empty element rendered after the visible items.
export function useIncrementalList(items, step = LIST_STEP) {
  const first = items[0];
  const signature = `${items.length}:${first?.row_id ?? first?.id ?? ""}`;
  const [state, setState] = useState({ signature, count: step });
  const count = state.signature === signature ? state.count : step;
  // Callback refs (state setters), so the elements can be observed once
  // they are mounted.
  const [root, setRoot] = useState(null);
  const [sentinel, setSentinel] = useState(null);
  const hasMore = count < items.length;

  useEffect(() => {
    if (!root || !sentinel || !hasMore || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState({ signature, count: nextCount(count, items.length, step) });
        }
      },
      { root, rootMargin: "0px 0px 48px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [root, sentinel, signature, count, hasMore, step, items.length]);

  return {
    visible: items.slice(0, count),
    setRoot,
    setSentinel,
    hasMore,
    shown: Math.min(count, items.length),
    total: items.length,
  };
}

// Footer line under an incremental list.
export function ListProgress({ shown, total, hasMore }) {
  if (total <= LIST_STEP) return null;
  return (
    <p className="px-4 py-2 text-center text-xs text-slate-500" aria-live="polite">
      Showing {shown} of {total}
      {hasMore ? " — scroll down for more" : ""}
    </p>
  );
}
