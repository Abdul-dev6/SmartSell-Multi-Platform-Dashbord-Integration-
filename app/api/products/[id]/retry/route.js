import { requireUser } from "@/lib/auth/GetCurrentUser";
import { retryProduct } from "@/lib/products/service";
import { productErrorResponse, productResponse, productWriteLimit } from "@/lib/products/http";
import { withNotification } from "@/lib/notifyRoute";

export const maxDuration = 30;

// Retries a create/update/delete that failed or whose outcome was unknown.
async function handlePOST(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;

    const { id } = await params;
    return productResponse(await retryProduct(user._id, id));
  } catch (error) {
    return productErrorResponse(error, "Retry product", req);
  }
}

// Each outcome is recorded as a notification (toast + bell).
export const POST = withNotification(handlePOST, (b) => ({ success: `“${b.product?.title}” synced with Shopify`, failure: "Retry failed" }));
