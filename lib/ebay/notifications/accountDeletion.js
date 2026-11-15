import EbayAccount from "@/models/EbayAccount";
import EbayProduct from "@/models/EbayProduct";
import Notification from "@/models/Notification";
import EbayDeletionNotification, { DELETION_RECORD_RETENTION_DAYS } from "@/models/EbayDeletionNotification";
import { notify } from "@/lib/notifications";

export const ACCOUNT_DELETION_TOPIC = "MARKETPLACE_ACCOUNT_DELETION";
const MAX_ID = 256;

const isId = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_ID;
const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Checks the notification's shape. Returns { topic, notificationId, userId,
// username, eventDate, publishDate } or null when it is not a usable
// account-deletion notification.
export function parseDeletionNotification(message) {
  const topic = message?.metadata?.topic;
  const n = message?.notification;
  const data = n?.data;
  if (topic !== ACCOUNT_DELETION_TOPIC || !isId(n?.notificationId) || !isId(data?.userId)) return null;
  return {
    topic,
    notificationId: n.notificationId,
    userId: data.userId,
    username: isId(data.username) ? data.username : null,
    eventDate: toDate(n.eventDate),
    publishDate: toDate(n.publishDate),
  };
}

// Permanently deletes everything SmartSell holds about one eBay user in one
// environment. The account is matched only by eBay's immutable user ID
// (usernames can change), so no other seller's data can be touched.
// Removed: the eBay account record (tokens, eBay user ID, username, setup),
// that account's products, and the owner's notifications that name the eBay
// user. Kept: the SmartSell login and all Shopify data, which are not eBay
// data.
export async function deleteEbayUserData({ environment, userId, username }) {
  const accounts = await EbayAccount.find({ environment, ebayUserId: userId }).select("_id user username ebayUserId").lean();
  const outcome = { accounts: 0, products: 0, notifications: 0 };

  for (const account of accounts) {
    const products = await EbayProduct.deleteMany({ ebayAccount: account._id });
    outcome.products += products.deletedCount;

    const names = [...new Set([account.ebayUserId, account.username, username].filter(isId))];
    if (names.length) {
      const pattern = new RegExp(names.map(escapeRegex).join("|"));
      const notes = await Notification.deleteMany({ user: account.user, $or: [{ title: pattern }, { message: pattern }] });
      outcome.notifications += notes.deletedCount;
    }

    const removed = await EbayAccount.deleteOne({ _id: account._id, ebayUserId: userId, environment });
    outcome.accounts += removed.deletedCount;

    // Tell the SmartSell user, without naming the eBay account.
    await notify(
      account.user,
      "info",
      "eBay account data deleted",
      "At eBay's request, SmartSell permanently deleted the data of an eBay account you had connected, including its products. Your SmartSell account and Shopify data are not affected.",
    );
  }
  return outcome;
}

// Records and processes one verified notification. Safe to call again for
// the same notificationId: a completed one is acknowledged without
// reprocessing; a failed or interrupted one is processed again (the
// deletion itself is idempotent). Returns { duplicate, outcome }.
export async function processDeletionNotification(parsed, { environment, now = new Date() }) {
  const expiresAt = new Date(now.getTime() + DELETION_RECORD_RETENTION_DAYS * 86400000);
  const claim = () =>
    EbayDeletionNotification.findOneAndUpdate(
      { notificationId: parsed.notificationId },
      {
        $setOnInsert: {
          notificationId: parsed.notificationId,
          environment,
          eventDate: parsed.eventDate,
          publishDate: parsed.publishDate,
          status: "processing",
          expiresAt,
        },
        $inc: { attempts: 1 },
      },
      { upsert: true, returnDocument: "before" },
    ).lean();
  let record;
  try {
    record = await claim();
  } catch (error) {
    // Two deliveries of the same notification raced to insert the record.
    if (error?.code !== 11000) throw error;
    record = await claim();
  }
  if (record?.status === "completed") return { duplicate: true, outcome: record.outcome };

  try {
    const outcome = await deleteEbayUserData({ environment, userId: parsed.userId, username: parsed.username });
    await EbayDeletionNotification.updateOne(
      { notificationId: parsed.notificationId },
      { $set: { status: "completed", outcome, processedAt: new Date(), expiresAt }, $unset: { lastError: 1 } },
    );
    return { duplicate: false, outcome };
  } catch (error) {
    await EbayDeletionNotification.updateOne(
      { notificationId: parsed.notificationId },
      { $set: { status: "failed", lastError: `${error?.name || "Error"}${error?.code ? ` (${error.code})` : ""}`.slice(0, 200) } },
    ).catch(() => {});
    throw error;
  }
}
