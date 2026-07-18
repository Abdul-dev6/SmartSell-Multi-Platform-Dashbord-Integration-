"use client";
import React from "react";
import { RainfallBar } from "@/PanelComponents/Rainfallbar";
import { SalesLineChart } from "@/PanelComponents/SalesLineChart";
import Piechart from "@/PanelComponents/Piechart";
function Reports() {
  return (
    <>
      <div className="bg-slate-50 w-full min-h-screen px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex w-full mt-4 mb-6">
          <RainfallBar />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8">
            <SalesLineChart />
          </div>

          <div className="xl:col-span-4">
            <Piechart />
          </div>
        </div>
      </div>
    </>
  );
}

export default Reports;
