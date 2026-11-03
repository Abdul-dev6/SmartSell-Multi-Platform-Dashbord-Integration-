import mongoose from "mongoose";

export const EXPENSE_CATEGORIES = [
  "advertising",
  "shipping",
  "marketplace_fees",
  "payment_fees",
  "inventory",
  "packaging",
  "software",
  "salaries",
  "rent",
  "other",
];

const ExpenseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    shopifyStore: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shopifystore",
    },

    category: {
      type: String,
      required: true,
      enum: EXPENSE_CATEGORIES,
    },

    description: {
      type: String,
      maxlength: 500,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
      max: 1e9,
    },

    // ISO 4217 code. Only expenses in the store's currency are included in
    // dashboard profit (there is no currency conversion).
    currency: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    // Stored at 12:00 UTC of the chosen day so it stays on that calendar day
    // in store time zones from UTC-11 to UTC+11.
    date: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

ExpenseSchema.index({
  user: 1,
  date: 1,
});

export default mongoose.models.Expense ||
  mongoose.model("Expense", ExpenseSchema);
