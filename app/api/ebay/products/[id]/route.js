import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { productWriteLimit } from "@/lib/products/http";
import { validateEbayProductInput } from "@/lib/ebay/products/validation";
import {
  deleteEbayProduct,
  getOwnedEbayProduct,
  toClientEbayProduct,
  updateEbayProduct,
} from "@/lib/ebay/products/service";
import { ebayProductResponse, ebayValidationErrorResponse } from "@/lib/ebay/products/http";
import { ebayErrorResponse } from "@/lib/ebay/http";
import { withNotification } from "@/lib/notifyRoute";

export const maxDuration = 30;

const notFound = () =>
  NextResponse.json({ success: false, code: "not_found", message: "Product not found." }, { status: 404 });

export async function GET(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const { id } = await params;
    const product = await getOwnedEbayProduct(user._id, id);
    if (!product || product.archivedAt) return notFound();
    return NextResponse.json({ success: true, product: toClientEbayProduct(product) });
  } catch (error) {
    return ebayErrorResponse(error, "Read eBay product", req);
  }
}

async function handlePATCH(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    const { id } = await params;
    const { value, errors } = validateEbayProductInput(await readJsonBody(req), { mode: "update" });
    if (Object.keys(errors).length) return ebayValidationErrorResponse(errors);

    return ebayProductResponse(await updateEbayProduct(user._id, id, value));
  } catch (error) {
    return ebayErrorResponse(error, "Update eBay product", req);
  }
}

async function handleDELETE(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    const { id } = await params;
    return ebayProductResponse(await deleteEbayProduct(user._id, id));
  } catch (error) {
    return ebayErrorResponse(error, "Delete eBay product", req);
  }
}

export const PATCH = withNotification(handlePATCH, (b) => ({
  success: `“${b.product?.title}” updated on eBay`,
  failure: "eBay product not updated",
}));

export const DELETE = withNotification(handleDELETE, (b) => ({
  success: `“${b.product?.title}” deleted from eBay`,
  failure: "eBay product not deleted",
}));
