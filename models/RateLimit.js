import mongoose from "mongoose";

const RateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

RateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
// MongoDB removes documents once expiresAt has passed.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimit ||
  mongoose.model("RateLimit", RateLimitSchema);
