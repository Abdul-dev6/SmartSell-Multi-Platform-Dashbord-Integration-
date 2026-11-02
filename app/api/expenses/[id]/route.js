import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Expense from "@/models/Expensive";
import { requireUser } from "@/lib/auth/GetCurrentUser";
import { readJsonBody } from "@/lib/auth/credentials";
import { toClientExpense, validateExpense } from "@/lib/expenses";

const notFound = () =>
  NextResponse.json({ success: false, message: "Expense not found." }, { status: 404 });

export async function PATCH(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();

    const { value, errors } = validateExpense(await readJsonBody(req), { mode: "update" });
    if (Object.keys(errors).length) {
      return NextResponse.json(
        { success: false, message: "Please fix the highlighted fields.", errors },
        { status: 400 },
      );
    }
    if (!Object.keys(value).length) {
      return NextResponse.json({ success: false, message: "No changes to save." }, { status: 400 });
    }

    const doc = await Expense.findOneAndUpdate(
      { _id: id, user: user._id },
      { $set: value },
      { returnDocument: "after", runValidators: true },
    );
    if (!doc) return notFound();
    return NextResponse.json({ success: true, expense: toClientExpense(doc) });
  } catch (error) {
    console.error("Update expense error:", error.name, error.message);
    return NextResponse.json({ success: false, message: "Could not update the expense." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound();

    const result = await Expense.deleteOne({ _id: id, user: user._id });
    if (!result.deletedCount) return notFound();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete expense error:", error.name, error.message);
    return NextResponse.json({ success: false, message: "Could not delete the expense." }, { status: 500 });
  }
}
