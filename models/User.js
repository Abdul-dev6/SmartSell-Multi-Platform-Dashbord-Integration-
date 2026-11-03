import mongoose from "mongoose";

const userschema = new mongoose.Schema(
  {
    // Always stored trimmed and lowercase, so lookups can use the unique
    // index with an exact match.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String },
    name: { type: String },
    // Raised by "Sign out everywhere"; sessions carrying an older value are
    // no longer accepted.
    sessionVersion: { type: Number, default: 0 },
    // Business settings used by the dashboard's calculated expenses.
    settings: {
      // Packaging cost per item shipped, in the store currency.
      packagingCostPerItem: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model("User", userschema);

export default User;
