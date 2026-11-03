import { signedOutResponse } from "@/lib/auth/signOut";

// Signs out this browser only (see /api/auth/logout-all for every device).
export async function POST() {
  return signedOutResponse();
}
