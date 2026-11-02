"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  FaWhatsapp,
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaUser,
  FaPhone,
} from "react-icons/fa";
import { MdOutlineEmail } from "react-icons/md";

const Contactpage = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen bg-gradient-to-br from-purple-100 via-blue-100 to-pink-100 flex items-center justify-center px-4 py-10"
    >
      <div className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col lg:flex-row">
        {/* Left Section */}
        <motion.div
          initial={{ x: -80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="w-full lg:w-2/5 bg-gradient-to-br from-purple-600 to-blue-600 text-white p-8 md:p-10 flex flex-col justify-between"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Contact Us</h1>

            <p className="mt-4 text-purple-100 leading-7">
              We&apos;re here to help you grow your business. Feel free to contact us
              anytime. We&apos;ll get back to you as soon as possible.
            </p>
          </div>

          <div className="space-y-6 my-10">
            <a
              href="https://wa.me/923368348348"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 hover:translate-x-2 transition duration-300"
            >
              <FaWhatsapp className="text-3xl text-green-300" />
              <span className="text-lg">+92 336 834 8348</span>
            </a>

            <a
              href="mailto:abdulqadeera584@gmail.com"
              className="flex items-center gap-4 hover:translate-x-2 transition duration-300"
            >
              <MdOutlineEmail className="text-3xl" />
              <span className="break-all">abdulqadeera584@gmail.com</span>
            </a>
          </div>

          <div className="flex justify-center lg:justify-start gap-5">
            {[
              {
                icon: FaFacebook,
                link: "#",
              },
              {
                icon: FaInstagram,
                link: "#",
              },
              {
                icon: FaLinkedin,
                link: "#",
              },
            ].map((item, index) => {
              const Icon = item.icon;

              return (
                <motion.a
                  key={index}
                  href={item.link}
                  whileHover={{
                    scale: 1.2,
                    rotate: 10,
                    y: -5,
                  }}
                  whileTap={{ scale: 0.9 }}
                  className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center cursor-pointer"
                >
                  <Icon className="text-xl text-white" />
                </motion.a>
              );
            })}
          </div>
        </motion.div>

        {/* Right Section */}
        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="w-full lg:w-3/5 p-6 md:p-10"
        >
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800">Get in Touch</h2>

            <p className="text-gray-600 mt-2">
              Have questions? Send us a message and we&apos;ll reply shortly.
            </p>
          </div>

          <form className="space-y-6">
            {/* Name */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <div className="relative">
                <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  type="text"
                  placeholder="Your Name"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-12 pr-4 outline-none transition-all focus:border-purple-600 focus:ring-2 focus:ring-purple-300"
                />
              </div>
            </motion.div>

            {/* Email */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <div className="relative">
                <MdOutlineEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />

                <input
                  type="email"
                  placeholder="Your Email"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-12 pr-4 outline-none transition-all focus:border-purple-600 focus:ring-2 focus:ring-purple-300"
                />
              </div>
            </motion.div>

            {/* Phone */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <div className="relative">
                <FaPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  type="tel"
                  placeholder="+92 300 0000000"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-12 pr-4 outline-none transition-all focus:border-purple-600 focus:ring-2 focus:ring-purple-300"
                />
              </div>
            </motion.div>

            {/* Message */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <textarea
                rows={5}
                placeholder="Your Message..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none resize-none transition-all focus:border-purple-600 focus:ring-2 focus:ring-purple-300"
              ></textarea>
            </motion.div>

            {/* Button */}
            <motion.button
              type="submit"
              whileHover={{
                scale: 1.03,
              }}
              whileTap={{ scale: 0.95 }}
              className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 py-3 text-lg font-semibold text-white shadow-lg transition"
            >
              Send Message
            </motion.button>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Contactpage;
