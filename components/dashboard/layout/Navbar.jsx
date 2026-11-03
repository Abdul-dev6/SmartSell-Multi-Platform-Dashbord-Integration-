"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HiOutlineBellAlert } from "react-icons/hi2";
import { CiSettings } from "react-icons/ci";
import { FaBars } from "react-icons/fa6";
import { FiUser, FiBell, FiHelpCircle, FiLogOut } from "react-icons/fi";
import { PanelContext } from "@/components/dashboard/PanelContext";
import UserInitials from "@/components/dashboard/layout/UserInitials";
import { useNotifications } from "@/components/dashboard/layout/Notifications";

// Page titles shown in the top bar, by route.
const PAGE_TITLES = [
  [/^\/Panel\/Dashboard/, "Dashboard", "Welcome back! Here's what's happening today."],
  [/^\/Panel\/Analysis\/Reports/, "Reports", "Orders, revenue and order value."],
  [/^\/Panel\/Ecommerce\/Product\/[^/]+\/edit/, "Edit product", "Changes are saved to Shopify."],
  [/^\/Panel\/Ecommerce\/Product/, "Products", "Your synced Shopify products."],
  [/^\/Panel\/Ecommerce\/Listing\/CreateListing/, "Create listing", "Publish a new product to Shopify."],
  [/^\/Panel\/Ecommerce\/Listing/, "Listings", "Your Shopify listings."],
  [/^\/Panel\/Ecommerce\/Inventory/, "Inventory", "Stock levels by location."],
  [/^\/Panel\/Ecommerce\/Integration/, "Integrations", "Connected stores and live updates."],
  [/^\/Panel\/Expenses/, "Expenses", "Costs used for profit."],
  [/^\/Panel\/Calendar/, "Calendar", "Your events."],
  [/^\/Panel\/User/, "Profile", "Your account."],
];

function pageTitle(pathname) {
  const match = PAGE_TITLES.find(([pattern]) => pattern.test(pathname || ""));
  return match ? { title: match[1], subtitle: match[2] } : { title: "Dashboard", subtitle: "" };
}

