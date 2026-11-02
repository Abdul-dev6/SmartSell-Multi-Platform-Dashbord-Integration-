"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
const Signin = () => {
  const handleGoogleLogin = () => {
    signIn("google", {
      callbackUrl: "/api/auth/google",
    });
  };
  const handlegithubLogin = () => {
    signIn("github", {
      callbackUrl: "/api/auth/Github",
    });
  };
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        router.push("/Panel");
        return;
      }
      setError(data.message || "Login failed. Please try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative min-h-screen overflow-hidden  flex items-center justify-center px-4 py-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 w-full max-w-md rounded-3xl border border-slate-300/50 bg-white/5 backdrop-blur-xl shadow-2xl p-8"
      >
        <motion.div
          initial={{ opacity: 0, y: -25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-slate-650">
            Welcome Back
          </h1>

          <p className="mt-3 text-slate-400">
            Sign in to continue to your dashboard.
          </p>
        </motion.div>

        {/* Social Login */}

        <div className="flex flex-col sm:flex-row gap-3">
          <motion.button
            onClick={handlegithubLogin}
            whileHover={{ scale: 1.03, y: -3 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-400 bg-white/[0.03] py-3 text-white transition cursor-pointer hover:bg-slate-200/30 hover:border-slate-200"
          >
            <FaGithub className="text-lg text-black" />
            <p className="text-black">Github</p>
          </motion.button>

          <motion.button
            onClick={handleGoogleLogin}
            whileHover={{ scale: 1.03, y: -3 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-400 bg-white/[0.03] py-3 text-white transition cursor-pointer hover:bg-slate-200/30 hover:border-slate-200"
          >
            <FcGoogle className="text-lg" />
            <p className="text-black">Google</p>
          </motion.button>
        </div>

        {/* Divider */}

        <div className="flex items-center my-7">
          <div className="flex-1 h-px bg-white/10" />

          <span className="px-4 text-slate-500 text-sm">OR</span>

          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Form */}

        <form onSubmit={handleSignIn} className="space-y-5">
          <motion.div whileHover={{ scale: 1.02 }}>
            <label className="block text-sm text-slate-400 mb-2">
              Email Address
            </label>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-white placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 hover:border-slate-400/50"
            />
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }}>
            <label className="block text-sm text-slate-400 mb-2">
              Password
            </label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-white placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 hover:border-slate-400/50"
            />
          </motion.div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-lg border-white/20 bg-white/10"
              />
              Remember me
            </label>

            <a
              href="#"
              className="text-indigo-400 hover:text-indigo-300 transition"
            >
              Forgot Password?
            </a>
          </div>
          <motion.button
            whileHover={{
              scale: 1.03,
              y: -3,
            }}
            whileTap={{
              scale: 0.95,
            }}
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:from-indigo-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing In..." : "Sign In"}
          </motion.button>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 text-center"
        >
          <p className="text-sm text-slate-400">
            Don&apos;t have an account?{" "}
            <Link
              href="/Signup"
              className="font-semibold text-indigo-400 transition hover:text-indigo-300"
            >
              Sign Up
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Signin;
