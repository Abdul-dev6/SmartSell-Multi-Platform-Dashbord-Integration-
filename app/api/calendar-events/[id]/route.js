import { NextResponse } from "next/server";
import mongoose from "mongoose";
import CalendarEvent from "@/models/CalendarEvent";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { logError } from "@/lib/observability/log";
import { withNotification } from "@/lib/notifyRoute";

async function handleDELETE(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { id } = await params;
    const result = mongoose.isValidObjectId(id)
      ? await CalendarEvent.deleteOne({ _id: id, user: user._id })
      : { deletedCount: 0 };
    if (!result.deletedCount) {
      return NextResponse.json({ success: false, message: "Event not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(req, "Delete calendar event error", error);
    return NextResponse.json({ success: false, message: "Could not delete the event." }, { status: 500 });
  }
}

// Each outcome is recorded as a notification (toast + bell).
export const DELETE = withNotification(handleDELETE, () => ({ success: "Event deleted", failure: "Event not deleted" }));
