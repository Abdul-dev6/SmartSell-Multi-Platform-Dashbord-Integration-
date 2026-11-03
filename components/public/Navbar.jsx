"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/Pricing", label: "Pricing" },
  { href: "/About", label: "About" },
  { href: "/Contact", label: "Contact" }
];

const Navbarpage = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // navbar picks up a background + shadow only after the page scrolls —
  // stays clean/transparent-ish at the very top
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // auto-close the mobile menu if the viewport grows past the md breakpoint
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 w-full px-5 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm"
          : "bg-white border-b border-transparent"
      }`}
    >
      <div className="flex justify-between items-center h-16">
        {/* Logo */}
        <Link href="/" className="text-2xl font-semibold text-slate-900">
          Nexus
        </Link>

        {/* Desktop nav — animated underline on hover */}
        <ul className="hidden md:flex gap-10">
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href} className="relative group">
              <Link
                href={href}
                className="text-slate-700 hover:text-blue-500 transition-colors"
              >
                {label}
              </Link>
              <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-blue-500 transition-all duration-300 group-hover:w-full" />
            </li>
          ))}
        </ul>

        {/* Desktop buttons */}
        <div className="hidden md:flex gap-3">
          <Link
            href="/Login"
            className="px-4 py-2 rounded-lg text-slate-700 hover:text-blue-500 font-medium transition-colors hover:-translate-y-0.5 hover:shadow-md hover:shadow-blue-200 "
          >
            Login
          </Link>
          <Link
            href="/Signup"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-blue-200"
          >
            Sign Up
          </Link>
        </div>

        {/* Hamburger — bars morph into an X */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
          className="md:hidden relative w-8 h-8 flex flex-col justify-center items-center gap-1.5"
        >
          <span
            className={`block h-0.5 w-6 bg-slate-900 rounded-full transition-all duration-300 ${
              open ? "rotate-45 translate-y-2" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-6 bg-slate-900 rounded-full transition-all duration-300 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`block h-0.5 w-6 bg-slate-900 rounded-full transition-all duration-300 ${
              open ? "-rotate-45 -translate-y-2" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile menu — grid-rows trick animates height without measuring in JS */}
      <div
        className={`md:hidden grid transition-[grid-template-rows] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="flex flex-col gap-1 pb-4">
            {NAV_LINKS.map(({ href, label }, i) => (
              <li
                key={href}
                className={`transition-all duration-300 ${
                  open
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-2"
                }`}
                style={{ transitionDelay: open ? `${i * 60}ms` : "0ms" }}
              >
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="block px-2 py-2.5 text-slate-700 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex gap-3 pb-5 pt-1">
            <Link
              href="/Login"
              onClick={() => setOpen(false)}
              className="flex-1 text-center px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/Signup"
              onClick={() => setOpen(false)}
              className="flex-1 text-center bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg transition-colors"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbarpage;
