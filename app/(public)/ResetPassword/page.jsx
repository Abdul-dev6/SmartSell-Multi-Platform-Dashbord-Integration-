"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/public/PasswordInput";

// The form reads ?token= from the emailed link, so it renders on the client
// inside a Suspense boundary; the page frame is prerendered.
function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return (
      <p role="alert" className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        This page needs the link from your reset email.{" "}
        <Link href="/ForgotPassword" className="font-semibold underline">Request a new link</Link>.
      </p>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        router.push("/Login?reset=1");
        return;
      }
      setError(data.message || "Could not reset the password. Please try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <PasswordInput
        id="reset-password"
        label="New password"
        hint="(8–72 characters)"
        autoComplete="new-password"
        showStrength
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordInput
        id="reset-confirm"
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {confirm && password !== confirm && <p className="text-xs text-red-600">Passwords do not match yet.</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Set new password"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}{" "}
          {/expired|invalid/i.test(error) && <Link href="/ForgotPassword" className="font-semibold underline">Request a new link</Link>}
        </p>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-300/50 bg-white shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-slate-900 text-center">Set a new password</h1>
        <p className="mt-3 text-center text-slate-500">Choose a new password for your SmartSell account.</p>
        <Suspense fallback={<p className="mt-8 text-center text-sm text-slate-500">Loading…</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
