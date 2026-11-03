import { NextResponse } from "next/server";
import Expense from "@/models/Expense";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { getActiveStores } from "@/lib/catalog";
import { EXPENSE_CATEGORIES, toClientExpense, validateExpense } from "@/lib/expenses";

const MAX_RESULTS = 500;

async function storeContext(userId) {
  const stores = await getActiveStores(userId);
  return { store: stores[0] || null, currency: stores[0]?.currency || null };
}

// Lists the user's expenses (newest first), optionally from a date.
export async function GET(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const from = new URL(req.url).searchParams.get("from");
    const filter = { user: user._id };
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      filter.date = { $gte: new Date(`${from}T00:00:00Z`) };
    }

    const [docs, { currency }] = await Promise.all([
      Expense.find(filter).sort({ date: -1, createdAt: -1 }).limit(MAX_RESULTS).lean(),
      storeContext(user._id),
    ]);

    return NextResponse.json({
      success: true,
      data: docs.map(toClientExpense),
      truncated: docs.length === MAX_RESULTS,
      storeCurrency: currency,
      categories: EXPENSE_CATEGORIES,
    });
  } catch (error) {
    console.error("List expenses error:", error.name, error.message);
    return NextResponse.json({ success: false, message: "Could not load expenses." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { store, currency } = await storeContext(user._id);
    const { value, errors } = validateExpense(await readJsonBody(req), {
      mode: "create",
      defaultCurrency: currency,
    });
    if (Object.keys(errors).length) {
      return NextResponse.json(
        { success: false, message: "Please fix the highlighted fields.", errors },
        { status: 400 },
      );
    }

    const doc = await Expense.create({ ...value, user: user._id, shopifyStore: store?._id });
    return NextResponse.json({ success: true, expense: toClientExpense(doc) }, { status: 201 });
  } catch (error) {
    console.error("Create expense error:", error.name, error.message);
    return NextResponse.json({ success: false, message: "Could not save the expense." }, { status: 500 });
  }
}
