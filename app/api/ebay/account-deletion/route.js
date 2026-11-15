import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import {
  getChallengeConfig,
  getSignatureConfig,
  missingChallengeSettings,
  missingNotificationSettings,
} from "@/lib/ebay/notifications/config";
import { challengeResponse, SignatureError, verifyNotificationSignature } from "@/lib/ebay/notifications/verify";
import { ACCOUNT_DELETION_TOPIC, parseDeletionNotification, processDeletionNotification } from "@/lib/ebay/notifications/accountDeletion";
import { logError, logInfo, logWarn } from "@/lib/observability/log";

// eBay Marketplace Account Deletion notification endpoint (public).
//
// GET  ?challenge_code=…  → 200 { "challengeResponse": sha256 hex } so eBay
//                            can confirm we own the endpoint.
// POST notification       → signature verified against eBay's public key,
//                            then the user's eBay data is deleted. 204 when
//                            done (or already done), 412 when the signature
//                            is missing or wrong, 400 for a malformed body,
//                            500 when it could not be processed yet (eBay
//                            retries until it gets a 2xx).
// Logs never contain the eBay user ID, username, eiasToken or credentials.

export const maxDuration = 30;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_CHALLENGE_LENGTH = 512;

const json = (body, status = 200) => NextResponse.json(body, { status });

export async function GET(req) {
  const challengeCode = req.nextUrl.searchParams.get("challenge_code");
  if (!challengeCode || challengeCode.length > MAX_CHALLENGE_LENGTH) {
    return json({ error: "challenge_code is required" }, 400);
  }
  // Only the endpoint and verification token are needed here; the client
  // ID/secret are used by POST alone.
  const challenge = getChallengeConfig();
  if (!challenge) {
    logError(req, "ebay_deletion_not_configured", null, { phase: "challenge", missing: missingChallengeSettings() });
    return json({ error: "not_configured" }, 500);
  }
  // A JSON library builds the body (eBay warns that hand-built strings can
  // gain a BOM); Content-Type is application/json.
  return json({ challengeResponse: challengeResponse(challengeCode, challenge.token, challenge.endpoint) });
}

export async function POST(req) {
  const config = getSignatureConfig();
  if (!config) {
    // Without the keyset nothing can be verified, so nothing is processed;
    // not acknowledged, so eBay retries once it is configured.
    logError(req, "ebay_deletion_not_configured", null, { phase: "notification", missing: missingNotificationSettings() });
    return json({ error: "not_configured" }, 500);
  }
  const { environment, keyset } = config;

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  let message;
  try {
    message = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // Nothing in the body is trusted until eBay's signature checks out.
  try {
    await verifyNotificationSignature({ message, rawBody, header: req.headers.get("x-ebay-signature"), keyset });
  } catch (error) {
    if (error instanceof SignatureError && error.reason !== "key_unavailable") {
      logWarn(req, "ebay_deletion_signature_rejected", null, { reason: error.reason });
      return json({ error: "signature_verification_failed" }, 412);
    }
    logError(req, "ebay_deletion_key_unavailable", error, { message: false });
    return json({ error: "temporarily_unavailable" }, 500);
  }

  const topic = message?.metadata?.topic;
  if (topic !== ACCOUNT_DELETION_TOPIC) {
    // Signed by eBay but not for this endpoint: acknowledge and ignore.
    logInfo(req, "ebay_notification_ignored", { topic: typeof topic === "string" ? topic.slice(0, 64) : null });
    return new NextResponse(null, { status: 204 });
  }
  const parsed = parseDeletionNotification(message);
  if (!parsed) {
    logWarn(req, "ebay_deletion_invalid_payload", null);
    return json({ error: "invalid_payload" }, 400);
  }

  try {
    await connectDB();
    const { duplicate, outcome } = await processDeletionNotification(parsed, { environment });
    logInfo(req, "ebay_deletion_processed", {
      notificationId: parsed.notificationId,
      environment,
      duplicate,
      deleted: outcome || null,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // Not acknowledged: eBay redelivers, and processing is idempotent.
    logError(req, "ebay_deletion_failed", error, { message: false, notificationId: parsed.notificationId });
    return json({ error: "processing_failed" }, 500);
  }
}
