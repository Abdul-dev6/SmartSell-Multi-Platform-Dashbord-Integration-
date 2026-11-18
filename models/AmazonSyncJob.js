import mongoose from "mongoose";

// A durable Amazon sync run for one seller account, processed by the cron
// worker (/api/amazon/sync/process) or a manual sync. Each resource has its
// own status; the job is "partial" when some resources failed. `active` is
// true while queued or running, and a partial unique index allows only one
// active job per account (no duplicate or concurrent syncs).
export const SYNC_RESOURCES = ["marketplaces", "listings", "fbaInventory", "orders", "transactions", "eventGroups"];

const ResourceSchema = new mongoose.Schema(
  {
    name: { type: String, enum: SYNC_RESOURCES, required: true },
    status: { type: String, enum: ["pending", "running", "completed", "failed", "skipped"], default: "pending" },
    error: { type: String, maxlength: 200 },
    count: { type: Number, default: 0 },
    startedAt: Date,
    finishedAt: Date,
  },
  { _id: false },
);

const AmazonSyncJobSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amazonAccount: { type: mongoose.Schema.Types.ObjectId, ref: "AmazonAccount", required: true },
    kind: { type: String, enum: ["initial", "incremental", "manual"], required: true },
    status: { type: String, enum: ["queued", "running", "completed", "partial", "failed", "cancelled"], default: "queued" },
    active: { type: Boolean, default: true },
    resources: { type: [ResourceSchema], default: [] },
    lockedUntil: Date,
    runs: { type: Number, default: 0 },
    error: { type: String, maxlength: 200 },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true },
);

AmazonSyncJobSchema.index({ amazonAccount: 1 }, { unique: true, partialFilterExpression: { active: true }, name: "one_active_job_per_account" });
AmazonSyncJobSchema.index({ active: 1, createdAt: 1 });
AmazonSyncJobSchema.index({ user: 1, amazonAccount: 1, createdAt: -1 });

export default mongoose.models.AmazonSyncJob || mongoose.model("AmazonSyncJob", AmazonSyncJobSchema);
