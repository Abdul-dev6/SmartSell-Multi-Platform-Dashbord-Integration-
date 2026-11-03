import { GetCurrentUser } from "@/lib/auth/GetCurrentUser";
import { notify } from "@/lib/notifications";

// Wraps a route handler so its outcome is recorded as a notification for the
// signed-in user: `labels(body)` returns { success, failure, message? }
// (body = the parsed JSON response, or {}). Requests without a session
// (401) and cross-site requests never reach this point or are skipped.
export function withNotification(handler, labels) {
  return async (req, ctx) => {
    const response = await handler(req, ctx);
    if (!response || response.status === 401) return response;

    try {
      const user = await GetCurrentUser(req);
      if (!user) return response;
      let body = {};
      try {
        body = await response.clone().json();
      } catch {
        // not JSON
      }
      const text = labels(body || {});
      if (response.ok) {
        await notify(user._id, "success", text.success, text.message);
      } else {
        const reason = [body.message, ...(body.userErrors || []).map((e) => e.message)].filter(Boolean).join(" ");
        await notify(user._id, "error", text.failure, reason);
      }
    } catch {
      // Notifications are best effort.
    }
    return response;
  };
}
