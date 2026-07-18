"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
function useReveal(threshold = 0.2) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(node);
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, visible];
}

/* ----------------------------------------------------------------
   Data
------------------------------------------------------------------- */
const MARKETPLACES = [
  "Amazon",
  "Walmart",
  "eBay",
  "Shopify",
  "Etsy",
  "TikTok Shop",
];

const FEATURES = [
  {
    title: "Unified Inventory Sync",
    desc: "Stock updates on one channel push everywhere instantly, so you never oversell a product that's already gone.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3 7.5L12 3l9 4.5M3 7.5v9L12 21m-9-4.5L12 21m0-13.5v13.5m0-13.5L21 7.5m0 0v9L12 21"
      />
    ),
  },
  {
    title: "Centralized Order Queue",
    desc: "Every order from every marketplace lands in a single fulfillment queue — no more tab-switching to ship.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3.75 9h16.5M3.75 9a2.25 2.25 0 0 1 2.25-2.25h12A2.25 2.25 0 0 1 20.25 9m-16.5 0v8.25A2.25 2.25 0 0 0 6 19.5h12a2.25 2.25 0 0 0 2.25-2.25V9M8.25 12.75h4.5"
      />
    ),
  },
  {
    title: "Cross-Channel Analytics",
    desc: "See revenue, best-sellers, and channel performance side by side, so you know where to double down.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3 3v18h18M7 15l3.5-4 3 3L18 8"
      />
    ),
  },
  {
    title: "Bulk Listing Push",
    desc: "Create a listing once and publish it to every connected marketplace, formatted to each channel's rules.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M12 4.5v15m0-15L6.75 9.75M12 4.5l5.25 5.25M4.5 19.5h15"
      />
    ),
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your stores",
    desc: "Link Amazon, Walmart, eBay, Shopify, and Etsy in a few clicks with secure OAuth.",
  },
  {
    n: "02",
    title: "Sync automatically",
    desc: "Inventory, orders, and pricing stay in lockstep across every channel in real time.",
  },
  {
    n: "03",
    title: "Grow with clarity",
    desc: "One dashboard shows what's selling, where — so your next move is obvious.",
  },
];

