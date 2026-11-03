import Notification, { NOTIFICATION_RETENTION_DAYS } from "@/models/Notification";
import { logWarn } from "@/lib/observability/log";

const MAX_TITLE = 120;
const MAX_MESSAGE = 500;

// Records a notification for the user. Best effort: a failure here never
// affects the action being reported. Never pass tokens or customer data.
export async function notify(userId, type, title, message = "") {
  if (!userId) return;
  try {
    await Notification.create({
      user: userId,
      type,
      title: String(title).slice(0, MAX_TITLE),
      message: message ? String(message).slice(0, MAX_MESSAGE) : undefined,
      expiresAt: new Date(Date.now() + NOTIFICATION_RETENTION_DAYS * 86400000),
    });
  } catch (error) {
    logWarn(null, "notification_create_failed", error, { message: false });
  }
}

// Notifies from a route's JSON response: success when ok, otherwise an
// error with the response's message. Returns the response unchanged.
export async function notifyResponse(userId, response, { success, failure, successMessage }) {
  if (!userId || !response) return response;
  if (response.ok) {
    await notify(userId, "success", success, successMessage);
  } else if (response.status !== 401) {
    let message = "";
    try {
      const body = await response.clone().json();
      message = [body.message, ...(body.userErrors || []).map((e) => e.message)].filter(Boolean).join(" ");
    } catch {
      // not JSON
    }
    await notify(userId, "error", failure, message);
  }
  return response;
}

export function toClientNotification(doc) {
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    message: doc.message || "",
    read: Boolean(doc.readAt),
    createdAt: doc.createdAt,
  };
}
