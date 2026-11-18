import { Suspense } from "react";
import AmazonDashboard from "@/components/dashboard/amazon/AmazonDashboard";

// /Panel/Ecommerce/Amazon — the seller's Amazon management dashboard.
export default function AmazonPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AmazonDashboard />
    </Suspense>
  );
}
