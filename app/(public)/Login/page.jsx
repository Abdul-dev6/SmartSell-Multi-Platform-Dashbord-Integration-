"use client";

import React, { Suspense, useState } from "react";
import { motion } from "framer-motion";
import { FaGithub } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { safeNextPath } from "@/lib/auth/nextPath";

// Messages for ?error=… (Google/GitHub sign-in) and ?registered=1.
const NOTICES = {
  google_email_required: "Google did not share an email address. Use another sign-in method.",
  github_email_required: "GitHub did not share an email address. Make your GitHub email visible, or use another sign-in method.",
  google_login_failed: "Google sign-in failed. Please try again.",
  github_login_failed: "GitHub sign-in failed. Please try again.",
};

// Reads ?error= / ?registered= from the URL. Only this part waits for the URL
// (Suspense), so the sign-in form itself is in the server-rendered page.
function LoginNotices() {
  const searchParams = useSearchParams();
  const notice = NOTICES[searchParams.get("error")] || null;
  const registered = searchParams.get("registered") === "1";
  return (
    <>
      {registered && (
        <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Account created. Sign in to continue.
        </p>
      )}
      {notice && (
        <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {notice}
        </p>
      )}
    </>
  );
}

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
        // ?next= is set when the dashboard sent a signed-out visitor here.
        router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
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
      className="relative min-h-screen overflow-hidden bg-slate-100 flex items-center justify-center px-4 py-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 w-full max-w-md rounded-3xl border border-slate-300/50 bg-white shadow-2xl p-8"
      >
        <motion.div
          initial={{ opacity: 0, y: -25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
            Welcome Back
          </h1>

          <p className="mt-3 text-slate-500">
            Sign in to continue to your dashboard.
          </p>
        </motion.div>

        <Suspense fallback={null}>
          <LoginNotices />
        </Suspense>

        {/* Social Login */}

        <div className="flex flex-col sm:flex-row gap-3">
          <motion.button
            type="button"
            onClick={handlegithubLogin}
            whileHover={{ scale: 1.03, y: -3 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-400 bg-white/[0.03] py-3 text-white transition cursor-pointer hover:bg-slate-200/30 hover:border-slate-200"
          >
            <FaGithub className="text-lg text-black" />
            <p className="text-black">Github</p>
          </motion.button>

          <motion.button
            type="button"
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
            <label htmlFor="login-email" className="block text-sm text-slate-600 mb-2">
              Email Address
            </label>

            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }}>
            <label htmlFor="login-password" className="block text-sm text-slate-600 mb-2">
              Password
            </label>

            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />
          </motion.div>
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
            <p role="alert" className="text-sm text-red-600">
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
          <p className="text-sm text-slate-500">
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
