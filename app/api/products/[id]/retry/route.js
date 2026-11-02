import { requireUser } from "@/lib/auth/GetCurrentUser";
import { retryProduct } from "@/lib/products/service";
import { productErrorResponse, productResponse } from "@/lib/products/http";

export const maxDuration = 30;

// Retries a create/update/delete that failed or whose outcome was unknown.
export async function POST(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { id } = await params;
    return productResponse(await retryProduct(user._id, id));
  } catch (error) {
    return productErrorResponse(error, "Retry product");
  }
}
