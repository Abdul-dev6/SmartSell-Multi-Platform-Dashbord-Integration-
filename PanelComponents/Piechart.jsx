import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { name: "Revenue", value: 4000 },
  { name: "Expenses", value: 3000 },
  { name: "Profit", value: 2000 },
];

const COLORS = ["#6366f1", "#64748b", "#facc15"];

const PieChartComponent = () => {
  return (
    <div className="bg-white  p-5 rounded-xl h-96 w-full flex flex-col  shadow-sm shadow-blue-950/5 border border-slate-200/80">
      {/* Title */}
      <h1 className="text-base font-semibold mb-4 text-slate-800 dark:text-white">
        Financial Overview
      </h1>

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: COLORS[index] }}
            ></div>
            <span className="text-sm">{item.name}</span>
          </div>
        ))}
      </div>

      {/* Pie Chart */}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
              isAnimationActive={true}
              animationDuration={1500}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `$${value.toLocaleString()}`}
              contentStyle={{
                backgroundColor: "#fff",
                border: "none",
                borderRadius: "12px",
                boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PieChartComponent;