function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { title, subtitle } = pageTitle(pathname);
  const [query, setQuery] = useState("");
  const [notification, setNotification] = useState(false);
  const { bar, setbar } = useContext(PanelContext);
  const { setting, setSetting, currentUser } = useContext(PanelContext);
  const displayName = currentUser?.name || currentUser?.email || "";
  const displaySub = currentUser?.name ? currentUser.email : "";

  // Separate refs for each dropdown
  const settingRef = useRef(null);
  const notificationRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingRef.current && !settingRef.current.contains(event.target)) {
        setSetting(false);
      }
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target)
      ) {
        setNotification(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSetting(false);
        setNotification(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [setSetting]);

  // Searches products (name, SKU, vendor, type, location) on the Products page.
  const handleSearch = (event) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/Panel/Ecommerce/Product?q=${encodeURIComponent(q)}` : "/Panel/Ecommerce/Product");
  };

  const goTo = (href) => {
    setSetting(false);
    router.push(href);
  };

  const { notifications: datanotification, unread: unreadCount, markAllRead, clearAll } = useNotifications();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Full navigation so no dashboard state survives the logout.
      window.location.assign("/Login");
    }
  };

  const settingItems = [
    { icon: <FiUser size={15} />, label: "Profile", color: "text-slate-600", onClick: () => goTo("/Panel/User") },
    {
      icon: <FiBell size={15} />,
      label: "Notifications",
      color: "text-slate-600",
      onClick: () => {
        setSetting(false);
        setNotification(true);
      },
    },
    { icon: <FiHelpCircle size={15} />, label: "Help & Support", color: "text-slate-600", onClick: () => goTo("/Contact") },
    { icon: <FiLogOut size={15} />, label: "Logout", color: "text-red-500", onClick: handleLogout },
  ];

  return (
    <div className="relative border-b border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60 text-slate-800">
      <div className="flex items-center gap-3 md:gap-4 flex-nowrap">

        {/* Left: Hamburger + Title */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setbar(!bar)}
            aria-label={bar ? "Open sidebar" : "Close sidebar"}
            aria-expanded={!bar}
            className="rounded-lg p-1 text-slate-600 hover:text-indigo-600 transition"
          >
            <FaBars className="text-xl" aria-hidden="true" />
          </button>
          <div className="hidden sm:flex flex-col leading-tight">
            <h1 className="font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>

        {/* Search Bar */}
        <form
          role="search"
          onSubmit={handleSearch}
          className="relative hidden md:block flex-1 max-w-2xl mx-2 lg:mx-4 min-w-0"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
            placeholder="Search products, SKU, vendor..."
            className="w-full px-4 py-2.5 pl-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          />
          <svg
            className="absolute left-3 top-2.5 w-5 h-5 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </form>

        {/* Right: Action Icons */}
        <div className="flex items-center gap-1 sm:gap-2 text-xl text-slate-600 shrink-0 ml-auto">

          {/* Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => {
                setNotification(!notification);
                setSetting(false);
              }}
              className="rounded-full p-2 hover:bg-slate-100 transition relative"
              aria-label="Notifications"
            >
              <HiOutlineBellAlert />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
              )}
            </button>

            {notification && (
              <div className="absolute right-0 top-full z-20 mt-2 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 sm:w-80 text-slate-800 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-800 text-sm">
                      Notifications
                    </h2>
                    {unreadCount > 0 && (
                      <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {unreadCount > 0 && (
                      <button type="button" onClick={markAllRead} className="text-xs font-medium text-indigo-600 hover:underline">
                        Mark all read
                      </button>
                    )}
                    {datanotification.length > 0 && (
                      <button type="button" onClick={clearAll} className="text-xs font-medium text-red-600 hover:underline">
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                  {datanotification.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-slate-500">No notifications.</p>
                  )}
                  {datanotification.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 px-4 py-3 ${item.read ? "" : "bg-indigo-50/50"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          item.type === "error" ? "bg-red-100 text-red-600" : item.type === "success" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.type === "error" ? "✕" : item.type === "success" ? "✓" : "i"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${item.type === "error" ? "text-red-600" : "text-slate-800"}`}>{item.title}</p>
                        {item.message && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.message}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                      {!item.read && <span className="w-2 h-2 bg-indigo-500 rounded-full shrink-0 mt-1" />}
                    </div>
                  ))}
                </div>

              </div>
            )}
          </div>

          {/* Settings */}
          <div className="relative" ref={settingRef}>
            <button
              type="button"
              className="rounded-full p-2 hover:bg-slate-100 transition"
              onClick={() => {
                setSetting(!setting);
                setNotification(false);
              }}
              aria-label="Settings"
            >
              <CiSettings className="text-2xl" />
            </button>

            {setting && (
              <div className="absolute right-0 top-full z-20 mt-2 w-[calc(100vw-2rem)] max-w-xs rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80 sm:w-56 text-slate-800 overflow-hidden">
                {/* User identity header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-sky-50">
                  <UserInitials user={currentUser} className="w-9 h-9 text-sm" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 truncate max-w-[10rem]">{displayName}</p>
                    {displaySub && <p className="text-xs text-slate-500 truncate max-w-[10rem]">{displaySub}</p>}
                  </div>
                </div>

                {/* Menu Items */}
                <div className="py-1">
                  {settingItems.map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={item.onClick}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors ${item.color}`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Avatar */}
          <div className="hidden lg:flex items-center gap-2 ml-1 pl-3 border-l border-slate-200">
            <UserInitials user={currentUser} className="w-9 h-9 text-sm" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-sm text-slate-900 truncate max-w-[10rem]">{displayName}</span>
              {displaySub && <h3 className="text-xs text-slate-500 truncate max-w-[10rem]">{displaySub}</h3>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
