import mongoose from "mongoose";

// Amazon financial data per seller account, keyed by Amazon's stable IDs:
//   kind "transaction"  Finances API 2024-06-19 listTransactions (transactionId)
//   kind "event_group"  Finances API v0 listFinancialEventGroups (settlement
//                       groups, FinancialEventGroupId)
// Allowlisted fields only: no payment references, bank account digits, trace
// IDs or other context data.
const MoneySchema = new mongoose.Schema({ amount: Number, currency: { type: String, maxlength: 3 } }, { _id: false });

const BreakdownSchema = new mongoose.Schema(
  { type: { type: String }, amount: MoneySchema, breakdowns: { type: [mongoose.Schema.Types.Mixed], default: undefined } },
  { _id: false },
);

const AmazonFinancialEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amazonAccount: { type: mongoose.Schema.Types.ObjectId, ref: "AmazonAccount", required: true },
    environment: { type: String, enum: ["sandbox", "production"], required: true },
    kind: { type: String, enum: ["transaction", "event_group"], required: true },
    eventId: { type: String, required: true, maxlength: 200 },
    // transaction
    transactionType: String,
    transactionStatus: String,
    description: { type: String, maxlength: 300 },
    postedDate: Date,
    marketplaceId: String,
    orderId: String,
    relatedIdentifiers: { type: [{ name: String, value: String, _id: false }], default: [] },
    total: MoneySchema,
    breakdowns: { type: [BreakdownSchema], default: [] },
    // event group (settlement)
    processingStatus: String,
    fundTransferStatus: String,
    fundTransferDate: Date,
    groupStart: Date,
    groupEnd: Date,
    originalTotal: MoneySchema,
    beginningBalance: MoneySchema,
    lastSyncedAt: Date,
  },
  { timestamps: true },
);

AmazonFinancialEventSchema.index({ amazonAccount: 1, kind: 1, eventId: 1 }, { unique: true });
AmazonFinancialEventSchema.index({ user: 1, amazonAccount: 1, postedDate: -1 });

export default mongoose.models.AmazonFinancialEvent || mongoose.model("AmazonFinancialEvent", AmazonFinancialEventSchema);
