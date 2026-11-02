import { NextResponse } from "next/server";
import { ProductServiceError, toClientProduct } from "./service";

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

export function productErrorResponse(error, context) {
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
  console.error(`${context} error:`, error.name, error.message);
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
