import mongoose from "mongoose";

// FBA inventory (FBA Inventory API getInventorySummaries) per seller account,
// marketplace and seller SKU. Read only: Amazon does not let sellers change
// FBA warehouse quantities through the API (its write operations are
// sandbox-only). Seller-fulfilled quantities live on AmazonListing.
const AmazonInventorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amazonAccount: { type: mongoose.Schema.Types.ObjectId, ref: "AmazonAccount", required: true },
    environment: { type: String, enum: ["sandbox", "production"], required: true },
    marketplaceId: { type: String, required: true },
    sellerSku: { type: String, required: true, maxlength: 200 },
    asin: String,
    fnSku: String,
    condition: String,
    productName: { type: String, maxlength: 500 },
    totalQuantity: Number,
    fulfillableQuantity: Number,
    inboundWorkingQuantity: Number,
    inboundShippedQuantity: Number,
    inboundReceivingQuantity: Number,
    reservedQuantity: Number,
    researchingQuantity: Number,
    unfulfillableQuantity: Number,
    amazonUpdatedAt: Date,
    lastSyncedAt: Date,
  },
  { timestamps: true },
);

AmazonInventorySchema.index({ amazonAccount: 1, marketplaceId: 1, sellerSku: 1 }, { unique: true });
AmazonInventorySchema.index({ user: 1, amazonAccount: 1 });

export default mongoose.models.AmazonInventory || mongoose.model("AmazonInventory", AmazonInventorySchema);
