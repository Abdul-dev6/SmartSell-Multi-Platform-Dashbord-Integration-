// Matches the colours and time options offered by the calendar page.
export const CALENDAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f43f5e", "#f59e0b", "#8b5cf6"];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = "(0[1-9]|1[0-2]):(00|15|30|45) (AM|PM)";
const TIME_RE = new RegExp(`^${CLOCK} – ${CLOCK}$`);

function isCalendarDate(value) {
  const match = typeof value === "string" ? value.match(DATE_RE) : null;
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Returns { value, errors } for a new event.
export function validateCalendarEvent(body) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const errors = {};
  const value = {};

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) errors.title = "Title is required.";
  else if (title.length > 120) errors.title = "Title must be at most 120 characters.";
  else value.title = title;

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > 1000) errors.description = "Description must be at most 1000 characters.";
  else value.description = description;

  if (!isCalendarDate(input.date)) errors.date = "Enter a valid start date.";
  else value.date = input.date;

  if (!isCalendarDate(input.endDate)) errors.endDate = "Enter a valid end date.";
  else if (value.date && input.endDate < value.date) errors.endDate = "The end date cannot be before the start date.";
  else value.endDate = input.endDate;

  if (typeof input.time !== "string" || !TIME_RE.test(input.time)) errors.time = "Choose a start and end time.";
  else value.time = input.time;

  if (!CALENDAR_COLORS.includes(input.color)) errors.color = "Choose one of the colours.";
  else value.color = input.color;

  return { value, errors };
}

export function toClientEvent(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    desc: doc.description || "",
    date: doc.date,
    endDate: doc.endDate,
    time: doc.time,
    color: doc.color,
  };
}
