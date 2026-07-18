"use client";

import { useState } from "react";
import { UserContext } from "@/UseContext";

import Sidebar from "@/PanelComponents/Sidebar";
import Navbar from "@/PanelComponents/Navbar";

export default function PanelLayout({ children }) {
  const [bar, setbar] = useState(true);
  const [setting, setSetting] = useState(false);
  return (
    <UserContext.Provider value={{ bar, setbar, setting, setSetting }}>
      <div className="min-h-screen w-full overflow-x-hidden bg-slate-50">
        <div className="min-h-screen">
          <Sidebar />

          <div className={`${bar ? "md:pl-20 lg:pl-16" : "md:pl-64 lg:pl-60"} min-w-0 transition-[padding] duration-300`}>
            <div className="flex min-h-screen flex-col">
            <Navbar />
            {children}
            </div>
          </div>
        </div>
      </div>
    </UserContext.Provider>
  );
}
