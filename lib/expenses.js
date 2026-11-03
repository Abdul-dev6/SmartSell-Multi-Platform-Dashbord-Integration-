import { EXPENSE_CATEGORIES } from "@/models/Expense";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,2})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export { EXPENSE_CATEGORIES };

// "YYYY-MM-DD" → Date at 12:00 UTC, or null if not a real calendar date.
export function parseExpenseDate(value) {
  const match = typeof value === "string" ? value.match(DATE_RE) : null;
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

// Validates a create (all fields) or update (fields present only).
// Returns { value, errors }.
export function validateExpense(body, { mode, defaultCurrency }) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const isCreate = mode === "create";
  const has = (key) => isCreate || Object.prototype.hasOwnProperty.call(input, key);
  const errors = {};
  const value = {};

  if (has("date")) {
    const date = parseExpenseDate(input.date);
    if (!date) errors.date = "Enter a valid date";
    else if (date.getTime() > Date.now() + 366 * 86400000) errors.date = "Date is too far in the future";
    else value.date = date;
  }

  if (has("category")) {
    if (!EXPENSE_CATEGORIES.includes(input.category)) errors.category = "Choose a category";
    else value.category = input.category;
  }

  if (has("amount")) {
    const raw = typeof input.amount === "number" ? String(input.amount) : input.amount;
    if (typeof raw !== "string" || !AMOUNT_RE.test(raw.trim()) || Number(raw) <= 0) {
      errors.amount = "Enter an amount greater than 0 with up to 2 decimals";
    } else {
      value.amount = Number(Number(raw).toFixed(2));
    }
  }

  if (has("description")) {
    const d = input.description ?? "";
    if (typeof d !== "string" || d.length > 500) errors.description = "At most 500 characters";
    else value.description = d.trim();
  }

  if (input.currency !== undefined && input.currency !== "") {
    const c = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
    if (!CURRENCY_RE.test(c)) errors.currency = "Use a 3-letter currency code, e.g. USD";
    else value.currency = c;
  } else if (isCreate) {
    if (defaultCurrency) value.currency = defaultCurrency;
    else errors.currency = "Currency is required";
  }

  return { value, errors };
}

export function toClientExpense(doc) {
  return {
    id: String(doc._id),
    date: doc.date ? new Date(doc.date).toISOString().slice(0, 10) : null,
    category: doc.category,
    description: doc.description || "",
    amount: doc.amount,
    currency: doc.currency,
  };
}
