"use client";
import { useState } from "react";
import LoadState from "@/components/dashboard/shared/LoadState";
import useApiData from "@/components/dashboard/shared/useApiData";

/* ── constants ── */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = [
  { name: "Indigo", bg: "bg-indigo-500", dot: "bg-indigo-500", hex: "#6366f1" },
  { name: "Sky", bg: "bg-sky-500", dot: "bg-sky-500", hex: "#0ea5e9" },
  {
    name: "Emerald",
    bg: "bg-emerald-500",
    dot: "bg-emerald-500",
    hex: "#10b981",
  },
  { name: "Rose", bg: "bg-rose-500", dot: "bg-rose-500", hex: "#f43f5e" },
  { name: "Amber", bg: "bg-amber-500", dot: "bg-amber-500", hex: "#f59e0b" },
  { name: "Violet", bg: "bg-violet-500", dot: "bg-violet-500", hex: "#8b5cf6" },
];
const HOURS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);
const MINS = ["00", "15", "30", "45"];
const pad = (n) => String(n).padStart(2, "0");

/* ── date helpers ── */
function getDaysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}
function getFirstDay(y, m) {
  return new Date(y, m, 1).getDay();
}
function toStr(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function todayStr() {
  const t = new Date();
  return toStr(t.getFullYear(), t.getMonth(), t.getDate());
}

/* ── sub: DateRow ── */
function DateRow({ y, m, d, setY, setM, setD }) {
  const years = [-1, 0, 1, 2].map((o) => new Date().getFullYear() + o);
  return (
    <div className="flex gap-1">
      <select
        value={m}
        onChange={(e) => {
          setM(+e.target.value);
          setD(1);
        }}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {MONTHS.map((mn, i) => (
          <option key={i} value={i}>
            {mn.slice(0, 3)}
          </option>
        ))}
      </select>
      <select
        value={d}
        onChange={(e) => setD(+e.target.value)}
        className="w-14 border border-gray-200 rounded-lg px-1 py-2 text-sm bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {Array.from({ length: getDaysInMonth(y, m) }, (_, i) => i + 1).map(
          (dd) => (
            <option key={dd}>{pad(dd)}</option>
          ),
        )}
      </select>
      <select
        value={y}
        onChange={(e) => setY(+e.target.value)}
        className="w-20 border border-gray-200 rounded-lg px-1 py-2 text-sm bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {years.map((yr) => (
          <option key={yr}>{yr}</option>
        ))}
      </select>
    </div>
  );
}

