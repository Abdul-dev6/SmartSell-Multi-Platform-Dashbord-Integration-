import mongoose from "mongoose";
import { NextResponse } from "next/server";
import Notification from "@/models/Notification";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { toClientNotification } from "@/lib/notifications";
import { logError } from "@/lib/observability/log";

const LIMIT = 30;

// The signed-in user's latest notifications and unread count.
// ?after=<ISO date> returns only newer ones (used for toasts).
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const after = new URL(req.url).searchParams.get("after");
    const since = after ? new Date(after) : null;
    const filter = { user: user._id, ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { $gt: since } } : {}) };

    const [docs, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(LIMIT).lean(),
      Notification.countDocuments({ user: user._id, readAt: null }),
    ]);
    return NextResponse.json({ success: true, notifications: docs.map(toClientNotification), unread });
  } catch (error) {
    logError(req, "List notifications error", error);
    return NextResponse.json({ success: false, message: "Could not load notifications." }, { status: 500 });
  }
}

// Marks notifications as read: { ids: [...] } or { all: true }.
export async function PATCH(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const body = (await readJsonBody(req)) || {};
    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => mongoose.isValidObjectId(id)).slice(0, 100) : [];
    if (body.all !== true && !ids.length) {
      return NextResponse.json({ success: false, message: "Nothing to mark as read." }, { status: 400 });
    }
    const filter = { user: user._id, readAt: null, ...(body.all === true ? {} : { _id: { $in: ids } }) };
    await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(req, "Mark notifications read error", error);
    return NextResponse.json({ success: false, message: "Could not update notifications." }, { status: 500 });
  }
}

// Clears (deletes) all of the user's notifications.
export async function DELETE(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    const result = await Notification.deleteMany({ user: user._id });
    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    logError(req, "Clear notifications error", error);
    return NextResponse.json({ success: false, message: "Could not clear notifications." }, { status: 500 });
  }
}
