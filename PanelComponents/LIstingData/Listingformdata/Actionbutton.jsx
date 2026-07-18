"use client";

import { Loader2, Save, UploadCloud, X } from "lucide-react";

export default function ActionButtons({
  loading = false,
  onCancel,
  onSaveDraft,
  onPublish,
}) {
  return (
    <div className="sticky bottom-6 bg-white border border-slate-200 rounded-2xl shadow-lg p-5">
      <div className="flex flex-col sm:flex-row justify-end gap-3">
        {/* Cancel */}

        <button
          onClick={onCancel}
          className="
            flex items-center justify-center gap-2
            px-6 py-3
            rounded-xl
            border border-slate-300
            hover:bg-slate-100
            transition-all
          "
        >
          <X size={18} />
          Cancel
        </button>

        {/* Save Draft */}

        <button
          onClick={onSaveDraft}
          disabled={loading}
          className="
            flex items-center justify-center gap-2
            px-6 py-3
            rounded-xl
            bg-amber-500
            hover:bg-amber-600
            text-white
            transition-all
            disabled:opacity-50
          "
        >
          <Save size={18} />
          Save Draft
        </button>

        {/* Publish */}

        <button
          onClick={onPublish}
          disabled={loading}
          className="
            flex items-center justify-center gap-2
            px-7 py-3
            rounded-xl
            bg-indigo-600
            hover:bg-indigo-700
            text-white
            transition-all
            disabled:opacity-50
          "
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <UploadCloud size={18} />
              Publish Product
            </>
          )}
        </button>
      </div>
    </div>
  );
}
