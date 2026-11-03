import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { ProductServiceError, toClientProduct } from "./service";
import { logError } from "@/lib/observability/log";

// Product writes call Shopify, so each account gets a generous cap that
// still protects the store's Shopify API budget. Returns a 429 response or null.
export const PRODUCT_WRITE_LIMIT = { limit: 120, windowSeconds: 10 * 60 };

export async function productWriteLimit(userId) {
  const result = await checkRateLimit(`product-writes:${userId}`, PRODUCT_WRITE_LIMIT);
  return result.allowed ? null : rateLimitedResponse(NextResponse, result.retryAfter);
}

export function productResponse(result, extra = {}) {
  return NextResponse.json(
    {
      success: true,
      product: result.product ? toClientProduct(result.product) : null,
      ...(result.replay ? { replay: true } : {}),
      ...extra,
    },
    { status: result.status },
  );
}

export function productErrorResponse(error, context, req = null) {
  if (error instanceof ProductServiceError) {
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        message: error.message,
        ...(error.userErrors ? { userErrors: error.userErrors } : {}),
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

export function validationErrorResponse(errors) {
  return NextResponse.json(
    { success: false, code: "validation", message: "Please fix the highlighted fields.", errors },
    { status: 400 },
  );
}
