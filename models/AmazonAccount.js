import mongoose from "mongoose";

// An Amazon seller account connected by a SmartSell user (sandbox or
// production). The refresh token is AES-256-GCM encrypted
// (lib/security/secrets) and never returned unless selected explicitly. No
// buyer data is stored anywhere in the Amazon integration.
const MarketplaceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: String,
    countryCode: String,
    currency: String,
    isParticipating: Boolean,
  },
  { _id: false },
);

const AmazonAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    environment: { type: String, enum: ["sandbox", "production"], required: true },
    sellingPartnerId: { type: String, required: true, maxlength: 64 },
    region: { type: String, enum: ["na"], required: true },
    marketplaceIds: { type: [String], default: [] },
    marketplaces: { type: [MarketplaceSchema], default: [] },
    refreshTokenEnc: { type: String, select: false },
    // reconnect_required: Amazon refused the refresh token (invalid_grant);
    // syncs stop and history is kept until the seller reconnects or
    // disconnects.
    // disconnecting: deletion in progress (syncs and writes stop).
    status: { type: String, enum: ["active", "reconnect_required", "disconnecting"], default: "active" },
    connectedAt: { type: Date, default: Date.now },
    reconnectRequiredAt: Date,
    lastSyncAt: Date,
    lastSuccessfulSyncAt: Date,
    lastError: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);

// One SmartSell owner per seller account and environment; reconnecting the
// same seller updates this record.
AmazonAccountSchema.index({ environment: 1, sellingPartnerId: 1 }, { unique: true });

export default mongoose.models.AmazonAccount || mongoose.model("AmazonAccount", AmazonAccountSchema);
