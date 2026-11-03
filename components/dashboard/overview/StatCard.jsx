"use client";

// `value` is pre-formatted by the caller. `percentage` is a real
// period-over-period change, or null when there is no baseline.
const CardDashboard = ({ title, value, percentage, month, icon, goodWhenUp = true }) => {
  const Icon = icon; // Assign the icon component to a capitalized variable
  const hasChange = typeof percentage === "number";
  const isGood = hasChange && (percentage >= 0) === goodWhenUp;
  const tone = !hasChange
    ? "bg-slate-100 text-slate-500"
    : isGood
      ? "bg-green-300/10 text-green-600"
      : "bg-red-300/10 text-red-600";

  return (
    <>
      <div className="flex min-w-0 flex-col pt-2">
        <h1 className="text-sm sm:text-base font-medium text-slate-500 dark:text-slate-700">{title}</h1>
        <p className="pb-2 text-2xl font-semibold text-slate-900 dark:text-slate-800">{value}</p>
        <div className="flex items-center gap-2 text-[60%] sm:text-xs">
          <span className={`rounded-lg p-1 font-medium ${tone}`}>
            {hasChange ? `${percentage > 0 ? "+" : ""}${percentage}%` : "—"}
          </span>
          <span className="text-slate-400 truncate">{month}</span>
        </div>
      </div>
      <div className="flex py-4 px-4 bg-gradient-to-br from-indigo-500 to-sky-500 rounded-2xl shadow-lg shadow-indigo-500/20">
        <Icon className="text-2xl text-white" aria-hidden="true" />
      </div>
    </>
  );
};

export default CardDashboard;
