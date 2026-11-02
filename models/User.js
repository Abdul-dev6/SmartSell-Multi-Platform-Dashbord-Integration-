import mongoose from "mongoose";

const userschema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String },
    name: { type: String },
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model("User", userschema);

export default User;
