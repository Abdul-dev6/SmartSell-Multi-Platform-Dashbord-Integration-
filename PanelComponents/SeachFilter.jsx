"use client";

import { Search } from "lucide-react";

export default function SearchFilter() {
  return (
    <div className="mt-10 flex flex-col lg:flex-row gap-4">
      <div className="relative flex-1">
        <Search size={18} className="absolute left-4 top-4 text-slate-400" />

        <input
          type="text"
          placeholder="Search products..."
          className="
          w-full
          rounded-xl
          border
          bg-white
          pl-11
          pr-4
          py-3
          outline-none
          focus:ring-2
          focus:ring-indigo-500
          "
        />
      </div>

      <select
        className="
        w-full lg:w-auto
        rounded-xl
        border
        bg-white
        px-5
        py-3
        outline-none
        "
      >
        <option>All Categories</option>
        <option>Electronics</option>
        <option>Fashion</option>
        <option>Home</option>
      </select>

      <select
        className="
        w-full lg:w-auto
        rounded-xl
        border
        bg-white
        px-5
        py-3
        outline-none
        "
      >
        <option>All Status</option>
        <option>Published</option>
        <option>Draft</option>
      </select>
    </div>
  );
}
