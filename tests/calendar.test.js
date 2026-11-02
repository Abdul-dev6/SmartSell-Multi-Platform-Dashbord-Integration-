import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import CalendarEvent from "@/models/CalendarEvent";
import { validateCalendarEvent } from "@/lib/calendarEvents";
import { GET as list, POST as create } from "@/app/api/calendar-events/route";
import { DELETE as remove } from "@/app/api/calendar-events/[id]/route";
import { createUser, resetDatabase, sessionCookieFor } from "./helpers/db";

const BASE = "http://localhost:3000";
const req = (method, cookie, body) =>
  new NextRequest(`${BASE}/api/calendar-events`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

const valid = {
  title: "Supplier call",
  description: "Restock snowboards",
  date: "2026-11-10",
  endDate: "2026-11-10",
  time: "09:00 AM – 10:00 AM",
  color: "#6366f1",
};

beforeEach(async () => {
  await resetDatabase();
  await CalendarEvent.init();
});

describe("validation", () => {
  it("accepts exactly what the calendar form produces", () => {
    expect(validateCalendarEvent(valid).errors).toEqual({});
  });

  it.each([
    [{ title: "  " }, "title"],
    [{ title: "x".repeat(121) }, "title"],
    [{ date: "2026-02-30" }, "date"],
    [{ endDate: "2026-11-09" }, "endDate"],
    [{ time: "9am" }, "time"],
    [{ time: "13:00 PM – 10:00 AM" }, "time"],
    [{ color: "red" }, "color"],
    [{ title: { $ne: "" } }, "title"],
  ])("rejects %o", (bad, field) => {
    expect(validateCalendarEvent({ ...valid, ...bad }).errors[field]).toBeDefined();
  });
});

describe("routes", () => {
  it("require authentication", async () => {
    expect((await list(req("GET"))).status).toBe(401);
    expect((await create(req("POST", null, valid))).status).toBe(401);
    expect((await remove(req("DELETE"), params("507f1f77bcf86cd799439011"))).status).toBe(401);
  });

  it("saves, lists and deletes the user's events (they persist across requests)", async () => {
    const user = await createUser();
    const cookie = sessionCookieFor(user);

    const created = await create(req("POST", cookie, valid));
    expect(created.status).toBe(201);
    const { event } = await created.json();
    expect(event).toMatchObject({ title: "Supplier call", desc: "Restock snowboards", date: "2026-11-10" });

    const listed = await (await list(req("GET", cookie))).json();
    expect(listed.data).toHaveLength(1);

    expect((await remove(req("DELETE", cookie), params(event.id))).status).toBe(200);
    expect((await (await list(req("GET", cookie))).json()).data).toEqual([]);
  });

  it("returns the validation message for the modal", async () => {
    const user = await createUser();
    const res = await create(req("POST", sessionCookieFor(user), { ...valid, endDate: "2026-11-01" }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("The end date cannot be before the start date.");
  });

  it("users cannot see or delete each other's events", async () => {
    const a = await createUser();
    const b = await createUser();
    const { event } = await (await create(req("POST", sessionCookieFor(a), valid))).json();

    expect((await (await list(req("GET", sessionCookieFor(b)))).json()).data).toEqual([]);
    expect((await remove(req("DELETE", sessionCookieFor(b)), params(event.id))).status).toBe(404);
    expect(await CalendarEvent.countDocuments()).toBe(1);
  });
});
