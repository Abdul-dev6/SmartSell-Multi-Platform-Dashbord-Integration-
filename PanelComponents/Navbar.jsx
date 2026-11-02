import React, { useContext, useEffect, useRef, useState } from "react";
import { IoMoonOutline, IoSunnyOutline } from "react-icons/io5";
import { HiOutlineBellAlert } from "react-icons/hi2";
import { CiSettings } from "react-icons/ci";
import { FaBars } from "react-icons/fa6";
import { FiUser, FiBell, FiHelpCircle, FiLogOut } from "react-icons/fi";
import { UserContext } from "../UseContext";

function Navbar() {
  const [notification, setNotification] = useState(false);
  const { bar, setbar } = useContext(UserContext);
  const { setting, setSetting } = useContext(UserContext);
  const [darkMode, setDarkMode] = useState(false);

  // Separate refs for each dropdown
  const settingRef = useRef(null);
  const notificationRef = useRef(null);
  const darkRef = useRef(null);

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
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [setSetting]);

  const datanotification = [
    {
      src: "/user.avif",
      title: "successful",
      description: "Your payment of $1,299 was received.",
      time: "2m ago",
      unread: true,
    },
    {
      src: "/user.avif",
      title: "successful",
      description: "Order #ORD-002 has been shipped.",
      time: "1h ago",
      unread: true,
    },
    {
      src: "/user.avif",
      title: "cancel",
      description: "Order #ORD-003 was cancelled by the customer.",
      time: "3h ago",
      unread: false,
    },
  ];

  const unreadCount = datanotification.filter((n) => n.unread).length;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Full navigation so no dashboard state survives the logout.
      window.location.assign("/Login");
    }
  };

  const settingItems = [
    { icon: <FiUser size={15} />, label: "Profile", color: "text-slate-600" },
    { icon: <FiBell size={15} />, label: "Notifications", color: "text-slate-600" },
    { icon: <FiHelpCircle size={15} />, label: "Help & Support", color: "text-slate-600" },
    { icon: <FiLogOut size={15} />, label: "Logout", color: "text-red-500", onClick: handleLogout },
  ];

  return (
    <div className="relative border-b border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60 text-slate-800">
      <div className="flex items-center gap-3 md:gap-4 flex-nowrap">

        {/* Left: Hamburger + Title */}
        <div className="flex items-center gap-3 shrink-0">
          <FaBars
            className="text-xl cursor-pointer text-slate-600 hover:text-indigo-600 transition"
            onClick={() => setbar(!bar)}
          />
          <div className="hidden sm:flex flex-col leading-tight">
            <h1 className="font-semibold text-slate-900">Dashboard</h1>
            <h4 className="text-xs text-slate-500">
              Welcome back! Here&apos;s what&apos;s happening today.
            </h4>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative hidden md:block flex-1 max-w-2xl mx-2 lg:mx-4 min-w-0">
          <input
            type="text"
            placeholder="Search anything..."
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
        </div>

        {/* Right: Action Icons */}
        <div className="flex items-center gap-1 sm:gap-2 text-xl text-slate-600 shrink-0 ml-auto">

          {/* Dark Mode Toggle */}
          <button
            ref={darkRef}
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-full p-2 hover:bg-slate-100 transition"
            aria-label="Toggle theme"
          >
            {darkMode ? <IoSunnyOutline /> : <IoMoonOutline />}
          </button>

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
                  <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                    Mark all read
                  </button>
                </div>

                {/* Items */}
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                  {datanotification.map((item, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer ${item.unread ? "bg-indigo-50/50" : ""}`}
                    >
                      <div
                        className="w-9 h-9 rounded-full bg-cover bg-center border-2 border-slate-200 shrink-0"
                        style={{ backgroundImage: `url(${item.src})` }}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs font-semibold ${
                            item.title === "successful"
                              ? "text-emerald-600"
                              : item.title === "cancel"
                              ? "text-red-500"
                              : "text-amber-500"
                          }`}
                        >
                          {item.title === "successful" ? "✓ Success" : item.title === "cancel" ? "✕ Cancelled" : item.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {item.description}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">{item.time}</p>
                      </div>
                      {item.unread && (
                        <span className="w-2 h-2 bg-indigo-500 rounded-full shrink-0 mt-1" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-100">
                  <button className="w-full text-center text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg py-2 transition-all duration-200">
                    Clear all notifications
                  </button>
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
                  <div
                    className="w-9 h-9 rounded-full bg-cover bg-center border-2 border-indigo-200 shrink-0"
                    style={{ backgroundImage: "url('/user.avif')" }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Alex</p>
                    <p className="text-xs text-slate-500">Administrator</p>
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
            <div
              className="w-9 h-9 rounded-full border-2 border-slate-200 bg-cover bg-center"
              style={{ backgroundImage: "url('/user.avif')" }}
            />
            <div className="flex flex-col leading-tight">
              <h1 className="font-semibold text-sm text-slate-900">Alex</h1>
              <h3 className="text-xs text-slate-500">Administrator</h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
