import { NextResponse } from "next/server";
import User from "@/models/User";
import { requireUser } from "@/lib/auth/GetCurrentUser";

// The signed-in user's own profile (never the password hash).
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const hasPassword = Boolean(await User.exists({ _id: user._id, password: { $exists: true, $ne: null } }));

    return NextResponse.json({
      success: true,
      user: {
        name: user.name || null,
        email: user.email,
        createdAt: user.createdAt,
        signInMethod: hasPassword ? "password" : "google_or_github",
      },
    });
  } catch (error) {
    console.error("Current user error:", error.name, error.message);
    return NextResponse.json({ success: false, message: "Could not load your profile." }, { status: 500 });
  }
}
