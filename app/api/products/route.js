import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { validateProductInput } from "@/lib/products/validation";
import { createProduct } from "@/lib/products/service";
import {
  productErrorResponse,
  productResponse,
  productWriteLimit,
  validationErrorResponse,
} from "@/lib/products/http";
import { withNotification } from "@/lib/notifyRoute";

export const maxDuration = 30;

// Creates a product in the user's Shopify store, then stores it in MongoDB.
// The request must carry an idempotencyKey; repeating it never creates a
// second Shopify product.
async function handlePOST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    const { value, errors, notSent } = validateProductInput(await readJsonBody(req), {
      mode: "create",
    });
    if (Object.keys(errors).length) {
      return validationErrorResponse(errors);
    }

    const result = await createProduct(user._id, value);
    return productResponse(result, { notSent, ...(result.partial ? { partial: result.partial } : {}) });
  } catch (error) {
    return productErrorResponse(error, "Create product", req);
  }
}

// Each outcome is recorded as a notification (toast + bell).
export const POST = withNotification(handlePOST, (b) => ({ success: b.partial ? `“${b.product?.title}” created; sales channels need a retry` : `“${b.product?.title}” created in Shopify`, failure: "Product not created" }));
