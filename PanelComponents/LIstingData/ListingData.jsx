import React from "react";
export const listingStats = [
  {
    id: 1,
    title: "Total Listings",
    value: "1,250",
    color: "bg-indigo-500",
    change: "+12%",
  },
  {
    id: 2,
    title: "Active Products",
    value: "1,180",
    color: "bg-green-500",
    change: "+8%",
  },
  {
    id: 3,
    title: "Draft Products",
    value: "45",
    color: "bg-amber-500",
    change: "-3%",
  },
  {
    id: 4,
    title: "Out of Stock",
    value: "25",
    color: "bg-red-500",
    change: "+2%",
  },
];

export const statusOptions = ["All Status", "Active", "Draft", "Archived"];

export const collectionOptions = [
  "All Collections",
  "Electronics",
  "Fashion",
  "Accessories",
  "Home",
];

export const vendorOptions = [
  "All Vendors",
  "Apple",
  "Nike",
  "Samsung",
  "Sony",
];

export const listings = [
  {
    id: 1,
    image: "/iphone.png",
    title: "iPhone 16 Pro",
    sku: "IP1001",
    vendor: "Apple",
    collection: "Electronics",
    price: "$999",
    inventory: 120,
    status: "Active",
    updated: "Today",
  },
  {
    id: 2,
    image: "/macbook.png",
    title: "MacBook Air M3",
    sku: "MB2005",
    vendor: "Apple",
    collection: "Electronics",
    price: "$1299",
    inventory: 25,
    status: "Draft",
    updated: "Yesterday",
  },
  {
    id: 3,
    image: "/airpods.png",
    title: "AirPods Pro",
    sku: "AP4001",
    vendor: "Apple",
    collection: "Accessories",
    price: "$249",
    inventory: 0,
    status: "Out of Stock",
    updated: "2 days ago",
  },
];
