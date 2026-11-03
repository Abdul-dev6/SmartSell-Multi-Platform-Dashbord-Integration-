import mongoose from "mongoose";

// In-app notifications: the outcome of a user's action (product saved,
// event deleted, sync failed, …). Shown as a toast and in the navbar bell.
const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["success", "error", "info"], required: true },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, maxlength: 500 },
    readAt: { type: Date, default: null },
    // Removed automatically after the retention period.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NOTIFICATION_RETENTION_DAYS = 30;

export default mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);
