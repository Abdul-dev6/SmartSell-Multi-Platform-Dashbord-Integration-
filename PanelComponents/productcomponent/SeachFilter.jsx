"use client";

import { Search, SlidersHorizontal } from "lucide-react";

export default function SearchFilter() {
  return (
    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row gap-3">

        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
          />
        </div>

        {/* Category */}
        <select className="w-full lg:w-44 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition cursor-pointer">
          <option>All Categories</option>
          <option>Electronics</option>
          <option>Fashion</option>
          <option>Home</option>
        </select>

        {/* Status */}
        <select className="w-full lg:w-44 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition cursor-pointer">
          <option>All Status</option>
          <option>Published</option>
          <option>Draft</option>
        </select>

        {/* Filter Button */}
        <button className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition">
          <SlidersHorizontal size={15} />
          Filters
        </button>
      </div>
    </div>
  );
}
