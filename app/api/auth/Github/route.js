import { completeSocialLogin } from "@/lib/auth/socialLogin";

export async function GET(req) {
  return completeSocialLogin(req, "github");
}
