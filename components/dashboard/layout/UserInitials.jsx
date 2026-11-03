// Avatar showing the signed-in user's initials (no stock photo).
export default function UserInitials({ user, className = "" }) {
  const source = (user?.name || user?.email || "").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 font-semibold text-white ${className}`}
    >
      {initials || "?"}
    </span>
  );
}