/* ── sub: TimeRow ── */
function TimeRow({ h, mi, ap, setH, setMi, setAp }) {
  return (
    <div className="flex gap-1">
      <select
        value={h}
        onChange={(e) => setH(e.target.value)}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {HOURS.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <select
        value={mi}
        onChange={(e) => setMi(e.target.value)}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {MINS.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <select
        value={ap}
        onChange={(e) => setAp(e.target.value)}
        className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}

/* ── Modal ── */
function Modal({ prefillDate, onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const base = prefillDate || todayStr();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState(COLORS[0].hex);
  const [err, setErr] = useState("");

  const [sY, setSY] = useState(+base.slice(0, 4));
  const [sM, setSM] = useState(+base.slice(5, 7) - 1);
  const [sD, setSD] = useState(+base.slice(8, 10));
  const [sH, setSH] = useState("09");
  const [sMi, setSMi] = useState("00");
  const [sAp, setSAp] = useState("AM");
  const [eY, setEY] = useState(+base.slice(0, 4));
  const [eM, setEM] = useState(+base.slice(5, 7) - 1);
  const [eD, setED] = useState(+base.slice(8, 10));
  const [eH, setEH] = useState("10");
  const [eMi, setEMi] = useState("00");
  const [eAp, setEAp] = useState("AM");

  async function save() {
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    const error = await onSave({
      date: toStr(sY, sM, sD),
      endDate: toStr(eY, eM, eD),
      time: `${sH}:${sMi} ${sAp} – ${eH}:${eMi} ${eAp}`,
      title: title.trim(),
      description: desc.trim(),
      color,
    });
    setSaving(false);
    if (error) {
      setErr(error);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* header */}
        <div className="bg-gray-900 px-7 py-5 relative">
          <p className="text-xs font-bold tracking-widest text-indigo-400 uppercase mb-1">
            New Event
          </p>
          <h2 className="text-white text-lg font-bold">Add to Calendar</h2>
          <button
            onClick={onClose}
            className="absolute top-4 right-5 text-gray-500 hover:text-white text-2xl leading-none bg-transparent border-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="px-7 py-6 flex flex-col gap-4">
          {err && <p className="text-rose-500 text-xs font-semibold">{err}</p>}

          {/* title */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Team standup"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* desc */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Description
            </label>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional note"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Start Date
              </label>
              <DateRow
                y={sY}
                m={sM}
                d={sD}
                setY={setSY}
                setM={setSM}
                setD={setSD}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                End Date
              </label>
              <DateRow
                y={eY}
                m={eM}
                d={eD}
                setY={setEY}
                setM={setEM}
                setD={setED}
              />
            </div>
          </div>

          {/* times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Start Time
              </label>
              <TimeRow
                h={sH}
                mi={sMi}
                ap={sAp}
                setH={setSH}
                setMi={setSMi}
                setAp={setSAp}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                End Time
              </label>
              <TimeRow
                h={eH}
                mi={eMi}
                ap={eAp}
                setH={setEH}
                setMi={setEMi}
                setAp={setEAp}
              />
            </div>
          </div>

          {/* color */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Color
            </label>
            <div className="flex gap-3">
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                  className={`w-7 h-7 rounded-full ${c.bg} cursor-pointer transition-transform`}
                  style={{
                    border:
                      color === c.hex
                        ? "3px solid #1e1b4b"
                        : "3px solid transparent",
                    outline: color === c.hex ? "2px solid #c7d2fe" : "none",
                    transform: color === c.hex ? "scale(1.25)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-6 py-2 rounded-xl bg-indigo-500 text-white text-sm font-bold hover:bg-indigo-600 cursor-pointer shadow-md disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function UpcomingEvents() {
  const now = new Date();
  const TODAY = todayStr();

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [modal, setModal] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const { body, error: loadError, loading, reload } = useApiData("/api/calendar-events");
  const events = body?.data || [];
  const [actionError, setActionError] = useState(null);

  /* navigation */
  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  }
  function goToday() {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }

  function openModal(date = null) {
    setPrefill(date);
    setModal(true);
  }
  // Returns an error message for the modal, or null on success.
  async function addEvent(ev) {
    try {
      const response = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ev),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return data.message || "Could not save the event.";
      await reload();
      return null;
    } catch {
      return "Could not reach the server.";
    }
  }
  async function deleteEvent(event) {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    setActionError(null);
    try {
      const response = await fetch(`/api/calendar-events/${event.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not delete the event.");
      await reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  function eventsOn(dateStr) {
    return events.filter((e) => e.date <= dateStr && e.endDate >= dateStr);
  }

  const dim = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDay(viewYear, viewMonth);
  const totalCells = Math.ceil((firstDay + dim) / 7) * 7;
  const upcoming = events.filter((e) => e.endDate >= TODAY);

  const isCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      {modal && (
        <Modal
          prefillDate={prefill}
          onSave={addEvent}
          onClose={() => setModal(false)}
        />
      )}

      {/* page header */}
      <div className="max-w-6xl mx-auto">
        <LoadState loading={loading && !body} error={loadError} onRetry={reload} />
        {actionError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {actionError}
          </p>
        )}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              My Calendar
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {now.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-lg cursor-pointer transition-colors"
          >
            <span className="text-xl leading-none">+</span> New Event
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* ── CALENDAR ── */}
          <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm p-6">
            {/* nav */}
            <div className="flex items-center gap-3 mb-6 justify-between">
              <div className="flex gap-2 items-center">
                <h2 className="flex-1 text-xl font-extrabold text-gray-900">
                  {MONTHS[viewMonth]}&nbsp;
                  <span className="font-medium text-gray-400">{viewYear}</span>
                </h2>
                <button
                  onClick={prevMonth}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-600 font-bold text-lg cursor-pointer transition-colors"
                >
                  ‹
                </button>
                <button
                  onClick={nextMonth}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-600 font-bold text-lg cursor-pointer transition-colors"
                >
                  ›
                </button>
              </div>
              {!isCurrentMonth && (
                <button
                  onClick={goToday}
                  className="text-xs font-bold tracking-wider text-indigo-500 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors"
                >
                  TODAY
                </button>
              )}
            </div>

            {/* weekday labels */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-bold text-gray-300 uppercase tracking-widest pb-2"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: totalCells }, (_, idx) => {
                const dayNum = idx - firstDay + 1;
                const inMonth = dayNum >= 1 && dayNum <= dim;
                const dateStr = inMonth
                  ? toStr(viewYear, viewMonth, dayNum)
                  : null;
                const isToday = dateStr === TODAY;
                const dayEvs = dateStr ? eventsOn(dateStr) : [];
                const isPast = dateStr && dateStr < TODAY;

                return (
                  <div
                    key={idx}
                    onClick={() => inMonth && openModal(dateStr)}
                    className={[
                      "relative rounded-xl p-1.5 h-[60px] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full flex flex-col items-center transition-colors",
                      inMonth
                        ? "cursor-pointer"
                        : "opacity-0 pointer-events-none",
                      isToday
                        ? "bg-indigo-500"
                        : dayEvs.length > 0
                          ? "bg-indigo-50 hover:bg-indigo-100"
                          : isPast
                            ? "hover:bg-gray-50"
                            : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {/* day number */}
                    <span
                      className={[
                        "w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold",
                        isToday
                          ? "text-white"
                          : isPast
                            ? "text-gray-300"
                            : "text-gray-800",
                      ].join(" ")}
                    >
                      {inMonth ? dayNum : ""}
                    </span>

                    {/* event dots */}
                    {dayEvs.length > 0 && (
                      <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                        {dayEvs.slice(0, 3).map((ev, i) => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full inline-block"
                            style={{
                              background: isToday
                                ? "rgba(255,255,255,0.8)"
                                : ev.color,
                            }}
                          />
                        ))}
                        {dayEvs.length > 3 && (
                          <span
                            className={`text-[9px] leading-none ${isToday ? "text-white/70" : "text-gray-400"}`}
                          >
                            +{dayEvs.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-gray-300 mt-4">
              Click any date to add an event
            </p>
          </div>

          {/* ── SIDEBAR ── */}
          <div className="flex flex-col gap-5">
            {/* upcoming */}
            <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col h-[400px]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 shrink-0">
                Upcoming Events
              </p>
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full pr-2">
                {upcoming.length === 0 && (
                  <p className="text-gray-300 text-sm">No upcoming events</p>
                )}
                {upcoming.map((ev, i) => (
                  <div
                    key={ev.id || i}
                    className={`flex gap-3 items-start py-3 ${i < upcoming.length - 1 ? "border-b border-gray-50" : ""}`}
                  >
                    <div
                      className="w-1 rounded-full flex-shrink-0 mt-0.5"
                      style={{ background: ev.color, minHeight: 40 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {ev.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ev.date}
                        {ev.endDate !== ev.date ? ` → ${ev.endDate}` : ""}
                      </p>
                      <p className="text-xs text-gray-400">{ev.time}</p>
                    </div>
                    <button
                      onClick={() => deleteEvent(ev)}
                      aria-label={`Delete ${ev.title}`}
                      className="text-gray-400 hover:text-rose-500 cursor-pointer p-1 transition-colors"
                      title="Delete Event"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* color legend */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                Colors
              </p>
              <div className="flex flex-wrap gap-3">
                {COLORS.map((c) => (
                  <div key={c.hex} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                    <span className="text-xs text-gray-500">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
