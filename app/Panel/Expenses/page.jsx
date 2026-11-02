"use client";

import { useMemo, useState } from "react";
import LoadState from "@/PanelComponents/LoadState";
import useApiData from "@/PanelComponents/useApiData";
import { formatDate, formatMoney } from "@/PanelComponents/format";

const CATEGORY_LABELS = {
  advertising: "Advertising",
  shipping: "Shipping",
  marketplace_fees: "Marketplace fees",
  payment_fees: "Payment fees",
  inventory: "Inventory / cost of goods",
  packaging: "Packaging",
  software: "Software & apps",
  salaries: "Salaries",
  rent: "Rent",
  other: "Other",
};

const FIELD_LABELS = { date: "Date", category: "Category", amount: "Amount", currency: "Currency", description: "Description" };

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (currency) => ({ date: today(), category: "advertising", description: "", amount: "", currency: currency || "" });

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500";

export default function ExpensesPage() {
  const { body, error, loading, reload } = useApiData("/api/expenses");
  const expenses = useMemo(() => body?.data || [], [body]);
  const storeCurrency = body?.storeCurrency || null;

  const [form, setForm] = useState(null); // null until data loads
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);

  const current = form ?? emptyForm(storeCurrency);
  const set = (key) => (e) => setForm({ ...current, [key]: e.target.value });

  const totals = useMemo(() => {
    const month = today().slice(0, 7);
    const byCurrency = {};
    for (const e of expenses) {
      const t = (byCurrency[e.currency] ||= { month: 0, all: 0 });
      t.all += e.amount;
      if (e.date?.startsWith(month)) t.month += e.amount;
    }
    return byCurrency;
  }, [expenses]);

  const resetForm = () => {
    setForm(emptyForm(storeCurrency));
    setEditingId(null);
    setErrors({});
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      const response = await fetch(editingId ? `/api/expenses/${editingId}` : "/api/expenses", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors(data.errors || {});
        throw new Error(data.message || "Could not save the expense.");
      }
      setMessage({ type: "success", text: editingId ? "Expense updated." : "Expense added." });
      resetForm();
      await reload();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (expense) => {
    setEditingId(expense.id);
    setForm({
      date: expense.date,
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      currency: expense.currency,
    });
    setErrors({});
    setMessage(null);
  };

  const remove = async (expense) => {
    const label = `${formatMoney(expense.amount, expense.currency)} (${CATEGORY_LABELS[expense.category] || expense.category}, ${formatDate(expense.date)})`;
    if (!window.confirm(`Delete this expense?\n\n${label}`)) return;
    setMessage(null);
    try {
      const response = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not delete the expense.");
      if (editingId === expense.id) resetForm();
      await reload();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  };

  const otherCurrency = storeCurrency && current.currency && current.currency.toUpperCase() !== storeCurrency;

  return (
    <div className="min-h-screen bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 px-6 py-8 text-white shadow-lg shadow-blue-950/20">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Nexus Panel</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black">Expenses</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-blue-100/70">
          Record costs so the dashboard can show profit. Only expenses in your store currency
          {storeCurrency ? ` (${storeCurrency})` : ""} are included in profit.
        </p>
      </div>

      <LoadState loading={loading && !body} error={error} onRetry={reload} />

      {body && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.keys(totals).length === 0 ? (
              <p className="text-sm text-slate-500">No expenses recorded yet.</p>
            ) : (
              Object.entries(totals).map(([currency, t]) => (
                <div key={currency} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">
                    {currency}
                    {storeCurrency && currency !== storeCurrency ? " (not included in profit)" : ""}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(t.month, currency)}</p>
                  <p className="text-xs text-slate-400">This month · {formatMoney(t.all, currency)} in the list below</p>
                </div>
              ))
            )}
          </div>

          {/* Form */}
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" noValidate>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">{editingId ? "Edit expense" : "Add expense"}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-sm font-medium text-slate-700">
                Date
                <input type="date" value={current.date} onChange={set("date")} required className={`${inputClass} mt-1`} aria-invalid={errors.date ? true : undefined} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Category
                <select value={current.category} onChange={set("category")} className={`${inputClass} mt-1`} aria-invalid={errors.category ? true : undefined}>
                  {(body.categories || Object.keys(CATEGORY_LABELS)).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] || c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Amount
                <input type="number" min="0.01" step="0.01" inputMode="decimal" value={current.amount} onChange={set("amount")} required className={`${inputClass} mt-1`} aria-invalid={errors.amount ? true : undefined} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Currency
                <input type="text" maxLength={3} value={current.currency} onChange={set("currency")} placeholder={storeCurrency || "USD"} className={`${inputClass} mt-1 uppercase`} aria-invalid={errors.currency ? true : undefined} />
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-1">
                Description
                <input type="text" maxLength={500} value={current.description} onChange={set("description")} placeholder="Optional" className={`${inputClass} mt-1`} />
              </label>
            </div>

            {otherCurrency && (
              <p className="mt-3 text-xs text-amber-700">
                This expense is not in your store currency ({storeCurrency}), so it will not be included in dashboard profit.
              </p>
            )}

            {(message || Object.keys(errors).length > 0) && (
              <div className="mt-3 space-y-1 text-sm" aria-live="polite">
                {message && (
                  <p role={message.type === "error" ? "alert" : "status"} className={message.type === "error" ? "text-red-700" : "text-emerald-700"}>
                    {message.text}
                  </p>
                )}
                {Object.entries(errors).map(([field, text]) => (
                  <p key={field} className="text-red-700">
                    {FIELD_LABELS[field] || field}: {text}
                  </p>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Saving…" : editingId ? "Save changes" : "Add expense"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel edit
                </button>
              )}
            </div>
          </form>

          {/* List */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            {expenses.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No expenses yet. Add your first one above.</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-5 py-3">Date</th>
                    <th scope="col" className="px-5 py-3">Category</th>
                    <th scope="col" className="px-5 py-3">Description</th>
                    <th scope="col" className="px-5 py-3 text-right">Amount</th>
                    <th scope="col" className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((e) => (
                    <tr key={e.id} className={editingId === e.id ? "bg-indigo-50/50" : ""}>
                      <td className="px-5 py-3 text-slate-600">{formatDate(e.date)}</td>
                      <td className="px-5 py-3">{CATEGORY_LABELS[e.category] || e.category}</td>
                      <td className="px-5 py-3 text-slate-600">{e.description || "—"}</td>
                      <td className="px-5 py-3 text-right font-semibold">{formatMoney(e.amount, e.currency)}</td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={() => startEdit(e)} className="mr-3 font-medium text-indigo-600 hover:text-indigo-800">
                          Edit
                        </button>
                        <button type="button" onClick={() => remove(e)} className="font-medium text-red-600 hover:text-red-800">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
