import mongoose from "mongoose";

// An Amazon order (Orders API 2026-01-01), identified by seller account +
// Amazon order ID. Explicit allowlist: no buyer or recipient data, no
// addresses, no packages, no payment details, and never the raw response.
const MoneySchema = new mongoose.Schema({ amount: Number, currency: { type: String, maxlength: 3 } }, { _id: false });

const OrderItemSchema = new mongoose.Schema(
  {
    orderItemId: { type: String, required: true },
    asin: String,
    sellerSku: String,
    title: { type: String, maxlength: 500 },
    quantityOrdered: Number,
    quantityFulfilled: Number,
    quantityUnfulfilled: Number,
    unitPrice: MoneySchema,
    proceeds: MoneySchema,
    cancelled: Boolean,
  },
  { _id: false },
);

const AmazonOrderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amazonAccount: { type: mongoose.Schema.Types.ObjectId, ref: "AmazonAccount", required: true },
    environment: { type: String, enum: ["sandbox", "production"], required: true },
    orderId: { type: String, required: true, maxlength: 40 },
    marketplaceId: String,
    salesChannel: String,
    createdTime: Date,
    lastUpdatedTime: Date,
    // PENDING, UNSHIPPED, PARTIALLY_SHIPPED, SHIPPED, CANCELLED, ...
    status: String,
    fulfilledBy: String, // MERCHANT or AMAZON
    total: MoneySchema,
    items: { type: [OrderItemSchema], default: [] },
    lastSyncedAt: Date,
  },
  { timestamps: true },
);

AmazonOrderSchema.index({ amazonAccount: 1, orderId: 1 }, { unique: true });
AmazonOrderSchema.index({ user: 1, amazonAccount: 1, createdTime: -1 });

export default mongoose.models.AmazonOrder || mongoose.model("AmazonOrder", AmazonOrderSchema);
