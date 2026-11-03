import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
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

    // Absent only while a product created in SmartSell is waiting for
    // Shopify to confirm it (syncStatus "pending" or "failed").
    shopifyProductId: {
      type: String,
    },

    // "shopify" = imported by sync/webhook; "smartsell" = created in SmartSell.
    origin: {
      type: String,
      enum: ["shopify", "smartsell"],
      default: "shopify",
    },

    // Client-supplied key for a SmartSell create request. A retried or
    // double-submitted request finds this record instead of creating a second
    // Shopify product.
    idempotencyKey: {
      type: String,
    },

    title: {
      type: String,
      required: true,
    },

    handle: String,

    description: String,

    vendor: String,

    productType: String,

    status: String,

    tags: {
      type: [String],
      default: [],
    },

    variants: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    images: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    // Shopify Standard Product Taxonomy category: { id, name, fullName } or null.
    category: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Collections the product belongs to: [{ id, title, manual }]. Automated
    // (smart) collections have manual: false; Shopify assigns those by rules.
    collections: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },

    // Sales channels (publication IDs) the product is published to. Only
    // readable with read_publications; publishedOnKnown says whether it was.
    publishedOn: {
      type: [String],
      default: [],
    },
    publishedOnKnown: {
      type: Boolean,
      default: false,
    },

    // Shipping fields per variant ID: { requiresShipping, weight, weightUnit,
    // countryCodeOfOrigin, harmonizedSystemCode }. Kept apart from `variants`
    // because product webhooks replace variants without these fields.
    variantShipping: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    rawData: {
      type: mongoose.Schema.Types.Mixed,
    },

    shopifyUpdatedAt: Date,

    // Synchronization metadata.
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "failed"],
      default: "synced",
    },
    lastSyncedAt: Date,
    // Safe, user-facing summary of the last failure (no payloads or tokens).
    lastSyncError: String,

    // A SmartSell → Shopify write that has started but not been confirmed.
    // Lets a failed or interrupted write be retried or reconciled.
    pendingOperation: {
      type: {
        type: String,
        enum: ["create", "update", "delete"],
      },
      startedAt: Date,
      attempts: { type: Number, default: 0 },
      // The validated request, so the operation can be retried.
      input: mongoose.Schema.Types.Mixed,
      // "unknown": the request may have reached Shopify (timeout, 5xx), so a
      //   create must be looked up in Shopify before it is ever resent.
      // "rejected": Shopify did not apply it; resubmitting is safe.
      outcome: {
        type: String,
        enum: ["unknown", "rejected"],
      },
    },

    // Set when the product no longer exists in Shopify. The record is kept
    // so order history and references stay intact.
    archivedAt: Date,
    archiveReason: {
      type: String,
      enum: ["deleted_in_shopify", "deleted_in_smartsell"],
    },
  },
  {
    timestamps: true,
  },
);

ProductSchema.index({ user: 1, archivedAt: 1 });

// One local record per Shopify product. Partial, so pending SmartSell
// creates (no Shopify ID yet) don't collide with each other.
ProductSchema.index(
  {
    shopifyStore: 1,
    shopifyProductId: 1,
  },
  {
    unique: true,
    partialFilterExpression: { shopifyProductId: { $type: "string" } },
  },
);

ProductSchema.index(
  { shopifyStore: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

// Finds writes that need retrying or reconciling.
ProductSchema.index({ shopifyStore: 1, syncStatus: 1 });
// Inventory webhooks look up which product owns an inventory item.
ProductSchema.index({ shopifyStore: 1, "variants.inventoryItemId": 1 });

// Matches products that exist in Shopify (excludes pending SmartSell creates).
export const HAS_SHOPIFY_ID = { shopifyProductId: { $type: "string" } };

export default mongoose.models.Product ||
  mongoose.model("Product", ProductSchema);
