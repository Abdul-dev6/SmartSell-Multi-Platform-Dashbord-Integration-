import mongoose from "mongoose";

// An eBay seller account a SmartSell user authorized through OAuth.
// Kept entirely separate from Shopify stores.
const EbayAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    environment: {
      type: String,
      enum: ["sandbox", "production"],
      required: true,
    },

    // eBay's immutable user ID (Identity API), and the display username.
    ebayUserId: { type: String, required: true },
    username: String,

    marketplaceId: { type: String, required: true },

    // AES-256-GCM encrypted (lib/ebay/crypto.js). Never returned unless
    // explicitly selected; cleared on disconnect.
    refreshTokenEnc: { type: String, select: false },
    refreshTokenExpiresAt: Date,
    accessTokenEnc: { type: String, select: false },
    accessTokenExpiresAt: Date,

    // Scopes granted at the last authorization.
    scopes: { type: [String], default: [] },

    // "reauth_required": eBay refused the refresh token (revoked, expired);
    // the seller must connect again.
    status: {
      type: String,
      enum: ["active", "reauth_required", "disconnected"],
      default: "active",
    },
    connectedAt: Date,
    disconnectedAt: Date,
    // Safe, user-facing summary of the last account-level failure.
    lastError: String,

    // Listing prerequisites read from the seller's eBay account (stage 2).
    setup: {
      checkedAt: Date,
      ready: { type: Boolean, default: false },
      merchantLocationKey: String,
      fulfillmentPolicyId: String,
      paymentPolicyId: String,
      returnPolicyId: String,
      // Readable names for the UI.
      policyNames: {
        fulfillment: String,
        payment: String,
        return: String,
      },
      issues: { type: [String], default: [] },
    },

    // Import of the seller's existing eBay inventory (stage 4).
    lastSyncAt: Date,
    lastSyncStatus: { type: String, enum: ["success", "partial", "failed"] },
    lastSyncError: String,
    lastSyncCounts: {
      products: Number,
      archivedProducts: Number,
    },
    syncLockedUntil: Date,
  },
  { timestamps: true },
);

// An eBay account belongs to exactly one SmartSell user per environment.
EbayAccountSchema.index({ environment: 1, ebayUserId: 1 }, { unique: true });
EbayAccountSchema.index({ user: 1, status: 1 });

const EbayAccount =
  mongoose.models.EbayAccount || mongoose.model("EbayAccount", EbayAccountSchema);

export default EbayAccount;
