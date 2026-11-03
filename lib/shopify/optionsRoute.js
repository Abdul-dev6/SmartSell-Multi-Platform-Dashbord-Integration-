import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { createClient } from "@/lib/shopify/client";
import { requireStore, shopifyFailure } from "@/lib/products/service";
import { productErrorResponse } from "@/lib/products/http";

// Shared handler for the product-form option endpoints: signs the user in,
// loads only a store they own (optionally ?storeId=…), and maps Shopify
// failures to the same responses as product writes.
export async function withOwnedStore(req, load) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const params = new URL(req.url).searchParams;
    const store = await requireStore(user._id, params.get("storeId") || undefined);
    const client = createClient(store.shop, store.accessToken);
    const result = await load({ store, client, params });
    if (result instanceof NextResponse) return result;
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return productErrorResponse(shopifyFailure(error), "Shopify options", req);
  }
}

export const badRequest = (message) =>
  NextResponse.json({ success: false, code: "validation", message }, { status: 400 });
