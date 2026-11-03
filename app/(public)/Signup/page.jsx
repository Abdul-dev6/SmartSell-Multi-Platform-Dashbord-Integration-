"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { FaGithub, FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
const Signup = () => {
  const Router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignup = () => {
    signIn("google", {
      callbackUrl: "/api/auth/google",
    });
  };
  const handleGithubSignup = () => {
    signIn("github", {
      callbackUrl: "/api/auth/Github",
    });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Router.push("/Login?registered=1");
        return;
      }
      setError(data.message || "Sign-up failed. Please try again.");
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
      {/* Signup Card */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 w-full max-w-md rounded-3xl border border-slate-300/50 bg-white backdrop-blur-xl shadow-2xl p-8"
      >
        {/* Heading */}

        <motion.div
          initial={{ opacity: 0, y: -25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-black">
            Create Account
          </h1>

          <p className="mt-3 text-slate-400">
            Join Nexus and start growing your business.
          </p>
        </motion.div>

        {/* Social Login */}

        <div className="flex flex-col sm:flex-row gap-3">
          <motion.button
            type="button"
            onClick={handleGithubSignup}
            whileHover={{ scale: 1.03, y: -3 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-400 bg-white/[0.03] py-3 text-white transition cursor-pointer hover:bg-slate-200/30 hover:border-slate-200"
          >
            <FaGithub className="text-lg text-black" />
            <p className="text-black">Github</p>
          </motion.button>

          <motion.button
            type="button"
            onClick={handleGoogleSignup}
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
          <div className="flex-1 h-px bg-white/10"></div>

          <span className="px-4 text-slate-500 text-sm">OR</span>

          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        {/* Form */}

        <form onSubmit={handleSignup} className="space-y-5">
          {/* Email */}

          <motion.div whileHover={{ scale: 1.02 }}>
            <label htmlFor="signup-email" className="block text-sm text-slate-600 mb-2">
              Email Address
            </label>

            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className=" w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-slate-900 placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 hover:border-slate-400/50"
            />
          </motion.div>
          {/* Password */}

          <motion.div whileHover={{ scale: 1.02 }}>
            <label htmlFor="signup-password" className="block text-sm text-slate-600 mb-2">
              Password <span className="text-slate-400">(at least 8 characters)</span>
            </label>

            <div className="relative">
              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-slate-900 placeholder:text-slate-600 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 hover:border-slate-400/50"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </motion.div>

          {/* Confirm Password */}

          <motion.div whileHover={{ scale: 1.02 }}>
            <label htmlFor="signup-confirm" className="block text-sm text-slate-600 mb-2">
              Confirm Password
            </label>

            <div className="relative">
              <input
                id="signup-confirm"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full  rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5  placeholder:text-slate-600 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 hover:border-slate-400/50"
              />

              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </motion.div>

          {/* Submit Button */}

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
            {submitting ? "Creating account..." : "Create Account"}
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
          <p className="text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              href="/Login"
              className="font-semibold text-indigo-400 hover:text-indigo-300 transition"
            >
              Sign In
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Signup;
