"use client";
import React, { useState, useContext } from "react";
import { FaChartBar, FaRegUser, FaReceipt } from "react-icons/fa";
import { LuLayoutDashboard } from "react-icons/lu";
import { CiCalendar, CiSettings } from "react-icons/ci";
import { FiShoppingBag } from "react-icons/fi";
import { TbBrandGoogleAnalytics } from "react-icons/tb";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import { IoClose } from "react-icons/io5";
import Link from "next/link";
import { UserContext } from "../UseContext";
const Sidebar = () => {
  const Menuitems = [
    {
      Name: "Product",
      Icon: <FiShoppingBag className="text-xl shrink-0" />,
      href: "/Panel/Ecommerce/Product",
    },
    {
      Name: "Listing",
      Icon: <FiShoppingBag className="text-xl shrink-0" />,
      href: "/Panel/Ecommerce/Listing",
    },
    {
      Name: "Integration",
      Icon: <FiShoppingBag className="text-xl shrink-0" />,
      href: "/Panel/Ecommerce/Integration",
    },
    {
      Name: "Inventory",
      Icon: <FiShoppingBag className="text-xl shrink-0" />,
      href: "/Panel/Ecommerce/Inventory",
    },
  ];

  const Analysis = [{ Name: "Reports", href: "/Panel/Analysis/Reports" }];

  const { bar, setbar } = useContext(UserContext);
  const [isEcommerceOpen, setIsEcommerceOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const { setting, setSetting, currentUser } = useContext(UserContext);

  return (
    <div
      className={`${bar ? "-translate-x-full md:translate-x-0 md:w-20 lg:w-16" : "translate-x-0 md:w-64 lg:w-60"} fixed top-0 left-0 z-40 h-screen w-72 bg-slate-950 text-slate-100 flex flex-col overflow-hidden transition-transform duration-300 border-r border-slate-800`}
    >
      {/* Header */}
      <div className="border-b border-slate-800 flex items-center justify-between gap-4 px-4 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="px-2 py-2 rounded-lg bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 shrink-0 text-white shadow-lg shadow-indigo-500/20">
            <FaChartBar className="text-2xl" />
          </div>
          {!bar && (
            <div className="flex flex-col">
              <h1 className="font-bold text-white">Nexus</h1>
              <h3 className="text-sm text-slate-400">Admin Panel</h3>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setbar(true)}
          className="md:hidden rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          aria-label="Close sidebar"
        >
          <IoClose className="text-2xl" />
        </button>
      </div>

      {/* Nav Items */}
  <div className="flex flex-col gap-3 p-3 flex-1 min-h-0 overflow-y-auto">
        <Link href={`/Panel`} className="text-base text-slate-200">
          <div
            className="flex items-center gap-3 cursor-pointer
            hover:bg-slate-800 p-2.5
            rounded-xl text-white transition-all duration-300"
          >
            <LuLayoutDashboard className="text-xl shrink-0" />
            {!bar && <h2>Dashboard</h2>}
          </div>
        </Link>

        {/* E-commerce Dropdown */}
        <div
          onClick={() => setIsEcommerceOpen(!isEcommerceOpen)}
          className="flex items-center justify-between cursor-pointer hover:bg-slate-800 p-2.5 rounded-xl text-white transition-all duration-300"
        >
          <div className="flex items-center gap-3">
            <FiShoppingBag className="text-xl shrink-0" />
            {!bar && <h2>E-commerce</h2>}
          </div>
          {!bar && (
            <span className="mr-2 text-sm">
              {isEcommerceOpen ? <IoIosArrowUp /> : <IoIosArrowDown />}
            </span>
          )}
        </div>

        {isEcommerceOpen && !bar && (
          <div className="flex flex-col gap-1 pl-8 pr-2 text-sm text-slate-200">
            {Menuitems.map((item) => (
              <Link href={item.href} key={item.Name}>
                <div className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-2 rounded-lg text-white transition-all duration-300">
                  {item.Icon}
                  <h2>{item.Name}</h2>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Analysis Dropdown */}
        <div
          onClick={() => setIsAnalysisOpen(!isAnalysisOpen)}
          className="flex items-center justify-between cursor-pointer hover:bg-slate-800 p-2.5 rounded-xl text-white transition-all duration-300"
        >
          <div className="flex items-center gap-3">
            <TbBrandGoogleAnalytics className="text-xl shrink-0" />
            {!bar && <h2>Analysis</h2>}
          </div>
          {!bar && (
            <span className="mr-2 text-sm">
              {isAnalysisOpen ? <IoIosArrowUp /> : <IoIosArrowDown />}
            </span>
          )}
        </div>

        {isAnalysisOpen && !bar && (
          <div className="flex flex-col gap-1 pl-8 pr-2 text-sm text-slate-200">
            {Analysis.map((item) => (
              <Link href={item.href} key={item.Name}>
                <div
                  className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-2 rounded-lg text-white transition-all duration-300"
                >
                  {item.Icon}
                  <h2>{item.Name}</h2>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Static Links */}
        {[
          {
            icon: <FaReceipt className="text-xl shrink-0" />,
            label: "Expenses",
            href: "/Panel/Expenses",
          },
          {
            icon: <FaRegUser className="text-xl shrink-0" />,
            label: "User",
            href: "/Panel/User",
          },

          {
            icon: <CiCalendar className="text-xl shrink-0" />,
            label: "Calendar",
            href: "/Panel/Calendar",
          },
        ].map(({ icon, label, href }) => (
          <Link href={href} key={label}>
            <div
              className="flex items-center gap-3 cursor-pointer
            hover:bg-slate-800 p-2.5
            rounded-xl text-white transition-all duration-300"
            >
              {icon}
              {!bar && <h2>{label}</h2>}
            </div>
          </Link>
        ))}
        
          <div
            onClick={() => setSetting(!setting)}
            className="flex items-center gap-3 cursor-pointer hover:bg-slate-800 p-2.5 rounded-xl text-white transition-all duration-300"
          >
            <CiSettings className="text-xl shrink-0" />
            {!bar && <h2>Settings</h2>}
          </div>
        
      </div>

      {/* User Profile at Bottom */}
      {!bar && (
        <div className="flex gap-4 p-4 items-center border-t border-slate-800 shrink-0">
          <div
            className="w-12 h-12 rounded-full border-2 border-gray-700 bg-cover bg-center shrink-0"
            style={{ backgroundImage: "url('/user.avif')" }}
          ></div>
          <div className="flex flex-col">
            <h1 className="font-semibold text-white truncate max-w-[9rem]">
              {currentUser?.name || currentUser?.email || ""}
            </h1>
            {currentUser?.name && (
              <h3 className="text-slate-400 text-sm truncate max-w-[9rem]">{currentUser.email}</h3>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
