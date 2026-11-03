import { NextResponse } from "next/server";
import User from "@/models/User";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { logError } from "@/lib/observability/log";
import { withNotification } from "@/lib/notifyRoute";

const MAX_NAME = 80;
const MONEY_RE = /^\d{1,6}(\.\d{1,2})?$/;

async function profileOf(user) {
  const hasPassword = Boolean(await User.exists({ _id: user._id, password: { $exists: true, $ne: null } }));
  return {
    name: user.name || null,
    email: user.email,
    createdAt: user.createdAt,
    signInMethod: hasPassword ? "password" : "google_or_github",
    settings: { packagingCostPerItem: user.settings?.packagingCostPerItem ?? 0 },
  };
}

// The signed-in user's own profile (never the password hash).
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;
    return NextResponse.json({ success: true, user: await profileOf(user) });
  } catch (error) {
    logError(req, "Current user error", error);
    return NextResponse.json({ success: false, message: "Could not load your profile." }, { status: 500 });
  }
}

// Updates the profile: { name?, packagingCostPerItem? }. The email is the
// sign-in identity and is not changed here.
async function handlePATCH(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const body = (await readJsonBody(req)) || {};
    const errors = {};
    const set = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : null;
      if (name === null || name.length > MAX_NAME) errors.name = `Name must be text of at most ${MAX_NAME} characters.`;
      else set.name = name;
    }
    if (body.packagingCostPerItem !== undefined) {
      const raw = typeof body.packagingCostPerItem === "number" ? String(body.packagingCostPerItem) : body.packagingCostPerItem;
      if (typeof raw !== "string" || !MONEY_RE.test(raw.trim())) {
        errors.packagingCostPerItem = "Enter an amount of 0 or more, with up to 2 decimals.";
      } else {
        set["settings.packagingCostPerItem"] = Number(raw);
      }
    }

    if (Object.keys(errors).length) {
      return NextResponse.json({ success: false, message: Object.values(errors)[0], errors }, { status: 400 });
    }
    if (!Object.keys(set).length) {
      return NextResponse.json({ success: false, message: "No changes to save." }, { status: 400 });
    }

    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: set },
      { returnDocument: "after", runValidators: true },
    ).select("-password");
    return NextResponse.json({ success: true, user: await profileOf(updated) });
  } catch (error) {
    logError(req, "Update profile error", error);
    return NextResponse.json({ success: false, message: "Could not save your profile." }, { status: 500 });
  }
}

export const PATCH = withNotification(handlePATCH, () => ({ success: "Profile updated", failure: "Profile not updated" }));
