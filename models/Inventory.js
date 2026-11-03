import mongoose from "mongoose";

const InventorySchema = new mongoose.Schema(
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

    inventoryItemId: {
      type: String,
      required: true,
    },

    inventoryLevelId: {
      type: String,
    },

    locationId: {
      type: String,
    },

    // null when Shopify does not track quantity for the item (not the same as 0).
    available: {
      type: Number,
      default: null,
    },

    productId: {
      type: String,
    },

    variantId: {
      type: String,
    },

    rawData: {
      type: mongoose.Schema.Types.Mixed,
    },

    shopifyUpdatedAt: {
      type: Date,
    },

    // Set when Shopify no longer stocks the item at this location
    // (inventory_levels/disconnect, or absent from a full sync). Hidden, not
    // deleted, so a delayed older update cannot bring the level back.
    disconnectedAt: {
      type: Date,
      default: null,
    },

    lastSyncedAt: Date,
  },
  {
    timestamps: true,
  },
);

InventorySchema.index(
  {
    shopifyStore: 1,
    inventoryItemId: 1,
    locationId: 1,
  },
  {
    unique: true,
  },
);

export default mongoose.models.Inventory ||
  mongoose.model("Inventory", InventorySchema);
