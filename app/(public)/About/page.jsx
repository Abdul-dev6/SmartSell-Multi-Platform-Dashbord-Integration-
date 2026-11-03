"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import Link from "next/link";
const fadeLeft = {
  hidden: { opacity: 0, x: -80 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.8 },
  },
};

const fadeRight = {
  hidden: { opacity: 0, x: 80 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.8 },
  },
};

function AboutUs() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-[#003878] py-16 px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-7xl mx-auto"
        >
          <h1 className="text-white text-3xl md:text-5xl font-bold leading-tight">
            One Dashboard. Every Marketplace.
            <br />
            Unlimited Growth.
          </h1>

          <p className="text-blue-100 mt-6 max-w-3xl text-lg leading-8">
            Manage every sales channel from one powerful platform designed for
            modern e-commerce businesses.
          </p>
        </motion.div>
      </section>

      {/* Section 1 */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 xl:gap-20">
          {/* Text */}
          <motion.div
            variants={fadeLeft}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="w-full lg:w-[55%]"
          >
            <h2 className="text-4xl font-bold mb-8 text-gray-900">
              About Nexus
            </h2>

            <p className="text-gray-600 leading-8">
              Our platform was founded by e-commerce sellers who experienced
              firsthand the frustration of managing multiple stores across
              different marketplaces with no central system to tie everything
              together.
              <br />
              <br />
              What began as a simple idea grew into a complete multi-channel
              management platform that centralizes products, inventory, orders,
              and analytics so sellers can focus on growing their business
              instead of switching between dashboards.
            </p>
          </motion.div>

          {/* Image */}
          <motion.div
            variants={fadeRight}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            whileHover={{ scale: 1.03 }}
            className="w-full lg:w-[40%] flex justify-center"
          >
            <Image
              src="/online.jpg"
              alt="About Nexus"
              width={500}
              height={400}
              className="rounded-3xl shadow-xl w-full max-w-md object-cover"
            />
          </motion.div>
        </div>
      </section>

      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col-reverse lg:flex-row items-center justify-between gap-12 xl:gap-20">
            {/* Image */}
            <motion.div
              variants={fadeLeft}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              whileHover={{ scale: 1.03 }}
              className="w-full lg:w-[40%] flex justify-center"
            >
              <Image
                src="/about2.jpg"
                alt="Multi Channel"
                width={500}
                height={400}
                className="rounded-3xl shadow-xl w-full max-w-md object-cover"
              />
            </motion.div>

            {/* Text */}
            <motion.div
              variants={fadeRight}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="w-full lg:w-[55%]"
            >
              <h2 className="text-4xl font-bold mb-8 text-gray-900">
                Built for Modern E-Commerce
              </h2>

              <p className="text-gray-600 leading-8">
                Today&apos;s sellers operate across Amazon, Shopify, Walmart, eBay,
                TikTok Shop, and many other marketplaces.
                <br />
                <br />
                Managing multiple platforms requires more than spreadsheets and
                separate dashboards. Nexus provides one centralized workspace
                for inventory, listings, orders, shipping, and analytics.
                <br />
                <br />
                Whether you&apos;re expanding internationally or managing multiple
                brands, Nexus helps you scale confidently with real-time
                insights and automation.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#003878] py-20 px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="max-w-5xl mx-auto text-center"
        >
          <h2 className="text-4xl font-bold text-white">
            Expand Effortlessly Across Every Marketplace
          </h2>

          <p className="text-blue-100 mt-5 text-lg">
            Start managing all your stores from one powerful dashboard.
          </p>
          <Link
            href="/Signup"
            className="inline-block mt-10 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-semibold shadow-lg transition hover:scale-105"
          >
            Start Your 10-Day Free Trial
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
export default AboutUs;
