import mongoose from "mongoose";

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
    },

    description: {
      type: String,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "USD",
    },

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
