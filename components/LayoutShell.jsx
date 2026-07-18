"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const isPanel = pathname.startsWith("/Panel");

  return (
    <>
      {!isPanel && <Navbar />}
      {children}
      {!isPanel && <Footer />}
    </>
  );
}
