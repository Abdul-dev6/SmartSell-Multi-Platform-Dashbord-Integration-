"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";

const itemClass = "flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none";

// "⋮" menu for a row. Each item is one of:
//   { label, icon, href }                 – page in SmartSell
//   { label, icon, href, external: true } – opens in a new tab (e.g. Shopify admin)
//   { label, icon, onClick, danger }      – action
// Closes on Escape, on a click outside, and after choosing an item.
export default function RowActionsMenu({ label = "Actions", items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = items.filter(Boolean);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="p-2 rounded-lg hover:bg-slate-100 transition"
      >
        <MoreVertical size={22} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-56"
        >
          {visible.map(({ label: itemLabel, icon: Icon, href, external, onClick, danger }) => {
            const content = (
              <>
                {Icon && <Icon size={18} aria-hidden="true" />}
                {itemLabel}
              </>
            );
            const cls = `${itemClass} ${danger ? "text-red-600 hover:bg-red-50 focus:bg-red-50" : "text-slate-700"}`;
            if (href && external) {
              return (
                <a key={itemLabel} role="menuitem" href={href} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => setOpen(false)}>
                  {content}
                </a>
              );
            }
            if (href) {
              return (
                <Link key={itemLabel} role="menuitem" href={href} className={cls} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={itemLabel}
                type="button"
                role="menuitem"
                className={cls}
                onClick={() => {
                  setOpen(false);
                  onClick?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
