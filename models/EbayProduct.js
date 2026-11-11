import mongoose from "mongoose";

// A product on a seller's eBay account: an eBay inventory item (keyed by
// SKU) plus its offer on the account's marketplace, and the listing once the
// offer is published. Kept entirely separate from Shopify products.
const EbayProductSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    ebayAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EbayAccount",
      required: true,
    },

    // The seller-defined SKU that identifies the inventory item on eBay.
    sku: { type: String, required: true },
    // Equal to `sku` while the product is not archived, unset afterwards, so
    // a deleted SKU can be used again (see the unique index below).
    liveSku: String,

    // "ebay" = imported from the seller's eBay account; "smartsell" = created here.
    origin: { type: String, enum: ["ebay", "smartsell"], default: "smartsell" },

    // Client-supplied key for a SmartSell create request; a retried or
    // double-submitted request finds this record instead of creating twice.
    idempotencyKey: String,

    title: { type: String, required: true },
    description: String,
    condition: String,
    conditionDescription: String,
    // eBay leaf category and its readable path.
    categoryId: String,
    categoryName: String,
    // Item specifics: { "Brand": ["Apple"], "Color": ["Black", "Silver"] }.
    aspects: { type: mongoose.Schema.Types.Mixed, default: {} },
    imageUrls: { type: [String], default: [] },

    price: Number,
    currency: String,
    quantity: { type: Number, default: 0 },

    offerId: String,
    listingId: String,
    // "draft" = offer not published; "published" = live listing; "ended" =
    // listing withdrawn/ended on eBay.
    listingStatus: { type: String, enum: ["draft", "published", "ended"], default: "draft" },
    // The seller asked for this product to be listed (publish) or kept as a draft.
    publishRequested: { type: Boolean, default: true },

    ebayUpdatedAt: Date,

    // Synchronization metadata.
    syncStatus: { type: String, enum: ["synced", "pending", "failed"], default: "synced" },
    lastSyncedAt: Date,
    // Safe, user-facing summary of the last failure (no payloads or tokens).
    lastSyncError: String,

    // A SmartSell → eBay write that started but was not confirmed. eBay's
    // inventory writes are keyed by SKU, so a retry repeats the same calls.
    pendingOperation: {
      type: { type: String, enum: ["create", "update", "delete"] },
      startedAt: Date,
      attempts: { type: Number, default: 0 },
      input: mongoose.Schema.Types.Mixed,
      outcome: { type: String, enum: ["unknown", "rejected"] },
    },

    // Kept (not deleted) so order history and references stay intact.
    archivedAt: Date,
    archiveReason: { type: String, enum: ["deleted_in_ebay", "deleted_in_smartsell"] },
  },
  { timestamps: true },
);

EbayProductSchema.index({ user: 1, archivedAt: 1 });
// One live product per SKU per eBay account.
EbayProductSchema.index(
  { ebayAccount: 1, liveSku: 1 },
  { unique: true, partialFilterExpression: { liveSku: { $type: "string" } } },
);
EbayProductSchema.index(
  { ebayAccount: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
EbayProductSchema.index({ ebayAccount: 1, syncStatus: 1 });

export default mongoose.models.EbayProduct || mongoose.model("EbayProduct", EbayProductSchema);
