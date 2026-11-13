import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { productWriteLimit } from "@/lib/products/http";
import { validateEbayProductInput } from "@/lib/ebay/products/validation";
import { createEbayProduct } from "@/lib/ebay/products/service";
import { ebayProductResponse, ebayValidationErrorResponse } from "@/lib/ebay/products/http";
import { ebayErrorResponse } from "@/lib/ebay/http";
import { withNotification } from "@/lib/notifyRoute";

export const maxDuration = 30;

// Creates a product on the seller's eBay account (inventory item + offer,
// published unless saved as a draft), then stores it in MongoDB. Requires an
// idempotencyKey; repeating it never creates a second product.
async function handlePOST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    const { value, errors } = validateEbayProductInput(await readJsonBody(req), { mode: "create" });
    if (Object.keys(errors).length) return ebayValidationErrorResponse(errors);

    return ebayProductResponse(await createEbayProduct(user._id, value));
  } catch (error) {
    return ebayErrorResponse(error, "Create eBay product", req);
  }
}

export const POST = withNotification(handlePOST, (b) => ({
  success:
    b.product?.listingStatus === "published"
      ? `“${b.product?.title}” listed on eBay`
      : `“${b.product?.title}” saved to eBay as a draft`,
  failure: "eBay product not created",
}));
