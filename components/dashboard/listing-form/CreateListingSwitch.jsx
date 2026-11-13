"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CreateListingHeader from "@/components/dashboard/listing-form/CreateListingHeader";
import CreateListingForm from "@/components/dashboard/listing-form/CreateListingForm";
import EbayListingForm from "@/components/dashboard/ebay/EbayListingForm";

const TABS = [
  { value: "shopify", label: "Shopify" },
  { value: "ebay", label: "eBay" },
];

// Chooses the marketplace for a new listing (?marketplace=shopify|ebay).
function Switch() {
  const marketplace = useSearchParams().get("marketplace") === "ebay" ? "ebay" : "shopify";
  return (
    <>
      <CreateListingHeader
        {...(marketplace === "ebay"
          ? { title: "Create eBay Listing", subtitle: "Add a product to your eBay account and publish it as a fixed-price listing." }
          : {})}
      />
      <div role="tablist" aria-label="Marketplace" className="mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            role="tab"
            aria-selected={marketplace === tab.value}
            href={`/Panel/Ecommerce/Listing/CreateListing?marketplace=${tab.value}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              marketplace === tab.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {marketplace === "ebay" ? <EbayListingForm /> : <CreateListingForm />}
    </>
  );
}

export default function CreateListingSwitch() {
  return (
    <Suspense fallback={null}>
      <Switch />
    </Suspense>
  );
}
