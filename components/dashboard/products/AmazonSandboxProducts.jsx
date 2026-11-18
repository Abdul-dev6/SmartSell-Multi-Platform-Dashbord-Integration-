"use client";

import { useState } from "react";
import Link from "next/link";
import { apiErrorText } from "@/components/dashboard/shared/apiError";

// Products page panel for Amazon SANDBOX sample listings. Shown only when the
// server includes Amazon Sandbox data (dev / AMAZON_SANDBOX_VIEWER=true).
// "Import" calls Amazon's static sandbox and adds its sample listing to the
// table as a read-only, clearly labelled sample row.
export default function AmazonSandboxProducts({ sandbox, onImported }) {
  const [state, setState] = useState({ busy: false, error: null, done: null });
  if (!sandbox) return null;

  async function importSample() {
    setState({ busy: true, error: null, done: null });
    try {
      const response = await fetch("/api/amazon/sandbox/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: sandbox.accountIds[0] }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(apiErrorText(response, json, `Import failed (${response.status})`));
      setState({ busy: false, error: null, done: json.product?.title || "Sample listing" });
      await onImported?.();
    } catch (err) {
      setState({ busy: false, error: err.message || "Import failed", done: null });
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>Amazon Sandbox:</strong>{" "}
          {sandbox.connected
            ? `${sandbox.listings} sample listing${sandbox.listings === 1 ? "" : "s"} shown below. Sandbox rows are Amazon's mock data, read-only, and not real products.`
            : "Connect the Sandbox account to import Amazon's sample listing."}
        </p>
        {sandbox.connected ? (
          <button
            type="button"
            onClick={importSample}
            disabled={state.busy}
            className="self-start whitespace-nowrap rounded-full bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-60 sm:self-auto"
          >
            {state.busy ? "Importing…" : sandbox.listings ? "Refresh Sandbox sample" : "Import Sandbox sample listing"}
          </button>
        ) : (
          <Link href="/Panel/Ecommerce/AmazonSandbox" className="self-start whitespace-nowrap font-semibold underline sm:self-auto">
            Open Amazon Sandbox viewer
          </Link>
        )}
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-red-800">
          {state.error}
        </p>
      )}
      {state.done && (
        <p role="status" className="mt-2">
          Imported “{state.done}” from Amazon Sandbox.
        </p>
      )}
    </section>
  );
}
