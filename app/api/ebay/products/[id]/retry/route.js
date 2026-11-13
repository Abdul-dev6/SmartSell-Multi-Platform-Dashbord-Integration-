import { requireUser } from "@/lib/auth/GetCurrentUser";
import { productWriteLimit } from "@/lib/products/http";
import { retryEbayProduct } from "@/lib/ebay/products/service";
import { ebayProductResponse } from "@/lib/ebay/products/http";
import { ebayErrorResponse } from "@/lib/ebay/http";
import { withNotification } from "@/lib/notifyRoute";

export const maxDuration = 30;

// Repeats a failed or unconfirmed SmartSell → eBay write.
async function handlePOST(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limited = await productWriteLimit(user._id);
    if (limited) return limited;
    const { id } = await params;
    return ebayProductResponse(await retryEbayProduct(user._id, id));
  } catch (error) {
    return ebayErrorResponse(error, "Retry eBay product", req);
  }
}

export const POST = withNotification(handlePOST, (b) => ({
  success: b.nothingToRetry ? `“${b.product?.title}” is already up to date` : `“${b.product?.title}” sent to eBay`,
  failure: "eBay retry failed",
}));
