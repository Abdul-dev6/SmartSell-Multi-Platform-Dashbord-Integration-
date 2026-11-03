// Where to send the user after signing in. Only dashboard paths are allowed,
// so a crafted ?next= can't redirect to another site ("//evil.com",
// "https://…") or to an unrelated page.
export const DEFAULT_AFTER_LOGIN = "/Panel/Dashboard";

export function safeNextPath(next) {
  if (typeof next !== "string") return DEFAULT_AFTER_LOGIN;
  if (!/^\/Panel(\/[A-Za-z0-9_\-/[\].]*)?(\?[^#\s]*)?$/.test(next)) return DEFAULT_AFTER_LOGIN;
  if (next.includes("//") || next.includes("\\")) return DEFAULT_AFTER_LOGIN;
  return next;
}
