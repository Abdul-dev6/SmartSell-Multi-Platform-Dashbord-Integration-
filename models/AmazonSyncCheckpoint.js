import mongoose from "mongoose";

// Where an Amazon resource sync stopped, per seller account and resource:
// the page token to resume an interrupted sync, and the watermark for the
// next incremental sync (orders lastUpdatedAfter, finances postedAfter, ...).
const AmazonSyncCheckpointSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amazonAccount: { type: mongoose.Schema.Types.ObjectId, ref: "AmazonAccount", required: true },
    resource: { type: String, required: true },
    cursor: { type: String, maxlength: 4096 }, // nextToken / pageToken / paginationToken
    cursorStart: Date, // the window start the cursor belongs to
    watermark: Date, // completed up to here
    lastSuccessAt: Date,
    lastError: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);

AmazonSyncCheckpointSchema.index({ amazonAccount: 1, resource: 1 }, { unique: true });

export default mongoose.models.AmazonSyncCheckpoint || mongoose.model("AmazonSyncCheckpoint", AmazonSyncCheckpointSchema);
