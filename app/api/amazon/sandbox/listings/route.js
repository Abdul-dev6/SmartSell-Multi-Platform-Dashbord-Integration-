import { NextResponse } from "next/server";
import { importSandboxListing, isValidSampleSku, SANDBOX_SAMPLE_SKU, SandboxViewerError } from "@/lib/amazon/sandboxViewer";
import { toSandboxRow } from "@/lib/amazon/catalog";
import { sandboxFail as fail, sandboxGuard as guard } from "@/lib/amazon/sandboxRoute";
import { readJsonBody } from "@/lib/auth/credentials";
import { logError, logInfo } from "@/lib/observability/log";

// POST { accountId?, sku? }: imports Amazon's SANDBOX sample listing into the
// signed-in user's Products, from their own sandbox account. Sample data
// only; off in production builds unless AMAZON_SANDBOX_VIEWER=true (404).
export async function POST(req) {
  try {
    const { user, response } = await guard(req, "import", 20);
    if (response) return response;

    const body = (await readJsonBody(req)) || {};
    const sku = body.sku === undefined ? SANDBOX_SAMPLE_SKU : body.sku;
    if (!isValidSampleSku(sku)) return fail(400, "validation", "SKU must be 1–40 letters, numbers, dots, dashes or underscores.");
    const accountId = typeof body.accountId === "string" ? body.accountId : undefined;

    const listing = await importSandboxListing(user._id, { accountId, sku });
    logInfo(req, "amazon_sandbox_listing_imported", { environment: "sandbox" });
    return NextResponse.json({ success: true, environment: "sandbox", sampleData: true, product: toSandboxRow(listing) }, { status: 201 });
  } catch (error) {
    if (error instanceof SandboxViewerError) return fail(error.status, error.code, error.message);
    logError(req, "amazon_sandbox_import_error", error, { message: false });
    return fail(500, "unexpected", "Could not import the Amazon Sandbox listing.");
  }
}
