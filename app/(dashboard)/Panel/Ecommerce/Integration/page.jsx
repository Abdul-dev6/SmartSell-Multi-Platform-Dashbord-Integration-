"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import IntegrationCard from "@/components/dashboard/integrations/IntegrationCard";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES = {
  invalid_shop: "Enter a valid store domain, e.g. your-store.myshopify.com.",
  shopify_not_configured: "Shopify is not configured on the server. Contact support.",
  store_owned_by_another_account:
    "This Shopify store is already linked to another SmartSell account.",
  invalid_callback: "Shopify returned an incomplete response. Please try again.",
  invalid_signature: "Shopify's response could not be verified. Please try again.",
  invalid_state: "The connection request expired or was not started here. Please try again.",
  session_mismatch: "You were signed out during the connection. Sign in and try again.",
  connection_failed: "Could not connect to Shopify. Please try again.",
};

const SUCCESS_MESSAGES = {
  shopify: "Shopify store connected successfully!",
  already: "This Shopify store is already connected.",
};

function IntegrationContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const errorCode = searchParams.get("error");
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [showAuthorizeForm, setShowAuthorizeForm] = useState(false);
  const [stores, setStores] = useState([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [registeringWebhooks, setRegisteringWebhooks] = useState(false);
  const [storeDomain, setStoreDomain] = useState("");
  const [errorMessage, setErrorMessage] = useState(
    errorCode ? ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.connection_failed : "",
  );
  const [successMessage, setSuccessMessage] = useState(
    SUCCESS_MESSAGES[connected] || "",
  );

  const activeStores = stores.filter((store) => store.status === "active");

  const loadShopifyStatus = async () => {
    setIsLoadingStores(true);
    try {
      const response = await fetch("/api/shopify/status", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || "Status request failed");
      }
      setStores(data.stores || []);
    } catch {
      setErrorMessage("Could not load Shopify connection status.");
    } finally {
      setIsLoadingStores(false);
    }
  };

  const handleDisconnect = async (store) => {
    const confirmed = window.confirm(
      `Disconnect ${store.shop}?\n\nThis revokes SmartSell's access in Shopify (the app is uninstalled from the store). Your products and orders in Shopify are not affected. You can reconnect later.`,
    );
    if (!confirmed) return;

    setDisconnectingId(store._id);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/shopify/stores/${store._id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to disconnect store");
      }
      setSuccessMessage(data.message);
      await loadShopifyStatus();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleRegisterWebhooks = async () => {
    setRegisteringWebhooks(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/shopify/webhooks/register", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = (data.results || []).map((r) => r.error).filter(Boolean);
        throw new Error([data.message || "Could not set up live updates.", ...details].join(" "));
      }
      setSuccessMessage(data.message);
      await loadShopifyStatus();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setRegisteringWebhooks(false);
    }
  };

  useEffect(() => {
    // Deferred so the state updates happen outside the effect body.
    const timer = setTimeout(loadShopifyStatus, 0);
    // Load once on mount; later refreshes are explicit.
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showShopifyModal) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setShowShopifyModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showShopifyModal]);

  const openShopifyModal = () => {
    setShowAuthorizeForm(false);
    setShowShopifyModal(true);
    loadShopifyStatus();
  };

  const intergrationdata = [
    {
      Image: "/amazonsvg.png",
      title: "Amazon",
      buttonurl: "",
      subtitle: "World’s largest marketplace. Millions of shoppers.",
    },
    {
      Image: "/shopify.png",
      title: "Shopify",
      isShopify: true,
      subtitle: "Connect your Shopify store instantly via OAuth",
    },
    {
      Image: "/ebay.png",
      title: "Ebay",
      buttonurl: "",
      subtitle: "Integrate your eBay store to unlock full control",
    },
    {
      Image: "/etsy.png",
      title: "Etsy",
      buttonurl: "",
      subtitle: "Unlock smarter selling by connecting your Etsy store",
    },
    {
      Image: "/walmart.jpg",
      title: "Walmart",
      buttonurl: "",
      subtitle: "Connect Walmart and scale your retail business effortlessly",
    },
  ];

  const handleConnectShopify = () => {
    if (!storeDomain) return;
    const cleanDomain = storeDomain.trim().toLowerCase();
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(cleanDomain)}`;
  };

  return (
    <div className="flex flex-col bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 min-h-screen gap-6">

      {/* ── Hero Banner ── */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 py-8 text-white shadow-lg shadow-blue-950/20">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">
          Nexus Panel
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black">
          Integrations
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-blue-100/70">
          Connect your sales channels via OAuth and manage them from one place.
        </p>
      </div>

      {successMessage && (
        <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setSuccessMessage("")}
            className="text-emerald-500 hover:text-emerald-700"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span role="alert">{errorMessage}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setErrorMessage("")}
            className="text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Connected stores (always visible) ── */}
      {activeStores.length > 0 && (
        <section
          aria-labelledby="connected-stores-title"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 id="connected-stores-title" className="text-base font-semibold text-slate-900">
            Connected stores
          </h2>
          <ul className="mt-3 space-y-3">
            {activeStores.map((store) => {
              const live = store.webhooks?.status;
              const liveText =
                live === "active"
                  ? "On"
                  : live === "outdated" || live === "partial"
                    ? `Partly on${store.webhooks.missingTopics?.length ? ` (missing: ${store.webhooks.missingTopics.join(", ")})` : ""}`
                    : live === "elsewhere"
                      ? `Off here (sending to ${store.webhooks.registeredHost})`
                      : `Off${store.webhooks?.lastError ? ` (${store.webhooks.lastError})` : ""}`;
              return (
                <li key={store._id} className="flex flex-col gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 break-all">{store.shop}</p>
                    <p className={live === "active" ? "text-emerald-700" : "text-amber-700"}>
                      Live updates from Shopify: {liveText}
                    </p>
                    {store.missingScopes?.length > 0 && (
                      <p className="text-amber-700">
                        Missing permissions: {store.missingScopes.join(", ")}. Use “Reconnect” in the Shopify panel.
                      </p>
                    )}
                  </div>
                  {live !== "active" && (
                    <button
                      type="button"
                      onClick={handleRegisterWebhooks}
                      disabled={registeringWebhooks}
                      className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {registeringWebhooks ? "Setting up…" : "Set up live updates"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Integration Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {intergrationdata.map((item) => (
          <IntegrationCard
            key={item.title}
            img={item.Image}
            title={item.title}
            subtitle={item.subtitle}
            buttonurl={item.buttonurl || "#"}
            onConnect={item.isShopify ? openShopifyModal : null}
          />
        ))}
      </div>

      {/* Shopify Store Modal */}
      {showShopifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shopify-modal-title"
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100 transition-all"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/shopify.png"
                  alt="Shopify"
                  width={32}
                  height={32}
                  className="w-8 h-8 object-contain"
                />
                <h3
                  id="shopify-modal-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Connect Shopify Store
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowShopifyModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {isLoadingStores ? (
              <p className="text-sm text-slate-600">Checking connected accounts...</p>
            ) : stores.length > 0 && !showAuthorizeForm ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-semibold text-emerald-800">
                    You have {activeStores.length} connected Shopify store
                    {activeStores.length === 1 ? "" : "s"}.
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">
                    Add more stores or manage your existing connections.
                  </p>
                </div>
                <ul className="space-y-2">
                  {stores.map((store) => {
                    const isActive = store.status === "active";
                    return (
                      <li
                        key={store._id}
                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800 break-all">
                            {store.shop}
                          </span>
                          <span
                            className={isActive ? "text-emerald-600" : "text-slate-500"}
                          >
                            {isActive ? "Connected" : "Disconnected"}
                          </span>
                        </div>
                        {isActive && (
                          <p className="mt-1 text-xs text-slate-600">
                            Live updates from Shopify:{" "}
                            {store.webhooks?.status === "active" ? (
                              <span className="text-emerald-700">On</span>
                            ) : store.webhooks?.status === "outdated" || store.webhooks?.status === "partial" ? (
                              <span className="text-amber-700">
                                Partly on{store.webhooks.missingTopics?.length ? ` (missing: ${store.webhooks.missingTopics.join(", ")})` : ""}. Click “Set up live updates”.
                              </span>
                            ) : store.webhooks?.status === "elsewhere" ? (
                              <span className="text-amber-700">
                                Off here (sending to {store.webhooks.registeredHost}). Click “Set up live updates”.
                              </span>
                            ) : (
                              <span className="text-amber-700">
                                Off{store.webhooks?.lastError ? ` (${store.webhooks.lastError})` : ""}
                              </span>
                            )}
                          </p>
                        )}
                        {isActive && store.missingScopes?.length > 0 && (
                          <p className="mt-1 text-xs text-amber-700">
                            Missing permissions: {store.missingScopes.join(", ")}.
                            Reconnect to grant them.
                          </p>
                        )}
                        <div className="mt-2 flex gap-3 text-xs font-medium">
                          <a
                            href={`/api/shopify/install?shop=${encodeURIComponent(store.shop)}&force=true`}
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            {isActive ? "Reconnect / update permissions" : "Reconnect"}
                          </a>
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => handleDisconnect(store)}
                              disabled={disconnectingId === store._id}
                              className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                              {disconnectingId === store._id
                                ? "Disconnecting..."
                                : "Disconnect"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {activeStores.some((store) => store.webhooks?.status !== "active") && (
                  <button
                    type="button"
                    onClick={handleRegisterWebhooks}
                    disabled={registeringWebhooks}
                    className="w-full rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {registeringWebhooks ? "Setting up…" : "Set up live updates"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAuthorizeForm(true)}
                  className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Add more account
                </button>
              </div>
            ) : (
              <>
                <p className="text-slate-600 text-sm mb-4">
                  Enter your Shopify store domain. You will be redirected to Shopify
                  to sign in, review requested permissions, and grant access.
                </p>
                <div className="mb-4">
                  <label
                    htmlFor="shopify-store-domain"
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2"
                  >
                    Shopify Store Domain
                  </label>
                  <input
                    id="shopify-store-domain"
                    type="text"
                    autoFocus
                    value={storeDomain}
                    onChange={(e) => setStoreDomain(e.target.value)}
                    placeholder="your-store-name.myshopify.com"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 text-sm"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowShopifyModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              {(!isLoadingStores && (stores.length === 0 || showAuthorizeForm)) && (
                <button
                  onClick={handleConnectShopify}
                  className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-md transition active:scale-95"
                >
                  Authorize Shopify
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Integration() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <IntegrationContent />
    </React.Suspense>
  );
}

export default Integration;
