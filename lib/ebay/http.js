import { NextResponse } from "next/server";
import { EbayApiError } from "@/lib/ebay/client";
import { logError } from "@/lib/observability/log";

const STATUS_BY_CODE = {
  ebay_not_configured: 503,
  reauth_required: 409,
  unauthorized: 409,
  not_found: 404,
  rate_limited: 429,
  network_error: 504,
  ebay_unavailable: 502,
  token_refresh_failed: 502,
  ebay_rejected: 422,
};

// Turns eBay and service errors into safe JSON responses. eBay's own error
// messages describe what to fix (e.g. a missing item specific), so they are
// passed through; nothing else from the response is.
export function ebayErrorResponse(error, context, req = null) {
  if (error instanceof EbayApiError) {
    if (STATUS_BY_CODE[error.code] >= 500 || error.code === "unauthorized") {
      logError(req, `${context} failed`, error, { message: false, ...(error.status ? { status: error.status } : {}) });
    }
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        message: error.message,
        ...(error.errors?.length ? { ebayErrors: error.errors } : {}),
      },
      { status: STATUS_BY_CODE[error.code] || 502 },
    );
  }
  if (error?.name === "EbayProductError") {
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        message: error.message,
        ...(error.ebayErrors?.length ? { ebayErrors: error.ebayErrors } : {}),
        ...(error.productId ? { productId: error.productId } : {}),
      },
      { status: error.status },
    );
  }
  logError(req, `${context} error`, error);
  return NextResponse.json(
    { success: false, code: "server_error", message: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
