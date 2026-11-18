import mongoose from "mongoose";

// A seller-owned Amazon listing (Listings Items API), identified by seller
// account + marketplace + seller SKU (never by ASIN: one ASIN can have many
// sellers' offers). Holds the listing's own offer price and seller-fulfilled
// quantity; FBA quantities live in AmazonInventory. Only mapped fields are
// stored, never raw API responses. Deleted with its AmazonAccount.
const IssueSchema = new mongoose.Schema(
  {
    code: String,
    message: { type: String, maxlength: 1000 },
    severity: { type: String, enum: ["ERROR", "WARNING", "INFO"] },
    attributeNames: [String],
  },
  { _id: false },
);

const AmazonListingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amazonAccount: { type: mongoose.Schema.Types.ObjectId, ref: "AmazonAccount", required: true },
    environment: { type: String, enum: ["sandbox", "production"], required: true },
    marketplaceId: { type: String, required: true },
    sku: { type: String, required: true, maxlength: 200 },
    asin: { type: String, maxlength: 20 },
    productType: { type: String, maxlength: 100 },
    conditionType: { type: String, maxlength: 50 },
    statuses: { type: [String], default: [] }, // e.g. BUYABLE, DISCOVERABLE
    itemName: { type: String, maxlength: 500 },
    createdDate: Date,
    lastUpdatedDate: Date,
    // The seller's own offer (Listings Items `offers`).
    price: Number,
    currency: { type: String, maxlength: 3 },
    // DEFAULT = seller-fulfilled (MFN); AMAZON_* = FBA.
    fulfillmentChannel: { type: String, maxlength: 40 },
    // Seller-fulfilled quantity (Listings Items `fulfillmentAvailability`).
    quantity: Number,
    issues: { type: [IssueSchema], default: [] },
    // Where it came from: imported from Amazon, or created in SmartSell.
    origin: { type: String, enum: ["amazon", "smartsell"], default: "amazon" },
    // The last submission to Amazon and its processing result.
    submission: {
      operation: { type: String, enum: ["create", "update", "price", "quantity", "close", "delete"] },
      status: { type: String, enum: ["ACCEPTED", "INVALID", "VALID", "processing", "live", "failed"] },
      submissionId: String,
      submittedAt: Date,
      checkedAt: Date,
    },
    // Set while a write is in flight, so a duplicate submission is refused.
    pendingOperation: {
      type: { type: String },
      requestHash: String,
      startedAt: Date,
    },
    lastSyncedAt: Date,
  },
  { timestamps: true },
);

AmazonListingSchema.index({ amazonAccount: 1, marketplaceId: 1, sku: 1 }, { unique: true });
AmazonListingSchema.index({ user: 1, amazonAccount: 1, itemName: 1 });
AmazonListingSchema.index({ user: 1, asin: 1 });

export default mongoose.models.AmazonListing || mongoose.model("AmazonListing", AmazonListingSchema);
