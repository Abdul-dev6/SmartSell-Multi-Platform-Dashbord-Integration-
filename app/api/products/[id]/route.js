import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Product from "@/models/Product";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { validateProductInput } from "@/lib/products/validation";
import { deleteProduct, toClientProduct, updateProduct } from "@/lib/products/service";
import {
  productErrorResponse,
  productResponse,
  productWriteLimit,
  validationErrorResponse,
} from "@/lib/products/http";

export const maxDuration = 30;

const notFound = () =>
  NextResponse.json({ success: false, code: "not_found", message: "Product not found." }, { status: 404 });

export async function GET(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();
    const product = await Product.findOne({ _id: id, user: user._id }).lean();
    if (!product) return notFound();

    return NextResponse.json({ success: true, product: toClientProduct(product) });
  } catch (error) {
    return productErrorResponse(error, "Get product");
  }
}

// Updates only the fields present in the request.
export async function PATCH(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    const { id } = await params;
    const { value, errors, notSent } = validateProductInput(await readJsonBody(req), {
      mode: "update",
    });
    if (Object.keys(errors).length) {
      return validationErrorResponse(errors);
    }
    delete value.storeId; // a product's store is fixed
    if (!Object.keys(value).length) {
      return validationErrorResponse({ _form: "No changes to save." });
    }

    return productResponse(await updateProduct(user._id, id, value), { notSent });
  } catch (error) {
    return productErrorResponse(error, "Update product");
  }
}

// Deletes the product from Shopify and archives it in SmartSell. Requires
// { "confirm": true } so it cannot be triggered by accident.
export async function DELETE(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    const body = await readJsonBody(req);
    if (body?.confirm !== true) {
      return NextResponse.json(
        { success: false, code: "confirmation_required", message: "Deletion must be confirmed." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const result = await deleteProduct(user._id, id);
    return productResponse(result, result.alreadyDeleted ? { alreadyDeleted: true } : {});
  } catch (error) {
    return productErrorResponse(error, "Delete product");
  }
}
