import React from "react";
import { LineChart } from "@mui/x-charts/LineChart";

export function SalesLineChart() {
  return (
    <div className="w-full h-full p-4 bg-white rounded-2xl shadow-sm flex flex-col justify-center">
      <h3 className="text-xl font-bold text-gray-800 mb-2 px-2">
        Performance Metrics
      </h3>
      <LineChart
        xAxis={[
          {
            data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            label: "Months",
          },
        ]}
        series={[
          {
            data: [2, 3, 5.5, 8.5, 1.5, 5, 1, 4, 3, 8],
            label: "ROI",
            showMark: ({ index }) => index % 2 === 0,
            color: "#3b82f6", // Tailwind Blue 500
          },
          {
            data: [4, 5, 4.5, 6.5, 3.5, 6, 4, 7, 6, 9],
            label: "Margin",
            showMark: ({ index }) => index % 2 === 0,
            color: "#10b981", // Tailwind Emerald 500
          },
          {
            data: [6, 8, 10.5, 14.5, 8.5, 12, 7, 11, 9, 15],
            label: "Sales",
            showMark: ({ index }) => index % 2 === 0,
            color: "#8b5cf6", // Tailwind Violet 500
          },
        ]}
        height={300}
      />
    </div>
  );
}
