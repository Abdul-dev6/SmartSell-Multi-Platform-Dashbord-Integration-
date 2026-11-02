import connectDB from "@/lib/mongodb";
import RateLimit from "@/models/RateLimit";

// On Vercel the first x-forwarded-for entry is set by the platform.
export function getClientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// Fixed-window counter shared across serverless instances.
// Returns { allowed, retryAfter } where retryAfter is in seconds.
export async function checkRateLimit(key, { limit, windowSeconds }) {
  await connectDB();

  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  let doc;
  try {
    doc = await RateLimit.findOneAndUpdate(
      { key, windowStart },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(windowStart.getTime() + windowMs) },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    // Two concurrent first requests can race on the upsert; retry once.
    if (error?.code !== 11000) {
      throw error;
    }
    doc = await RateLimit.findOneAndUpdate(
      { key, windowStart },
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
  }

  const retryAfter = Math.ceil((windowStart.getTime() + windowMs - now) / 1000);
  return { allowed: doc.count <= limit, retryAfter };
}

export function rateLimitedResponse(NextResponse, retryAfter) {
  return NextResponse.json(
    { message: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
