import { NextResponse } from "next/server";
import { toClientEbayProduct } from "./service";

export function ebayProductResponse(result, extra = {}) {
  return NextResponse.json(
    {
      success: true,
      product: result.product ? toClientEbayProduct(result.product) : null,
      ...(result.replay ? { replay: true } : {}),
      ...(result.nothingToRetry ? { nothingToRetry: true } : {}),
      ...extra,
    },
    { status: result.status },
  );
}

export function ebayValidationErrorResponse(errors) {
  return NextResponse.json(
    { success: false, code: "validation", message: "Please fix the highlighted fields.", errors },
    { status: 400 },
  );
}
