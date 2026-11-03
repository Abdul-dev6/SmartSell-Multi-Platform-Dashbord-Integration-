import Link from "next/link";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";

// Shown for any unknown URL. Rendered by the root layout, so it adds the
// public navigation itself.
export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">404</p>
        <h1 className="text-3xl font-bold text-slate-900">Page not found</h1>
        <p className="max-w-md text-slate-600">
          The page you are looking for does not exist or has moved.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
            Go to the home page
          </Link>
          <Link href="/Panel/Dashboard" className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Open the dashboard
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
