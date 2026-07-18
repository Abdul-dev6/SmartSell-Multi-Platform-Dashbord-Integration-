"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { FaCheckCircle } from "react-icons/fa";

const Card = ({
  title,
  description,
  price,
  month,
  billed,
  products,
  analytics,
  reports,
  dashboard,
  support,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      whileHover={{
        y: -10,
        scale: 1.02,
      }}
      className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden"
    >
      <div className="p-7 flex flex-col h-full">
        {/* Header */}

        <div>
          <h3 className="text-2xl font-bold text-gray-800">{title}</h3>

          <p className="mt-3 text-gray-600 leading-7">{description}</p>
        </div>

        {/* Price */}

        <div className="mt-8">
          <div className="flex items-end gap-2">
            <h1 className="text-3xl font-semibold text-slate-800">{price}</h1>

            <span className="text-gray-500 mb-2">{month}</span>
          </div>

          <p className="mt-2 text-sm text-gray-500">{billed}</p>
        </div>

        {/* Features */}

        <div className="mt-10 flex-1">
          <h2 className="font-semibold text-lg mb-5">What's Included</h2>

          <ul className="space-y-4">
            {[products, analytics, reports, dashboard, support].map(
              (item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 text-gray-700"
                >
                  <FaCheckCircle className="text-green-500 mt-1 flex-shrink-0" />

                  <span>{item}</span>
                </li>
              ),
            )}
          </ul>
        </div>

        {/* Button */}

        <Link
          href={`/PaymentForm?title=${encodeURIComponent(title)}&price=${encodeURIComponent(price)}&products=${encodeURIComponent(products)}&analytics=${encodeURIComponent(analytics)}&reports=${encodeURIComponent(reports)}&dashboard=${encodeURIComponent(dashboard)}&support=${encodeURIComponent(support)}`}
        >
          <motion.button
            whileHover={{
              scale: 1.03,
            }}
            whileTap={{
              scale: 0.95,
            }}
            className="mt-10 w-full rounded-xl bg-gradient-to-r from-indigo-600 via-blue-500 to-emerald-500 py-4 font-semibold text-white shadow-lg transition"
          >
            Buy Now
          </motion.button>
        </Link>
      </div>
    </motion.div>
  );
};

export default Card;
