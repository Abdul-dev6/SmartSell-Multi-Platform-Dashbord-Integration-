import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getActiveStoreForUser } from "@/lib/Shopify/stores";
import { createClient } from "@/lib/Shopify/client";
import { Getproducts } from "@/lib/Shopify/products";
import { Getorders } from "@/lib/Shopify/order";
import { getInventoryPageData } from "@/lib/Shopify/Getinventorypagedata";

// Shopify's raw error bodies are not forwarded to the browser.
function shopifyErrorResponse(error) {
  const upstream = error.response?.status;

  if (upstream === 401 || upstream === 403) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Shopify rejected the request. Reconnect the store or check its permissions.",
      },
      { status: 502 },
    );
  }

  if (upstream === 429) {
    return NextResponse.json(
      { success: false, message: "Shopify rate limit reached. Try again shortly." },
      { status: 429 },
    );
  }

  return NextResponse.json(
    { success: false, message: "Could not load data from Shopify." },
    { status: upstream ? 502 : 500 },
  );
}

export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const { searchParams } = new URL(req.url);
    const shop = searchParams.get("shop");
    const type = searchParams.get("type");

    const store = await getActiveStoreForUser(user._id, {
      shop: shop || undefined,
      withToken: true,
    });
    if (!store) {
      return NextResponse.json(
        {
          message: "No connected Shopify store",
          success: false,
        },
        { status: 404 },
      );
    }

    const client = createClient(store.shop, store.accessToken);

    switch (type) {
      case "products": {
        const products = await Getproducts(client);
        return NextResponse.json({
          message: "Shopify user found",
          success: true,
          data: products,
        });
      }

      case "getinventory": {
        const getinventory = await getInventoryPageData(client);
        return NextResponse.json({
          message: "Shopify user found",
          success: true,
          data: getinventory,
        });
      }

      case "orders": {
        const orders = await Getorders(client);
        return NextResponse.json({
          message: "Shopify user found",
          success: true,
          data: orders,
        });
      }

      default:
        return NextResponse.json(
          {
            message: "Invalid type",
            success: false,
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Shopify userdata error:", {
      status: error.response?.status,
      message: error.message,
    });
    return shopifyErrorResponse(error);
  }
}
