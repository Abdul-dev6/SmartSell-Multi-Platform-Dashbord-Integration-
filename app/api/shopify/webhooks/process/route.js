import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { safeEqual } from "@/lib/shopify/oauth";
import { processDueEvents } from "@/lib/webhooks/queue";

export const maxDuration = 60;

// Recovery worker for stored webhook events that failed or were not finished.
// Called by Vercel Cron (see vercel.json), which sends
// "Authorization: Bearer <CRON_SECRET>".
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!safeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const summary = await processDueEvents({ limit: 500, deadline: Date.now() + 50000 });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Webhook worker error:", error.name, error.message);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
