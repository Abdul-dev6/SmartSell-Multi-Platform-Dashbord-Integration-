"use client";
import React, { useState, useContext } from "react";
import { usePathname } from "next/navigation";
import { FaChartBar, FaRegUser } from "react-icons/fa";
import { LuLayoutDashboard } from "react-icons/lu";
import { CiCalendar, CiSettings } from "react-icons/ci";
import { FiShoppingBag } from "react-icons/fi";
import { TbBrandGoogleAnalytics } from "react-icons/tb";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import { IoClose } from "react-icons/io5";
import Link from "next/link";
import { PanelContext } from "@/components/dashboard/PanelContext";
import UserInitials from "@/components/dashboard/layout/UserInitials";

const ECOMMERCE_LINKS = [
  { label: "Products", href: "/Panel/Ecommerce/Product" },
  { label: "Listings", href: "/Panel/Ecommerce/Listing" },
  { label: "Integrations", href: "/Panel/Ecommerce/Integration" },
  { label: "Inventory", href: "/Panel/Ecommerce/Inventory" },
];

const ANALYSIS_LINKS = [{ label: "Reports", href: "/Panel/Analysis/Reports" }];

const OTHER_LINKS = [
  { icon: FaRegUser, label: "Profile", href: "/Panel/User" },
  { icon: CiCalendar, label: "Calendar", href: "/Panel/Calendar" },
];

const itemClass =
  "flex w-full items-center gap-3 p-2.5 rounded-xl text-white transition-all duration-300 hover:bg-slate-800";
const activeClass = "bg-slate-800";

const Sidebar = () => {
  const pathname = usePathname() || "";
  const { bar, setbar, setSetting, currentUser } = useContext(PanelContext);
  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const [isEcommerceOpen, setIsEcommerceOpen] = useState(() =>
    ECOMMERCE_LINKS.some((l) => isActive(l.href)),
  );
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(() =>
    ANALYSIS_LINKS.some((l) => isActive(l.href)),
  );

  // On phones the sidebar covers the page, so close it after navigating.
  const closeOnPhone = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setbar(true);
  };

  // In the collapsed (icon-only) sidebar a group's links are hidden, so
  // clicking the group expands the sidebar and opens it.
  const toggleGroup = (open, setOpen) => {
    if (bar) {
      setbar(false);
      setOpen(true);
    } else {
      setOpen(!open);
    }
  };

  const groups = [
    {
      id: "ecommerce",
      label: "E-commerce",
      icon: FiShoppingBag,
      links: ECOMMERCE_LINKS,
      open: isEcommerceOpen,
      setOpen: setIsEcommerceOpen,
    },
    {
      id: "analysis",
      label: "Analysis",
      icon: TbBrandGoogleAnalytics,
      links: ANALYSIS_LINKS,
      open: isAnalysisOpen,
      setOpen: setIsAnalysisOpen,
    },
  ];

  return (
    <nav
      aria-label="Dashboard"
      className={`${bar ? "-translate-x-full md:translate-x-0 md:w-20 lg:w-16" : "translate-x-0 md:w-64 lg:w-60"} fixed top-0 left-0 z-40 h-screen w-72 bg-slate-950 text-slate-100 flex flex-col overflow-hidden transition-transform duration-300 border-r border-slate-800`}
    >
      {/* Header */}
      <div className="border-b border-slate-800 flex items-center justify-between gap-4 px-4 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="px-2 py-2 rounded-lg bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 shrink-0 text-white shadow-lg shadow-indigo-500/20">
            <FaChartBar className="text-2xl" aria-hidden="true" />
          </div>
          {!bar && (
            <div className="flex flex-col">
              <span className="font-bold text-white">SmartSell</span>
              <span className="text-sm text-slate-400">Admin Panel</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setbar(true)}
          className="md:hidden rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Close sidebar"
        >
          <IoClose className="text-2xl" aria-hidden="true" />
        </button>
      </div>

      {/* Nav Items */}
      <div className="flex flex-col gap-3 p-3 flex-1 min-h-0 overflow-y-auto">
        <Link
          href="/Panel/Dashboard"
          onClick={closeOnPhone}
          aria-label={bar ? "Dashboard" : undefined}
          aria-current={isActive("/Panel/Dashboard") ? "page" : undefined}
          title={bar ? "Dashboard" : undefined}
          className={`${itemClass} ${isActive("/Panel/Dashboard") ? activeClass : ""}`}
        >
          <LuLayoutDashboard className="text-xl shrink-0" aria-hidden="true" />
          {!bar && <span>Dashboard</span>}
        </Link>

        {groups.map(({ id, label, icon: Icon, links, open, setOpen }) => (
          <div key={id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggleGroup(open, setOpen)}
              aria-expanded={!bar && open}
              aria-controls={`sidebar-${id}`}
              aria-label={bar ? label : undefined}
              title={bar ? label : undefined}
              className={`${itemClass} justify-between`}
            >
              <span className="flex items-center gap-3">
                <Icon className="text-xl shrink-0" aria-hidden="true" />
                {!bar && <span>{label}</span>}
              </span>
              {!bar && (
                <span className="mr-2 text-sm" aria-hidden="true">
                  {open ? <IoIosArrowUp /> : <IoIosArrowDown />}
                </span>
              )}
            </button>

            {open && !bar && (
              <div id={`sidebar-${id}`} className="flex flex-col gap-1 pl-8 pr-2 text-sm text-slate-200">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeOnPhone}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={`flex items-center gap-3 p-2 rounded-lg text-white transition-all duration-300 hover:bg-slate-800 ${isActive(link.href) ? activeClass : ""}`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {OTHER_LINKS.map(({ icon: Icon, label, href }) => (
          <Link
            key={href}
            href={href}
            onClick={closeOnPhone}
            aria-label={bar ? label : undefined}
            aria-current={isActive(href) ? "page" : undefined}
            title={bar ? label : undefined}
            className={`${itemClass} ${isActive(href) ? activeClass : ""}`}
          >
            <Icon className="text-xl shrink-0" aria-hidden="true" />
            {!bar && <span>{label}</span>}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setSetting(true)}
          aria-label={bar ? "Settings" : undefined}
          title={bar ? "Settings" : undefined}
          className={itemClass}
        >
          <CiSettings className="text-xl shrink-0" aria-hidden="true" />
          {!bar && <span>Settings</span>}
        </button>
      </div>

      {/* Signed-in user */}
      {!bar && (
        <div className="flex gap-4 p-4 items-center border-t border-slate-800 shrink-0">
          <UserInitials user={currentUser} className="w-12 h-12 text-base" />
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-white truncate max-w-[9rem]">
              {currentUser?.name || currentUser?.email || ""}
            </span>
            {currentUser?.name && (
              <span className="text-slate-400 text-sm truncate max-w-[9rem]">{currentUser.email}</span>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Sidebar;
