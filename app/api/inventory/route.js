import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import {
  getActiveStores,
  getInventoryRows,
  getProductsNeedingAttention,
  syncSummary,
} from "@/lib/catalog";
import { getConnectedEbayAccounts, toClientAccount } from "@/lib/ebay/accounts";
import { getEbayProductsNeedingAttention, getEbayRows } from "@/lib/ebay/catalog";
import { logError } from "@/lib/observability/log";

const MARKETPLACES = new Set(["all", "shopify", "ebay"]);

// Product/variant/inventory rows from MongoDB for the signed-in user, from
// every connected marketplace. ?marketplace=all|shopify|ebay narrows them.
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) {
      return response;
    }

    const requested = new URL(req.url).searchParams.get("marketplace") || "all";
    const marketplace = MARKETPLACES.has(requested) ? requested : "all";
    const wantShopify = marketplace !== "ebay";
    const wantEbay = marketplace !== "shopify";

    const [stores, ebayAccounts] = await Promise.all([getActiveStores(user._id), getConnectedEbayAccounts(user._id)]);
    const storeIds = stores.map((s) => s._id);

    const [shopify, shopifyAttention, ebay, ebayAttention] = await Promise.all([
      wantShopify && stores.length
        ? getInventoryRows(user._id, storeIds, new Map(stores.map((s) => [String(s._id), s])))
        : { rows: [], truncated: false },
      wantShopify && stores.length ? getProductsNeedingAttention(user._id, storeIds) : [],
      wantEbay ? getEbayRows(user._id, ebayAccounts) : { rows: [], truncated: false },
      wantEbay ? getEbayProductsNeedingAttention(user._id, ebayAccounts) : [],
    ]);

    return NextResponse.json({
      success: true,
      marketplace,
      data: [...shopify.rows.map((row) => ({ ...row, marketplace: "shopify" })), ...ebay.rows],
      truncated: shopify.truncated || ebay.truncated,
      needsAttention: [...shopifyAttention.map((item) => ({ ...item, marketplace: "shopify" })), ...ebayAttention],
      // hasStore: a Shopify store is connected (unchanged meaning).
      hasStore: stores.length > 0,
      hasEbay: ebayAccounts.length > 0,
      hasMarketplace: stores.length > 0 || ebayAccounts.length > 0,
      sync: syncSummary(stores),
      ebaySync: ebayAccounts.map((a) => ({ accountId: String(a._id), ...toClientAccount(a).sync, username: a.username, status: a.status, setupReady: Boolean(a.setup?.ready) })),
    });
  } catch (error) {
    logError(req, "Inventory route error", error);
    return NextResponse.json(
      { success: false, message: "Could not load products." },
      { status: 500 },
    );
  }
}
