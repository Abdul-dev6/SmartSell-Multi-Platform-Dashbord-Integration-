import mongoose from "mongoose";

// One record per run of the daily recovery worker, so its outcome can be
// shown in the app (Vercel keeps runtime logs only briefly).
const CronRunSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, required: true },
    finishedAt: Date,
    status: { type: String, enum: ["success", "failed"], required: true },
    // Totals across all stores; never shown to users (see lib/observability/health.js).
    processed: Number,
    failed: Number,
    reconciliation: { due: Number, synced: Number, failed: Number, skipped: Number },
    error: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false },
);

CronRunSchema.index({ startedAt: -1 });
CronRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CRON_RUN_RETENTION_DAYS = 30;

export default mongoose.models.CronRun || mongoose.model("CronRun", CronRunSchema);
