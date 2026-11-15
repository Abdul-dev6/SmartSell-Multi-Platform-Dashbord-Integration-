import mongoose from "mongoose";

// Processing record for eBay Marketplace Account Deletion notifications,
// keyed by eBay's notificationId so a redelivered notification is
// recognised. Deliberately stores no personal data: not the eBay user ID,
// username or eiasToken (those are deleted, not recorded), only counts.
const EbayDeletionNotificationSchema = new mongoose.Schema(
  {
    notificationId: { type: String, required: true },
    environment: { type: String, enum: ["production", "sandbox"], required: true },
    status: { type: String, enum: ["processing", "completed", "failed"], required: true },
    attempts: { type: Number, default: 0 },
    // eBay's eventDate / publishDate (when the user asked; when it was sent).
    eventDate: Date,
    publishDate: Date,
    // What was removed (counts only).
    outcome: {
      accounts: Number,
      products: Number,
      notifications: Number,
    },
    processedAt: Date,
    lastError: String,
    // Records are kept for 90 days as evidence of processing, then removed.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

EbayDeletionNotificationSchema.index({ notificationId: 1 }, { unique: true });
EbayDeletionNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DELETION_RECORD_RETENTION_DAYS = 90;

export default mongoose.models.EbayDeletionNotification ||
  mongoose.model("EbayDeletionNotification", EbayDeletionNotificationSchema);
