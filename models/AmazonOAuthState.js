import mongoose from "mongoose";

// Server-side OAuth state for the Amazon website authorization workflow.
// Only the SHA-256 hash of the state is stored. It is bound to the SmartSell
// user, single use (consumed with findOneAndDelete) and expires after ten
// minutes (checked on use, and removed later by the TTL index).
//   purpose "consent"   state put on Seller Central's consent URL
//   purpose "callback"  state the log-in URI sends back to Amazon, which
//                       Amazon returns to the redirect URI
const AmazonOAuthStateSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: ["consent", "callback"], required: true },
    sellingPartnerId: { type: String, maxlength: 64 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AmazonOAuthStateSchema.index({ stateHash: 1 }, { unique: true });
AmazonOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export default mongoose.models.AmazonOAuthState || mongoose.model("AmazonOAuthState", AmazonOAuthStateSchema);
