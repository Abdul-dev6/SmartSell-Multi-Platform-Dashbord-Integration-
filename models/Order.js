import mongoose from "mongoose";

const LineItemSchema = new mongoose.Schema(
  {
    productId: String,
    variantId: String,
    title: String,
    variantTitle: String,
    sku: String,
    quantity: Number,
    price: Number,
  },
  { _id: false },
);

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    shopifyStore: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopifystore",
      required: true,
    },

    shopifyOrderId: {
      type: String,
      required: true,
    },

    orderNumber: String,
    // Display name, e.g. "#1001".
    name: String,

    // Only what the dashboard shows; addresses and the raw payload are not stored.
    customer: {
      name: String,
      email: String,
    },

    lineItems: {
      type: [LineItemSchema],
      default: [],
    },

    // Amounts are in the shop currency.
    currency: String,
    totalPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    // Reflects order edits, returns and refunds.
    currentTotalPrice: Number,
    subtotalPrice: Number,
    totalTax: Number,
    totalDiscounts: Number,

    financialStatus: String,
    fulfillmentStatus: String,
    cancelledAt: Date,
    // Set when the order was deleted in Shopify (webhook or reconciliation).
    // The record is kept but excluded from every view and figure.
    deletedAt: Date,

    shopifyCreatedAt: Date,
    shopifyUpdatedAt: Date,
    lastSyncedAt: Date,
  },
  { timestamps: true },
);

OrderSchema.index({ shopifyStore: 1, shopifyOrderId: 1 }, { unique: true });
OrderSchema.index({ user: 1, shopifyCreatedAt: -1 });

const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

export default Order;
