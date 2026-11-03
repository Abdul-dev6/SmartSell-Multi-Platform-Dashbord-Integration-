"use client";

import { useEffect, useState } from "react";
import { PanelContext } from "@/components/dashboard/PanelContext";

import Sidebar from "@/components/dashboard/layout/Sidebar";
import Navbar from "@/components/dashboard/layout/Navbar";

export default function PanelLayout({ children }) {
  const [bar, setbar] = useState(true);
  const [setting, setSetting] = useState(false);
  // Loaded once for the whole panel (name/email shown in the navbar and sidebar).
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401) {
          // The session no longer belongs to an account (e.g. it was
          // deleted): sign out and go to Login instead of an empty panel.
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/Login?next=${encodeURIComponent(next)}`);
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (active && data.user) setCurrentUser(data.user);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <PanelContext.Provider value={{ bar, setbar, setting, setSetting, currentUser }}>
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
    </PanelContext.Provider>
  );
}
