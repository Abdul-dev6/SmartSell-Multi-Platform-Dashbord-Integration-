import { NextResponse } from "next/server";
import User from "@/models/User";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { signedOutResponse } from "@/lib/auth/signOut";

// Signs the account out on every device: sessions carry the account's
// session version, and raising it makes all existing sessions invalid.
export async function POST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    return signedOutResponse({ success: true, message: "Signed out on all devices." });
  } catch (error) {
    console.error("Sign out everywhere error:", error.name, error.message);
    return NextResponse.json(
      { success: false, message: "Could not sign out other devices. Please try again." },
      { status: 500 },
    );
  }
}
