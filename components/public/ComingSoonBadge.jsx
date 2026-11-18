// Small "Coming soon" pill for marketplaces SmartSell does not support yet.
// tone="light" on white backgrounds, tone="dark" on dark sections.
const TONES = {
  light: "bg-amber-50 text-amber-700 ring-amber-200",
  dark: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
};

export default function ComingSoonBadge({ tone = "light", className = "" }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[0.65rem] font-semibold uppercase tracking-wide ring-1 ring-inset ${TONES[tone] || TONES.light} ${className}`}
    >
      Coming soon
    </span>
  );
}
