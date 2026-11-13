"use client";

import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { passwordStrength } from "@/lib/auth/passwordStrength";

const STRENGTH = [
  null,
  { label: "Weak", bar: "bg-red-500", text: "text-red-600" },
  { label: "Fair", bar: "bg-amber-500", text: "text-amber-600" },
  { label: "Good", bar: "bg-indigo-500", text: "text-indigo-600" },
  { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600" },
];

// Password field with a show/hide button and a Caps Lock warning;
// `showStrength` adds a strength meter (for choosing a new password).
export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  placeholder = "••••••••",
  showStrength = false,
  required = true,
  className = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 pr-12 text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30",
  labelClassName = "block text-sm text-slate-600 mb-2",
  hint = null,
}) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const strength = showStrength ? passwordStrength(value) : 0;
  const level = STRENGTH[strength];
  const checkCaps = (e) => setCapsLock(Boolean(e.getModifierState?.("CapsLock")));

  return (
    <div>
      {label && (
        <label htmlFor={id} className={labelClassName}>
          {label}
          {hint && <span className="text-slate-400"> {hint}</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={showStrength ? 8 : undefined}
          maxLength={72}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyUp={checkCaps}
          onKeyDown={checkCaps}
          onBlur={() => setCapsLock(false)}
          className={className}
          aria-describedby={capsLock ? `${id}-caps` : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-slate-800"
        >
          {visible ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
        </button>
      </div>
      {capsLock && (
        <p id={`${id}-caps`} className="mt-1 text-xs text-amber-600">
          Caps Lock is on.
        </p>
      )}
      {showStrength && level && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength ? level.bar : "bg-slate-200"}`} />
            ))}
          </div>
          <p className={`mt-1 text-xs ${level.text}`}>
            Password strength: {level.label}
            {strength < 3 ? " — use 12+ characters with upper and lower case, a number and a symbol." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
