"use client";

// Loading / error / empty messages shared by the data pages.
export default function LoadState({ loading, error, empty, emptyText, onRetry }) {
  if (loading) {
    return (
      <p className="mt-6 text-sm text-slate-500" role="status">
        Loading…
      </p>
    );
  }
  if (error) {
    return (
      <div role="alert" className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <span>{error}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold underline">
            Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return <p className="mt-6 text-sm text-slate-500">{emptyText}</p>;
  }
  return null;
}
