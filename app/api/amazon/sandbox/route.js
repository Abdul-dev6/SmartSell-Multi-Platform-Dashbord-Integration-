import { NextResponse } from "next/server";
import { AmazonAccountOwnershipError, toClientAccount } from "@/lib/amazon/accounts";
import {
  connectSandboxAccount,
  isValidSampleSku,
  loadSandboxSample,
  SANDBOX_SAMPLE_SKU,
  SandboxViewerError,
} from "@/lib/amazon/sandboxViewer";
import { sandboxFail as fail, sandboxGuard as guard } from "@/lib/amazon/sandboxRoute";
import { logError, logInfo, logWarn } from "@/lib/observability/log";

// Amazon Sandbox Data Viewer API (SANDBOX ONLY, sample/mock data).
//   GET  ?accountId=&sku=  fresh static-sandbox responses for the signed-in
//                          user's own sandbox account
//   POST                   links the developer sandbox credentials to the
//                          signed-in user as their sandbox account
// Off in production builds unless AMAZON_SANDBOX_VIEWER=true (404).

export async function GET(req) {
  try {
    const { user, response } = await guard(req, "view", 30);
    if (response) return response;

    const params = new URL(req.url).searchParams;
    const sku = params.get("sku") || SANDBOX_SAMPLE_SKU;
    if (!isValidSampleSku(sku)) return fail(400, "validation", "SKU must be 1–40 letters, numbers, dots, dashes or underscores.");

    const result = await loadSandboxSample(user._id, { accountId: params.get("accountId") || undefined, sku });
    if (!result.connected) {
      return NextResponse.json({ success: true, environment: "sandbox", sampleData: true, connected: false });
    }
    if (!result.participations.ok && !result.listing.ok) {
      logWarn(req, "amazon_sandbox_view_failed", null, { participations: result.participations.error.code, listing: result.listing.error.code });
      return fail(502, "amazon_sandbox_unavailable", result.listing.error.message);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof SandboxViewerError) return fail(error.status, error.code, error.message);
    logError(req, "amazon_sandbox_view_error", error, { message: false });
    return fail(500, "unexpected", "Could not load Amazon Sandbox data.");
  }
}

export async function POST(req) {
  try {
    const { user, response } = await guard(req, "connect", 10);
    if (response) return response;
    const account = await connectSandboxAccount(user._id);
    logInfo(req, "amazon_sandbox_account_linked", { environment: "sandbox" });
    return NextResponse.json({ success: true, environment: "sandbox", account: toClientAccount(account) }, { status: 201 });
  } catch (error) {
    if (error instanceof SandboxViewerError) return fail(error.status, error.code, error.message);
    if (error instanceof AmazonAccountOwnershipError) {
      return fail(409, "linked_elsewhere", "The Amazon Sandbox seller account is already linked to another SmartSell account.");
    }
    logError(req, "amazon_sandbox_connect_error", error, { message: false });
    return fail(500, "unexpected", "Could not connect the Amazon Sandbox account.");
  }
}
