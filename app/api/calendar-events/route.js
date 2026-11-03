import { NextResponse } from "next/server";
import CalendarEvent from "@/models/CalendarEvent";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { toClientEvent, validateCalendarEvent } from "@/lib/calendarEvents";
import { logError } from "@/lib/observability/log";

const MAX_EVENTS = 1000;

export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const docs = await CalendarEvent.find({ user: user._id }).sort({ date: 1, createdAt: 1 }).limit(MAX_EVENTS).lean();
    return NextResponse.json({ success: true, data: docs.map(toClientEvent) });
  } catch (error) {
    logError(req, "List calendar events error", error);
    return NextResponse.json({ success: false, message: "Could not load events." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { value, errors } = validateCalendarEvent(await readJsonBody(req));
    if (Object.keys(errors).length) {
      return NextResponse.json(
        { success: false, message: Object.values(errors)[0], errors },
        { status: 400 },
      );
    }

    if ((await CalendarEvent.countDocuments({ user: user._id })) >= MAX_EVENTS) {
      return NextResponse.json(
        { success: false, message: `You can keep up to ${MAX_EVENTS} events. Delete old ones first.` },
        { status: 409 },
      );
    }

    const doc = await CalendarEvent.create({ ...value, user: user._id });
    return NextResponse.json({ success: true, event: toClientEvent(doc) }, { status: 201 });
  } catch (error) {
    logError(req, "Create calendar event error", error);
    return NextResponse.json({ success: false, message: "Could not save the event." }, { status: 500 });
  }
}
