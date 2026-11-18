import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { AmazonConfigError, getAmazonConfig, getAmazonEnvironment, isAmazonConnectEnabled } from "@/lib/amazon/config";
import { isEncryptionConfigured } from "@/lib/security/secrets";
import { listAmazonAccounts, toClientAccount } from "@/lib/amazon/accounts";
import { canWrite } from "@/lib/amazon/listingService";
import AmazonSyncJob from "@/models/AmazonSyncJob";
import { logError } from "@/lib/observability/log";

// The signed-in user's Amazon accounts, the active environment, whether new
// production connections are enabled (AMAZON_CONNECT_ENABLED) and each
// account's sync state. Never returns credentials or tokens.
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    let environment = null;
    let configured = false;
    try {
      environment = getAmazonEnvironment();
      configured = Boolean(getAmazonConfig()) && isEncryptionConfigured();
    } catch (error) {
      if (!(error instanceof AmazonConfigError)) throw error;
    }
    const accounts = await listAmazonAccounts(user._id);
    const activeJobs = await AmazonSyncJob.find({ user: user._id, active: true }).select("amazonAccount status").lean();
    const jobByAccount = new Map(activeJobs.map((j) => [String(j.amazonAccount), j.status]));
    return NextResponse.json({
      success: true,
      environment,
      sandbox: environment === "sandbox",
      configured,
      connectEnabled: isAmazonConnectEnabled(),
      region: "NA",
      connected: accounts.length > 0,
      accounts: accounts.map((a) => ({ ...toClientAccount(a), writeEnabled: canWrite(a), syncStatus: jobByAccount.get(String(a._id)) || null })),
    });
  } catch (error) {
    logError(req, "amazon_status_failed", error);
    return NextResponse.json({ success: false, message: "Could not check the Amazon connection." }, { status: 500 });
  }
}
