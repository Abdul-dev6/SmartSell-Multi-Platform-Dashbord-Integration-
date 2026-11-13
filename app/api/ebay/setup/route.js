import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { getEbayAccountForUser, toClientAccount } from "@/lib/ebay/accounts";
import { EbayApiError } from "@/lib/ebay/client";
import {
  checkEbaySetup,
  createDefaultPolicies,
  createInventoryLocation,
  ISSUE_MESSAGES,
  optInToBusinessPolicies,
  selectSetup,
  validateLocationInput,
} from "@/lib/ebay/setup";
import { ebayErrorResponse } from "@/lib/ebay/http";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

export const maxDuration = 30;

const notFound = () =>
  NextResponse.json({ success: false, code: "not_found", message: "eBay account not found." }, { status: 404 });

function setupResponse(account, result, extra = {}) {
  return NextResponse.json({
    success: true,
    account: toClientAccount(account),
    options: result.options,
    canCreateDefaultPolicies: result.canCreateDefaultPolicies,
    issueMessages: ISSUE_MESSAGES,
    ...extra,
  });
}

// Current listing prerequisites, read live from eBay.
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const accountId = new URL(req.url).searchParams.get("accountId") || undefined;
    const account = await getEbayAccountForUser(user._id, { accountId });
    if (!account) return notFound();
    return setupResponse(account, await checkEbaySetup(account));
  } catch (error) {
    return ebayErrorResponse(error, "eBay setup check", req);
  }
}

// Actions: opt_in | create_policies | create_location | select.
export async function POST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const limit = await checkRateLimit(`ebay-setup:${user._id}`, { limit: 30, windowSeconds: 600 });
    if (!limit.allowed) return rateLimitedResponse(NextResponse, limit.retryAfter);

    const body = await readJsonBody(req);
    const account = await getEbayAccountForUser(user._id, { accountId: body?.accountId || undefined });
    if (!account) return notFound();

    switch (body?.action) {
      case "opt_in":
        await optInToBusinessPolicies(account);
        break;
      case "create_policies":
        await checkEbaySetup(account);
        await createDefaultPolicies(account);
        break;
      case "create_location": {
        const { value, errors } = validateLocationInput(body.location);
        if (Object.keys(errors).length) {
          return NextResponse.json(
            { success: false, code: "validation", message: "Please fix the highlighted fields.", errors },
            { status: 400 },
          );
        }
        await createInventoryLocation(account, value);
        account.setup = { ...(account.setup?.toObject?.() || account.setup || {}), merchantLocationKey: value.key };
        break;
      }
      case "select": {
        const { options } = await checkEbaySetup(account);
        const ok = await selectSetup(account, body, options);
        if (!ok) {
          return NextResponse.json(
            { success: false, code: "validation", message: "Choose policies and a location from your eBay account." },
            { status: 400 },
          );
        }
        break;
      }
      default:
        return NextResponse.json({ success: false, code: "validation", message: "Unknown action." }, { status: 400 });
    }

    return setupResponse(account, await checkEbaySetup(account));
  } catch (error) {
    if (error instanceof EbayApiError && error.code === "unsupported_marketplace") {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: 400 });
    }
    return ebayErrorResponse(error, "eBay setup", req);
  }
}
