import React, { useContext, useEffect, useRef, useState } from "react";
import { IoMoonOutline, IoSunnyOutline } from "react-icons/io5";
import { HiOutlineBellAlert } from "react-icons/hi2";
import { CiSettings } from "react-icons/ci";
import { FaBars } from "react-icons/fa6";
import { UserContext } from "../UseContext";
function Navbar() {
  const [notification, setnotification] = useState(false);
  const { bar, setbar } = useContext(UserContext);
  const { setting, setSetting } = useContext(UserContext);
  const [darkMode, setDarkMode] = useState(false);
  const ref = useRef(null);
  const notificationref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setSetting(false);
      }
      if (
        notificationref.current &&
        !notificationref.current.contains(event.target)
      ) {
        setnotification(false);
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
      title: "successfull",
      description: "Your payment has been successfull",
    },
    {
      src: "/user.avif",
      title: "successfull",
      description: "Your payment has been successfull",
    },
  ];
  return (
    <div className="relative border-b border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60 text-slate-800">
      <div className="flex items-center gap-3 md:gap-4 flex-nowrap">
        <div className="flex items-center gap-3 shrink-0">
          <FaBars
            className="text-xl cursor-pointer text-slate-600 hover:text-indigo-600 transition"
            onClick={() => setbar(!bar)}
          />
          <div className="hidden sm:flex flex-col leading-tight">
            <h1 className="font-semibold text-slate-900">
              Dashboard
            </h1>
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

        {/* Icons */}
        <div className="flex items-center gap-2 sm:gap-4 text-2xl text-slate-600 shrink-0 ml-auto">
          <button
            onClick={() => setDarkMode(!darkMode)}
            ref={ref}
            className="rounded-full p-1 hover:bg-slate-100 transition"
            aria-label="Toggle theme"
          >
            {darkMode ? <IoSunnyOutline /> : <IoMoonOutline />}
          </button>

          <button
            type="button"
            onClick={() => setnotification(!notification)}
            className="rounded-full p-1 hover:bg-slate-100 transition"
            ref={notificationref}
            aria-label="Notifications"
          >
            <HiOutlineBellAlert />
          </button>

          <button
            type="button"
            className="rounded-full p-1 hover:bg-slate-100 transition"
            onClick={() => setSetting(!setting)}
            ref={ref}
            aria-label="Settings"
          >
            <CiSettings />
          </button>
          <div className="hidden lg:flex items-center gap-2 ml-2 pl-3 border-l border-slate-200">
            <div
              className="w-10 h-10 rounded-full border-2 border-slate-200 bg-cover items-center bg-center"
              style={{ backgroundImage: "url('/user.avif')" }}
            />
            <div className="flex flex-col leading-tight">
              <h1 className="font-semibold text-sm text-slate-900">
                Alex
              </h1>
              <h3 className="text-xs text-slate-500">
                Administrator
              </h3>
            </div>
          </div>
        </div>
      </div>

      {setting && (
        <div className="absolute right-4 top-full z-20 mt-3 w-[calc(100vw-2rem)] max-w-xs rounded-xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/80 sm:w-64 text-slate-800">
          <div className="flex flex-col justify-start">
            <h2 className="cursor-pointer w-full rounded-lg p-2 hover:bg-slate-100">
              Profile
            </h2>
            <h2 className="cursor-pointer w-full rounded-lg p-2 hover:bg-slate-100">
              Notifications
            </h2>
            <h2 className="cursor-pointer w-full rounded-lg p-2 hover:bg-slate-100">
              Help
            </h2>
            <h2 className="cursor-pointer w-full rounded-lg p-2 hover:bg-slate-100">
              Logout
            </h2>
          </div>
        </div>
      )}
      {notification && (
        <div className="absolute right-4 top-full z-20 mt-3 w-[calc(100vw-2rem)] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-200/80 sm:w-96 md:w-[28rem] text-slate-800">
          {datanotification.map((item, index) => (
            <div key={index} className="p-2 flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-full border-2 border-slate-200 bg-cover bg-center mb-2"
                style={{ backgroundImage: `url(${item.src})` }}
              ></div>
              <div className="flex flex-col  ">
                <h1
                  className={`text-sm font-semibold ${item.title == "successfull" ? "text-green-500" : item.title == "cancel" ? "text-red-500" : "text-yellow-400"}`}
                >
                  {item.title}
                </h1>
                <p className="text-xs text-slate-500">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
          <div>
            <a
              href=""
              className="rounded-lg bg-red-500 px-2 py-2 text-center flex justify-center cursor-pointer text-white hover:bg-red-600 transition-all duration-300"
            >
              Clear All
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default Navbar;
