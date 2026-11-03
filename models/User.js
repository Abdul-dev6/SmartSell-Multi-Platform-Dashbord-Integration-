import mongoose from "mongoose";

const userschema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String },
    name: { type: String },
    // Raised by "Sign out everywhere"; sessions carrying an older value are
    // no longer accepted.
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model("User", userschema);

export default User;
