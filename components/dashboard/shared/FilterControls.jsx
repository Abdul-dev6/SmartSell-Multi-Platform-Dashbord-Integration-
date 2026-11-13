"use client";

import { Search } from "lucide-react";
import { MARKETPLACE_OPTIONS } from "@/components/dashboard/shared/catalogFilters";

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

export function SearchInput({ value, onChange, placeholder, label = "Search" }) {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${fieldClass} pl-11`}
      />
    </div>
  );
}

// `options`: array of strings or { value, label }. "all" is added first.
export function FilterSelect({ label, value, onChange, options, allLabel }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={fieldClass}>
      {allLabel && <option value="all">{allLabel}</option>}
      {options.map((option) => {
        const { value: v, label: l } = typeof option === "string" ? { value: option, label: option } : option;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

// All Marketplaces / Shopify only / eBay only.
export function MarketplaceSelect({ value, onChange }) {
  return (
    <FilterSelect
      label="Marketplace"
      value={value}
      onChange={onChange}
      options={MARKETPLACE_OPTIONS}
      allLabel="All marketplaces"
    />
  );
}

export function ResultSummary({ shown, total, filtered, onReset, noun = "items" }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" aria-live="polite">
      <span>
        Showing {shown} of {total} {noun}
      </span>
      {filtered && (
        <button type="button" onClick={onReset} className="font-medium text-indigo-600 hover:text-indigo-800">
          Clear filters
        </button>
      )}
    </div>
  );
}
