import mongoose from "mongoose";

// A user's own calendar entry (Panel → Calendar).
const CalendarEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 1000, default: "" },
    // Calendar days as "YYYY-MM-DD" (no time zone conversion).
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    // e.g. "09:00 AM – 10:00 AM"
    time: { type: String, required: true, maxlength: 40 },
    color: { type: String, required: true },
  },
  { timestamps: true },
);

CalendarEventSchema.index({ user: 1, date: 1 });

export default mongoose.models.CalendarEvent ||
  mongoose.model("CalendarEvent", CalendarEventSchema);
