import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Product from "@/models/Product";
import Inventory from "@/models/Inventory";
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
import { withNotification } from "@/lib/notifyRoute";

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

    // Current stock per location for a single-variant product (from the
    // inventory levels synced from Shopify), so the form can show and edit it.
    const variants = product.variants || [];
    const itemId = variants.length === 1 ? variants[0].inventoryItemId : null;
    const levels = itemId
      ? await Inventory.find({ shopifyStore: product.shopifyStore, user: user._id, inventoryItemId: String(itemId), disconnectedAt: null })
          .select("locationId available")
          .lean()
      : [];

    return NextResponse.json({
      success: true,
      product: {
        ...toClientProduct(product),
        inventoryLevels: levels.map((l) => ({ locationId: l.locationId, available: l.available })),
      },
    });
  } catch (error) {
    return productErrorResponse(error, "Get product", req);
  }
}

// Updates only the fields present in the request.
async function handlePATCH(req, { params }) {
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
    return productErrorResponse(error, "Update product", req);
  }
}

// Deletes the product from Shopify and archives it in SmartSell. Requires
// { "confirm": true } so it cannot be triggered by accident.
async function handleDELETE(req, { params }) {
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
    return productErrorResponse(error, "Delete product", req);
  }
}

// Each outcome is recorded as a notification (toast + bell).
export const PATCH = withNotification(handlePATCH, (b) => ({ success: `“${b.product?.title}” updated`, failure: "Product not updated" }));
export const DELETE = withNotification(handleDELETE, (b) => ({ success: `“${b.product?.title}” deleted from Shopify`, failure: "Product not deleted" }));
