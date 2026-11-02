"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GoPlus } from "react-icons/go";
import Card from "./StructurePricingCard";
import Link from "next/link";
export default function Pricing() {
  const [openIndex, setOpenIndex] = useState(null);

  const handleToggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const carddata = [
    {
      title: "Platinum",
      description: "Perfect for growing businesses getting started.",
      price: "$5",
      month: "/month",
      billed: "Billed yearly (USD)",
      products: "Add up to 100 products",
      analytics: "Basic sales & revenue analytics",
      reports: "Monthly performance reports",
      dashboard: "Customer insights dashboard",
      support: "Email support",
    },
    {
      title: "Diamond",
      description: "Advanced tools for scaling brands.",
      price: "$8",
      month: "/month",
      billed: "Billed yearly (USD)",
      products: "Add up to 150 products",
      analytics: "Advanced sales analytics",
      reports: "Weekly performance reports",
      dashboard: "Profit & revenue insights",
      support: "Priority support",
    },
    {
      title: "Enterprise",
      description: "Best for large businesses and agencies.",
      price: "$15",
      month: "/month",
      billed: "Billed yearly (USD)",
      products: "Unlimited products",
      analytics: "Predictive analytics",
      reports: "Custom reports",
      dashboard: "Advanced dashboard",
      support: "24/7 Dedicated support",
    },
  ];

  const Frequentlydata = [
    {
      title: "How do I create an account?",
      description:
        "Click Sign Up, enter your business information, verify your email and you're ready to connect your marketplaces.",
    },
    {
      title: "Which plan is right for me?",
      description:
        "Choose Platinum if you're just starting, Diamond for growing brands, and Enterprise for high-volume sellers.",
    },
    {
      title: "Can I change my plan later?",
      description:
        "Yes. Upgrade or downgrade your subscription anytime from your dashboard.",
    },
    {
      title: "What payment methods do you accept?",
      description:
        "We accept Visa, Mastercard, American Express, Stripe, and PayPal.",
    },
    {
      title: "Which marketplaces can I connect?",
      description:
        "Amazon, Walmart, Shopify, eBay, Etsy, WooCommerce and many more.",
    },
    {
      title: "Can I publish products everywhere?",
      description:
        "Yes. Create one listing and publish it across multiple marketplaces.",
    },
    {
      title: "How does profit tracking work?",
      description:
        "Our analytics automatically calculate fees, costs and profit margins in real time.",
    },
    {
      title: "Is my data secure?",
      description:
        "Yes. Your data is encrypted and protected using industry-standard security.",
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero */}

      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="max-w-7xl mx-auto px-6 pt-16"
      >
        <h1 className="text-center text-3xl md:text-4xl font-bold text-gray-800">
          Nexus Plans & Pricing
        </h1>

        <p className="max-w-3xl mx-auto text-center mt-6 text-lg text-gray-600 leading-8">
          Plans crafted to boost your profits, streamline operations, and
          maximize performance across every marketplace.
        </p>

        <p className="text-center mt-12 text-indigo-600 font-semibold">
          Trusted by leading e-commerce brands worldwide
        </p>
      </motion.section>

      {/* Pricing Cards */}

      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 place-items-center">
          {carddata.map((item, index) => (
            <Card
              key={index}
              title={item.title}
              description={item.description}
              price={item.price}
              month={item.month}
              billed={item.billed}
              products={item.products}
              analytics={item.analytics}
              reports={item.reports}
              dashboard={item.dashboard}
              support={item.support}
            />
          ))}
        </div>
      </section>

      {/* Statistics */}

      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="bg-slate-100 py-20"
      >
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-800">
            Trusted by Sellers Worldwide
          </h2>

          <p className="text-center mt-5 text-gray-600">
            Helping businesses grow across every marketplace.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mt-14 text-center">
            <div>
              <h1 className="text-5xl font-bold text-slate-800">$5B+</h1>
              <p className="mt-3 text-gray-600">Monthly Amazon GMV</p>
            </div>

            <div>
              <h1 className="text-5xl font-bold text-slate-800">4.5M+</h1>
              <p className="mt-3 text-gray-600">Active Users</p>
            </div>

            <div>
              <h1 className="text-5xl font-bold text-slate-800">24/7</h1>
              <p className="mt-3 text-gray-600">Customer Support</p>
            </div>
          </div>
        </div>
      </motion.section>
      {/* FAQ Section */}
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="max-w-5xl mx-auto px-6 py-20"
      >
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-800">
          Frequently Asked Questions
        </h2>

        <p className="text-center text-gray-600 mt-4 max-w-2xl mx-auto">
          Everything you need to know about Nexus pricing and features.
        </p>

        <div className="mt-14 space-y-5">
          {Frequentlydata.map((item, index) => (
            <motion.div
              key={index}
              layout
              className="rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              {/* Question */}
              <button
                onClick={() => handleToggle(index)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span
                  className={`text-lg font-medium transition-colors ${
                    openIndex === index ? "text-indigo-600" : "text-gray-800"
                  }`}
                >
                  {item.title}
                </span>

                <motion.span
                  animate={{
                    rotate: openIndex === index ? 45 : 0,
                  }}
                  transition={{ duration: 0.25 }}
                  className="text-2xl text-indigo-600"
                >
                  <GoPlus />
                </motion.span>
              </button>

              {/* Answer */}
              <AnimatePresence initial={false}>
                {openIndex === index && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{
                      height: "auto",
                      opacity: 1,
                    }}
                    exit={{
                      height: 0,
                      opacity: 0,
                    }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-gray-600 leading-7">
                      {item.description}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 py-20"
      >
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold text-white">
            Ready to Grow Your Business?
          </h2>

          <p className="mt-5 text-blue-100 text-lg">
            Start your free trial today and manage all your marketplaces from
            one powerful dashboard.
          </p>

          <Link
            href="/Signup"
            className="inline-block mt-10 rounded-xl bg-white px-10 py-4 font-semibold text-indigo-600 shadow-lg transition hover:scale-105"
          >
            Start Free Trial
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
