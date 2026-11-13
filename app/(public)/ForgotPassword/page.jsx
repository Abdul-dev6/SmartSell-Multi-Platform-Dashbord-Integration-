"use client";

import { useState } from "react";
import Link from "next/link";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30";

// Asks for the account email and sends a one-time reset link.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      setResult({ ok: response.ok, text: data.message || (response.ok ? "Check your email." : "Something went wrong. Please try again.") });
    } catch {
      setResult({ ok: false, text: "Could not reach the server. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-300/50 bg-white shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-slate-900 text-center">Forgot password?</h1>
        <p className="mt-3 text-center text-slate-500">Enter your account email and we&apos;ll send you a link to reset it.</p>

        {result?.ok ? (
          <p role="status" className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {result.text}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="forgot-email" className="block text-sm text-slate-600 mb-2">Email Address</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
            {result && !result.ok && (
              <p role="alert" className="text-sm text-red-600">{result.text}</p>
            )}
          </form>
        )}

        <p className="mt-8 text-center text-sm text-slate-500">
          Remembered it?{" "}
          <Link href="/Login" className="font-semibold text-indigo-500 hover:text-indigo-400">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
