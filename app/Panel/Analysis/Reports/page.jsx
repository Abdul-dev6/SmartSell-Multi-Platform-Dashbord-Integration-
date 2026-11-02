"use client";
import React from "react";
import { RainfallBar } from "@/PanelComponents/Rainfallbar";
import { SalesLineChart } from "@/PanelComponents/SalesLineChart";
import Piechart from "@/PanelComponents/Piechart";

function Reports() {
  return (
    <div className="bg-slate-50 w-full min-h-screen px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">

      {/* ── Hero Banner ── */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 py-8 text-white shadow-lg shadow-blue-950/20">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">
          Nexus Panel
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black">
          Analytics & Reports
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-blue-100/70">
          Track performance, revenue trends, and monthly profit breakdowns.
        </p>
      </div>

      {/* ── Full-width Rainfall / Yearly Overview Chart ── */}
      <div className="w-full">
        <RainfallBar />
      </div>

      {/* ── Line Chart + Pie Chart ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8">
          <SalesLineChart />
        </div>
        <div className="xl:col-span-4">
          <Piechart />
        </div>
      </div>
    </div>
  );
}

export default Reports;
