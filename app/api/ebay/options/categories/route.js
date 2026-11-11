import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { getMarketplaceId } from "@/lib/ebay/config";
import { getEbayAccountForUser } from "@/lib/ebay/accounts";
import { getCategoryDetails, suggestCategories } from "@/lib/ebay/taxonomy";
import { ebayErrorResponse } from "@/lib/ebay/http";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

const CATEGORY_RE = /^\d{1,10}$/;

// ?q=iphone            → category suggestions
// ?categoryId=9355     → item specifics and allowed conditions for a category
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limit = await checkRateLimit(`ebay-taxonomy:${user._id}`, { limit: 120, windowSeconds: 600 });
    if (!limit.allowed) return rateLimitedResponse(NextResponse, limit.retryAfter);

    const params = new URL(req.url).searchParams;
    const account = await getEbayAccountForUser(user._id, { accountId: params.get("accountId") || undefined });
    const marketplaceId = account?.marketplaceId || getMarketplaceId();

    const categoryId = params.get("categoryId");
    if (categoryId) {
      if (!CATEGORY_RE.test(categoryId)) {
        return NextResponse.json({ success: false, code: "validation", message: "Invalid category." }, { status: 400 });
      }
      return NextResponse.json({ success: true, ...(await getCategoryDetails(marketplaceId, categoryId)) });
    }

    const q = (params.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ success: true, categories: [] });
    return NextResponse.json({ success: true, categories: await suggestCategories(marketplaceId, q) });
  } catch (error) {
    return ebayErrorResponse(error, "eBay categories", req);
  }
}
