"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { FaCheckCircle, FaLock, FaShieldAlt } from "react-icons/fa";
import { SiVisa, SiMastercard } from "react-icons/si";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const Paymentform = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const plan = {
    title: searchParams.get("title"),
    price: searchParams.get("price"),
    products: searchParams.get("products"),
    analytics: searchParams.get("analytics"),
    reports: searchParams.get("reports"),
    dashboard: searchParams.get("dashboard"),
    support: searchParams.get("support"),
  };

  const [cardNumber, setCardNumber] = useState("");
  const [date, setDate] = useState("");
  const [cardcvv, setCardCvv] = useState("");

  const handlecardevent = (e) => {
    let value = e.target.value.replace(/\D/g, "");
    value = value.substring(0, 16);
    setCardNumber(value.match(/.{1,4}/g)?.join(" ") || "");
  };

  const expiredate = (e) => {
    let value = e.target.value.replace(/\D/g, "");
    value = value.substring(0, 4);
    setDate(value.match(/.{1,2}/g)?.join("/") || "");
  };

  const handlecardcvv = (e) => {
    let value = e.target.value.replace(/\D/g, "");
    value = value.substring(0, 4);
    setCardCvv(value);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen overflow-hidden bg-slate-950"
    >
      {/* Background */}

      <div className="absolute -top-44 -left-44 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[140px]" />

      <div className="absolute -bottom-44 -right-44 h-[500px] w-[500px] rounded-full bg-emerald-500/20 blur-[140px]" />

      <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
        {/* LEFT */}

        <motion.div
          initial={{ x: -80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="w-full lg:w-1/2 flex justify-center items-center px-6 md:px-10 lg:px-16 py-14 border-b lg:border-b-0 lg:border-r border-white/5"
        >
          <div className="w-full max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 mb-8">
              <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />

              <span className="text-xs uppercase tracking-[3px] text-indigo-300">
                Secure Checkout
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-white">
              Payment Information
            </h1>

            <p className="mt-3 text-slate-400">
              Complete your purchase securely.
            </p>

            <div className="flex gap-3 mt-8 mb-8">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <SiVisa className="text-xl text-white" />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <SiMastercard className="text-xl text-orange-400" />
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 px-4 flex items-center text-blue-400 text-xs font-bold">
                AMEX
              </div>
            </div>

            <div className="space-y-5">
              {/* Card Holder */}

              <motion.div whileHover={{ scale: 1.02 }}>
                <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Cardholder Name
                </label>

                <input
                  type="text"
                  placeholder="John Doe"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-white placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                />
              </motion.div>

              {/* Card Number */}

              <motion.div whileHover={{ scale: 1.02 }}>
                <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Card Number
                </label>

                <input
                  type="text"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onInput={handlecardevent}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-white placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                />
              </motion.div>

              {/* Expiry & CVV */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div whileHover={{ scale: 1.02 }}>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-slate-400">
                    Expiry Date
                  </label>

                  <input
                    type="text"
                    placeholder="MM/YY"
                    value={date}
                    onInput={expiredate}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-white placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  />
                </motion.div>

                <motion.div whileHover={{ scale: 1.02 }}>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-slate-400">
                    CVV
                  </label>

                  <input
                    type="text"
                    placeholder="123"
                    value={cardcvv}
                    onInput={handlecardcvv}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-white placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  />
                </motion.div>
              </div>

              {/* Country */}

              <motion.div whileHover={{ scale: 1.02 }}>
                <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-slate-400">
                  Country
                </label>

                <input
                  list="countries"
                  placeholder="Select Country"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-white placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                />

                <datalist id="countries">
                  <option value="Pakistan" />
                  <option value="India" />
                  <option value="United States" />
                  <option value="United Kingdom" />
                  <option value="Canada" />
                  <option value="Australia" />
                  <option value="Germany" />
                  <option value="France" />
                  <option value="Japan" />
                  <option value="China" />
                  <option value="Saudi Arabia" />
                  <option value="United Arab Emirates" />
                </datalist>
              </motion.div>

              {/* Button */}

              <motion.button
                whileHover={{
                  scale: 1.03,
                  y: -3,
                }}
                whileTap={{
                  scale: 0.96,
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-4 font-semibold text-white shadow-lg shadow-indigo-500/20 transition"
              >
                <FaLock />
                Pay Now
              </motion.button>

              {/* Security */}

              <div className="flex items-center justify-center gap-2 pt-2">
                <FaShieldAlt className="text-emerald-400" />

                <p className="text-center text-xs text-slate-500">
                  Protected with 256-bit SSL Encryption
                </p>
              </div>
            </div>
          </div>
        </motion.div>
        {/* RIGHT SIDE */}

        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="w-full lg:w-1/2 flex justify-center items-center px-6 md:px-10 lg:px-16 py-14"
        >
          <motion.div
            whileHover={{
              y: -8,
              transition: { duration: 0.3 },
            }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl p-8 shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-white text-center">
              Subscription Summary
            </h2>

            {/* Plan */}

            <div className="mt-8 flex items-center justify-between border-b border-white/10 pb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  Plan
                </p>

                <h3 className="mt-2 text-xl font-semibold text-white">
                  {plan.title || "Basic"}
                </h3>
              </div>

              <div className="text-right">
                <h2 className="text-3xl font-bold text-indigo-400">
                  {plan.price || "$5"}
                </h2>

                <p className="text-sm text-slate-500">/month</p>
              </div>
            </div>

            {/* Features */}

            <div className="mt-8">
              <p className="mb-5 text-xs uppercase tracking-widest text-slate-500">
                Included Features
              </p>

              <div className="space-y-4">
                {[
                  plan.products,
                  plan.analytics,
                  plan.reports,
                  plan.dashboard,
                  plan.support,
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    whileHover={{ x: 5 }}
                    className="flex items-center gap-3"
                  >
                    <FaCheckCircle className="text-emerald-400 flex-shrink-0" />

                    <span className="text-slate-300 text-sm">{item}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Total */}

            <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
              <span className="text-sm uppercase tracking-widest text-slate-500">
                Total Today
              </span>

              <motion.span
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{
                  repeat: Infinity,
                  repeatType: "reverse",
                  duration: 1.5,
                }}
                className="text-3xl font-bold text-white"
              >
                {plan.price || "$5"}
              </motion.span>
            </div>

            {/* Guarantee */}

            <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <div className="flex gap-3">
                <FaShieldAlt className="mt-1 text-emerald-400" />

                <div>
                  <h3 className="font-semibold text-emerald-300">
                    30-Day Money Back Guarantee
                  </h3>

                  <p className="mt-1 text-sm text-emerald-200/80">
                    Try Nexus risk-free. If you&apos;re not satisfied, we&apos;ll refund
                    your payment within 30 days.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default function PaymentFormPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Paymentform />
    </Suspense>
  );
}