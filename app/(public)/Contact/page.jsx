"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { FaWhatsapp, FaUser, FaPhone } from "react-icons/fa";
import { MdOutlineEmail } from "react-icons/md";

const CONTACT_EMAIL = "abdulqadeera584@gmail.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full rounded-xl border border-gray-300 py-3 pl-12 pr-4 outline-none transition-all focus:border-purple-600 focus:ring-2 focus:ring-purple-300";

// There is no email service on the server, so the form opens the visitor's
// own email app with the message filled in, and says so.
const Contactpage = () => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [errors, setErrors] = useState({});
  const [opened, setOpened] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = "Enter your name.";
    if (!EMAIL_RE.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (form.message.trim().length < 10) next.message = "Write a message of at least 10 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const body = [
      form.message.trim(),
      "",
      `From: ${form.name.trim()} <${form.email.trim()}>`,
      form.phone.trim() ? `Phone: ${form.phone.trim()}` : "",
    ].filter(Boolean).join("\n");
    const subject = `SmartSell enquiry from ${form.name.trim()}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

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
              Have questions? Write your message below. Sending opens your email
              app with the message ready to send.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            {/* Name */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <div className="relative">
                <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  id="contact-name"
                  type="text"
                  autoComplete="name"
                  aria-label="Your name"
                  aria-invalid={errors.name ? true : undefined}
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Your Name"
                  className={inputClass}
                />
              </div>
            </motion.div>

            {/* Email */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <div className="relative">
                <MdOutlineEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />

                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  aria-label="Your email"
                  aria-invalid={errors.email ? true : undefined}
                  value={form.email}
                  onChange={set("email")}
                  placeholder="Your Email"
                  className={inputClass}
                />
              </div>
            </motion.div>

            {/* Phone */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <div className="relative">
                <FaPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />

                <input
                  id="contact-phone"
                  type="tel"
                  autoComplete="tel"
                  aria-label="Your phone number (optional)"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+92 300 0000000 (optional)"
                  className={inputClass}
                />
              </div>
            </motion.div>

            {/* Message */}
            <motion.div whileHover={{ scale: 1.02 }}>
              <textarea
                id="contact-message"
                rows={5}
                aria-label="Your message"
                aria-invalid={errors.message ? true : undefined}
                value={form.message}
                onChange={set("message")}
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

            {Object.keys(errors).length > 0 && (
              <ul role="alert" className="space-y-1 text-sm text-red-700">
                {Object.values(errors).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
            {opened && (
              <p role="status" className="text-sm text-gray-700">
                Your email app should open with the message ready to send. If it
                doesn&apos;t, email us at{" "}
                <span className="select-all font-medium">{CONTACT_EMAIL}</span>.
              </p>
            )}
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Contactpage;