/* ----------------------------------------------------------------
   HomePage
------------------------------------------------------------------- */
const HomePage = () => {
  const [marketRef, marketVisible] = useReveal();
  const [featRef, featVisible] = useReveal(0.1);
  const [stepRef, stepVisible] = useReveal(0.1);
  const [ctaRef, ctaVisible] = useReveal(0.3);

  return (
    <>
      {/* ============ HERO — unchanged ============ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 flex flex-col items-center justify-center text-white w-full py-[5.5%] px-6 text-center ">
        <div className="absolute top-[-10%] left-[-5%] w-96 h-96 bg-blue-500 rounded-full opacity-20 blur-3xl animate-pulse" />
        <div
          className="absolute bottom-[-10%] right-[-5%] w-[30rem] h-[30rem] bg-indigo-400 rounded-full opacity-20 blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-64 h-64 bg-cyan-400 rounded-full opacity-10 blur-2xl animate-pulse"
          style={{ animationDelay: "2s" }}
        />

        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <h1 className="relative z-10 text-5xl md:text-7xl font-black leading-tight tracking-tight max-w-4xl">
          <span className="block text-white">Powerful Analytics</span>
          <span className="block bg-gradient-to-r from-cyan-300 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
            for E-Commerce Growth
          </span>
        </h1>

        <p className="relative z-10 mt-6 text-lg md:text-xl text-blue-200/80 max-w-2xl leading-relaxed">
          Track sales, monitor customer behavior, and optimize revenue —{" "}
          <span className="text-white font-medium">
            all in one intelligent dashboard.
          </span>
        </p>

        <div className="relative z-10 mt-2 flex flex-col sm:flex-row gap-4 items-center">
          <Link href="/Pricing">
            <button className="mt-4 px-3 py-3 bg-white text-black text-xl font-medium cursor-pointer hover:bg-slate-950 hover:text-white hover:-translate-y-0.5 transition rounded-xl">
              Get Started
            </button>
          </Link>
        </div>

        <div className="relative z-10 mt-16 flex flex-col sm:flex-row gap-8 sm:gap-16 items-center text-center">
          {[
            { value: "10K+", label: "Active Stores" },
            { value: "$2.4B", label: "Revenue Tracked" },
            { value: "99.9%", label: "Uptime SLA" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center">
              <span className="text-3xl font-black text-white">{value}</span>
              <span className="text-sm text-blue-300 mt-1 tracking-wide uppercase">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ============ MARKETPLACE STRIP (marquee, signature-adjacent) ============ */}
      <div
        ref={marketRef}
        className={`bg-slate-950 py-7 overflow-hidden border-b border-white/5 transition-opacity duration-700 ${
          marketVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="text-center text-xs tracking-[0.2em] uppercase text-slate-500 mb-5">
          Syncs with the marketplaces you already sell on
        </p>

        <div className="group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          {/* two identical tracks placed back to back = seamless loop */}
          <div className="flex shrink-0 items-center animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none">
            {[...MARKETPLACES, ...MARKETPLACES].map((m, i) => (
              <div key={i} className="flex items-center shrink-0">
                <span className="px-7 text-lg sm:text-xl font-bold text-slate-400 hover:text-white hover:scale-110 transition-all duration-300 whitespace-nowrap cursor-default">
                  {m}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
              </div>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="flex shrink-0 items-center animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none"
          >
            {[...MARKETPLACES, ...MARKETPLACES].map((m, i) => (
              <div key={i} className="flex items-center shrink-0">
                <span className="px-7 text-lg sm:text-xl font-bold text-slate-400 hover:text-white hover:scale-110 transition-all duration-300 whitespace-nowrap cursor-default">
                  {m}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ FEATURES ============ */}
      <section className="bg-white px-6 py-24">
        <div
          ref={featRef}
          className={`max-w-6xl mx-auto text-center transition-all duration-700 ${
            featVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-indigo-600">
            Why sellers switch
          </span>
          <h2 className="mt-3 text-3xl md:text-5xl font-black text-slate-900">
            One dashboard. Every channel.
          </h2>
          <p className="mt-4 text-base md:text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Track sales, monitor customer behavior, and optimize revenue — all
            in one intelligent dashboard.
          </p>
        </div>

        <div className="max-w-6xl mx-auto mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(({ title, desc, icon }, i) => (
            <div
              key={title}
              className={`group relative rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all duration-500 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-indigo-100 hover:border-indigo-200 ${
                featVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: featVisible ? `${i * 100}ms` : "0ms" }}
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  {icon}
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="bg-slate-50 px-6 py-24">
        <div
          ref={stepRef}
          className={`max-w-6xl mx-auto transition-all duration-700 ${
            stepVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <div className="text-center">
            <span className="text-xs font-semibold tracking-[0.2em] uppercase text-indigo-600">
              Getting started
            </span>
            <h2 className="mt-3 text-3xl md:text-5xl font-black text-slate-900">
              Live in three steps
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 relative">
            <div
              className="hidden md:block absolute top-6 left-[16.6%] right-[16.6%] h-px bg-gradient-to-r from-indigo-200 via-indigo-300 to-indigo-200"
              aria-hidden="true"
            />
            {STEPS.map(({ n, title, desc }, i) => (
              <div
                key={n}
                className={`relative text-center md:text-left transition-all duration-500 ${
                  stepVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{
                  transitionDelay: stepVisible ? `${i * 150}ms` : "0ms",
                }}
              >
                <div className="relative z-10 mx-auto md:mx-0 w-12 h-12 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-lg shadow-indigo-200">
                  {n}
                </div>
                <h3 className="mt-5 text-xl font-bold text-slate-900">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-xs mx-auto md:mx-0">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA BAND ============ */}
      <section
        ref={ctaRef}
        className={`relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 px-6 py-20 text-center transition-all duration-700 ${
          ctaVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div className="absolute -top-24 right-1/4 w-72 h-72 bg-cyan-400 rounded-full opacity-10 blur-3xl" />
        <h2 className="relative z-10 text-3xl md:text-4xl font-semibold text-white max-w-xl mx-auto">
          Stop juggling tabs. Start selling everywhere from one place.
        </h2>
        <p className="relative z-10 mt-3 text-blue-200/80 max-w-md mx-auto">
          Connect your first marketplace in under five minutes.
        </p>
        <Link href="/Signup">
          <button className="relative z-10 mt-8 px-6 py-3 bg-white text-black text-lg font-medium rounded-xl hover:bg-slate-950 hover:text-white hover:-translate-y-0.5 transition">
            Get Started
          </button>
        </Link>
      </section>
    </>
  );
};

export default HomePage;
