"use client";

import { motion } from "framer-motion";
import { LayoutGrid, CheckCircle2, FileStack, PackageX } from "lucide-react";


const iconMap = [LayoutGrid, CheckCircle2, FileStack, PackageX];
const bgMap = [
  "bg-indigo-500 shadow-indigo-200",
  "bg-emerald-500 shadow-emerald-200",
  "bg-amber-500 shadow-amber-200",
  "bg-red-500 shadow-red-200",
];

export default function ListingCards({ ListingData = [] }) {
  const totalListings = ListingData.length;
  const activeListings = ListingData.filter(
    (item) => item.status === "active",
  ).length;
  const draftListings = ListingData.filter(
    (item) => item.status === "draft",
  ).length;
  const archivedListings = ListingData.filter(
    (item) => item.status === "archived",
  ).length;
  
  const inactiveListings = ListingData.filter(
    (item) => item.status === "inactive",
  ).length;
  const pendingListings = ListingData.filter(
    (item) => item.status === "pending",
  ).length;

  const listingStats = [
    { id: 1, title: "Total Listings", value: totalListings, change: "+10%", description: "From last month" },
    { id: 2, title: "Draft Listings", value: draftListings, change: "+5%", description: "From last month" },
    { id: 3, title: "Active Listings", value: activeListings, change: "+5%", description: "From last month" },
    { id: 4, title: "Archived Listings", value: archivedListings, change: "+15%", description: "From last month" },
    
  ];  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-8">
      {listingStats.map((item, index) => {
        const Icon = iconMap[index] ?? LayoutGrid;
        const isPositive = item.change.startsWith("+");
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -6, scale: 1.02 }}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 font-medium">{item.title}</p>
              <div
                className={`w-10 h-10 rounded-xl ${bgMap[index]} shadow-lg flex items-center justify-center`}
              >
                <Icon size={18} className="text-white" />
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-bold text-slate-900 mt-1">
                {item.value}
              </h2>
              <p
                className={`text-xs font-semibold mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                  isPositive
                    ? "text-emerald-700 bg-emerald-50"
                    : "text-red-600 bg-red-50"
                }`}
              >
                {item.change} vs last month
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
