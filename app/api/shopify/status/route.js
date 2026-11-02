import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getShopifyOAuthConfig } from "@/lib/Shopify/oauth";
import { listStoresForUser } from "@/lib/Shopify/stores";

// Shopify reports only the write scope when both were requested:
// write_products implies read_products.
function missingScopes(requested, grantedScope) {
  const granted = new Set(
    (grantedScope || "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  return requested.filter(
    (scope) =>
      !granted.has(scope) &&
      !(scope.startsWith("read_") && granted.has(scope.replace(/^read_/, "write_"))),
  );
}

export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const requestedScopes = (getShopifyOAuthConfig()?.scopes || "")
      .split(",")
      .filter(Boolean);

    const stores = (await listStoresForUser(user._id)).map((store) => ({
      ...store,
      status: store.status || "active",
      missingScopes: missingScopes(requestedScopes, store.scope),
    }));

    return NextResponse.json({
      connected: stores.some((store) => store.status === "active"),
      stores,
    });
  } catch (error) {
    console.error("Shopify status error:", error.name, error.message);

    return NextResponse.json(
      {
        connected: false,
        error: "Failed to check Shopify connection",
      },
      { status: 500 },
    );
  }
}
