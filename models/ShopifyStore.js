import mongoose from "mongoose";

// `id` is Shopify's location ID; Mongoose's own id/_id are disabled.
const LocationSchema = new mongoose.Schema(
  { id: String, name: String, active: Boolean },
  { _id: false, id: false },
);

const shopSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    shop: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // Never returned unless explicitly requested with .select("+accessToken").
    // Cleared when the store is disconnected.
    accessToken: {
      type: String,
      select: false,
    },

    status: {
      type: String,
      enum: ["active", "disconnected"],
      default: "active",
    },

    country: {
      type: String,
    },

    // Scopes actually granted by Shopify at the last authorization.
    scope: {
      type: String,
    },

    connectedAt: Date,
    disconnectedAt: Date,

    // From Shopify's shop settings; used for reporting.
    timezone: String,
    currency: String,
    // Shopify locations (id → name), so inventory shows names, not IDs.
    locations: [LocationSchema],

    // Synchronization state.
    lastSyncAt: Date,
    lastSyncStatus: {
      type: String,
      enum: ["success", "partial", "failed"],
    },
    lastSyncError: String,
    lastSyncCounts: {
      products: Number,
      archivedProducts: Number,
      inventoryLevels: Number,
      orders: Number,
      reconciledCreates: Number,
    },
    // Orders updated before this time are already stored; the next sync only
    // asks Shopify for orders updated since then (with a small overlap).
    ordersSyncedThrough: Date,
    // Prevents two syncs of the same store from running at once.
    syncLockedUntil: Date,

    // Shopify webhook subscriptions registered for this store.
    webhooks: {
      status: {
        type: String,
        enum: ["active", "partial", "not_configured", "failed", "inactive"],
      },
      callbackUrl: String,
      topics: [String],
      registeredAt: Date,
      lastError: String,
    },
  },
  { timestamps: true },
);

// A Shopify store belongs to exactly one SmartSell user.
shopSchema.index({ shop: 1 }, { unique: true });
shopSchema.index({ user: 1, shop: 1 }, { unique: true });

const Shopifystore =
  mongoose.models.Shopifystore || mongoose.model("Shopifystore", shopSchema);

export default Shopifystore;
