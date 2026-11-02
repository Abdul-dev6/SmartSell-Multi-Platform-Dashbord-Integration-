"use client";
import React, { useState, useEffect } from "react";
import { formatMoney } from "./format";

// Monthly orders and revenue for the year, from /api/dashboard/summary.
export function RainfallBar({ data = [], currency, year }) {
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    // Trigger animation shortly after mount
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Max values for scaling out of 100%
  // `|| 1` keeps bars at 0% (not NaN) when a year has no orders yet.
  const maxOrders = Math.max(0, ...data.map((d) => d.orders || 0)) * 1.1 || 1;
  const maxRevenue = Math.max(0, ...data.map((d) => d.revenue || 0)) * 1.1 || 1;

  return (
    <div className="w-full h-full p-10 lg:p-[4%] border border-slate-200/80 rounded-[1.5rem] shadow-xl relative overflow-hidden group/card transition-all duration-500 hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.3)]">
        
        {/* // Background Gradient Circles bg-gray-900 */}
         <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-500 rounded-full mix-blend-screen filter blur-[60px] opacity-20 transform group-hover/card:scale-110 transition-transform duration-1000"></div>
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-emerald-500 rounded-full mix-blend-screen filter blur-[60px] opacity-20 transform group-hover/card:scale-110 transition-transform duration-1000"></div>

      <div className="relative z-10 flex flex-col h-full">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-700 tracking-tight drop-shadow-sm">
              Yearly Overview{year ? ` ${year}` : ""}
            </h2>
            <p className="text-[10px] font-semibold text-gray-500 mt-1 tracking-wide uppercase">
              Orders vs. Revenue
            </p>
          </div>

          {/* Legend */}
          <div className="flex gap-4 bg-white/5 backdrop-blur-md px-3 py-3 rounded-xl border border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span>
              <span className="text-[10px] font-bold text-gray-500">
                Orders
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
              <span className="text-[10px] font-bold text-gray-500">
                Revenue
              </span>
            </div>
          </div>
        </div>

        {/* Chart Area */}
        <div className="flex-1 flex items-end justify-between h-48 mt-2 border-b-2 border-white/10 pb-2 relative gap-1 md:gap-2">
          {/* Horizontal Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-full border-t border-dashed border-gray-400 h-0"
              ></div>
            ))}
          </div>

          {data.map((item, index) => (
            <div
              key={index}
              className="flex flex-col items-center flex-1 group z-10"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Bars Container */}
              <div className="w-full flex justify-center items-end gap-[1px] md:gap-1 h-[160px] relative">
                {/* Hover Tooltip */}
                <div
                  className={`absolute -top-16 bg-gray-800/90 backdrop-blur-xl rounded-xl p-2.5 shadow-xl border border-white/10 transition-all duration-300 z-30 pointer-events-none transform -translate-x-1/2 left-1/2 min-w-[90px] ${hovered === index ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2"}`}
                >
                  <p className="text-white text-[10px] font-black mb-1 border-b border-gray-600 pb-0.5">
                    {item.month}
                  </p>
                  <p className="text-blue-400 text-[9px] font-bold tracking-wide">
                    Orders: <span className="text-white">{item.orders || 0}</span>
                  </p>
                  <p className="text-emerald-400 text-[9px] font-bold tracking-wide">
                    Revenue:{" "}
                    <span className="text-white">
                      {formatMoney(item.revenue || 0, currency)}
                    </span>
                  </p>
                </div>

                {/* Orders Bar */}
                <div className="w-1/2 max-w-[20px] h-full flex items-end justify-center group-hover:brightness-110 transition-all">
                  <div
                    className="w-full bg-gradient-to-t from-blue-700 via-blue-500 to-blue-400 rounded-t-lg transition-all duration-[1200ms] ease-out shadow-[0_0_10px_rgba(59,130,246,0.15)] group-hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] relative overflow-hidden"
                    style={{
                      height: mounted
                        ? `${((item.orders || 0) / maxOrders) * 100}%`
                        : "0%",
                      transitionDelay: `${index * 100}ms`,
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </div>

                {/* Revenue Bar */}
                <div className="w-1/2 max-w-[20px] h-full flex items-end justify-center group-hover:brightness-110 transition-all">
                  <div
                    className="w-full bg-gradient-to-t from-emerald-700 via-emerald-500 to-emerald-400 rounded-t-lg transition-all duration-[1200ms] ease-out shadow-[0_0_10px_rgba(52,211,153,0.15)] group-hover:shadow-[0_0_15px_rgba(52,211,153,0.4)] relative overflow-hidden"
                    style={{
                      height: mounted
                        ? `${((item.revenue || 0) / maxRevenue) * 100}%`
                        : "0%",
                      transitionDelay: `${index * 100 + 50}ms`,
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* X-Axis Labels */}
        <div className="flex items-center justify-between px-1 mt-2">
          {data.map((item, index) => (
            <div key={index} className="flex-1 flex justify-center">
              <span
                className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 ${hovered === index ? "text-gray-700 scale-110" : "text-gray-500"}`}
              >
                {item.month}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
