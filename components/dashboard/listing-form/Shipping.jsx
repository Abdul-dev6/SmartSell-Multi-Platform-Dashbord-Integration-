"use client";

import { motion } from "framer-motion";
import { Truck } from "lucide-react";
import { makeBinder } from "@/components/dashboard/listing-form/bind";

const fieldClass = "w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50";

export const WEIGHT_UNITS = [
  { value: "KILOGRAMS", label: "kg" },
  { value: "GRAMS", label: "g" },
  { value: "POUNDS", label: "lb" },
  { value: "OUNCES", label: "oz" },
];

const regionNames = typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (code) => {
  if (!regionNames || !/^[A-Za-z]{2}$/.test(code || "")) return null;
  const name = regionNames.of(code.toUpperCase());
  return name && name !== code.toUpperCase() && name !== "Unknown Region" ? name : null;
};

// Shipping fields saved on the variant's inventory item in Shopify.
// `disabled` (with a reason) for products with several variants, whose
// shipping details differ per variant.
export default function Shipping({ formData, setFormData, errors = {}, disabledReason = null }) {
  const bind = makeBinder(formData, setFormData, errors);
  const disabled = Boolean(disabledReason);
  const physical = Boolean(formData.requiresShipping);
  const country = countryName(formData.countryOfOrigin);

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
          <Truck size={22} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Shipping</h2>
          <p className="text-sm text-slate-500">Saved to Shopify with the product.</p>
          {disabledReason && <p className="mt-1 text-xs text-amber-700">{disabledReason}</p>}
        </div>
      </div>

      <div className="space-y-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" {...bind("requiresShipping", { checkbox: true })} disabled={disabled} className="w-5 h-5" />
          <span>This is a physical product (requires shipping)</span>
        </label>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label htmlFor="shipping-weight" className="block text-sm font-medium mb-2">Weight</label>
            <input
              id="shipping-weight"
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              placeholder="0.5"
              {...bind("weight")}
              disabled={disabled || !physical}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="shipping-weight-unit" className="block text-sm font-medium mb-2">Unit</label>
            <select id="shipping-weight-unit" {...bind("weightUnit")} disabled={disabled || !physical} className={fieldClass}>
              {WEIGHT_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>
        {(errors.weight || errors.weightUnit) && <p className="text-sm text-red-700">{errors.weight || errors.weightUnit}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="shipping-country" className="block text-sm font-medium mb-2">Country of origin</label>
            <input
              id="shipping-country"
              type="text"
              maxLength={2}
              placeholder="2-letter code, e.g. PK"
              {...bind("countryOfOrigin")}
              disabled={disabled}
              className={`${fieldClass} uppercase`}
            />
            <p className="mt-1 text-xs text-slate-500">{country || "Used for customs. ISO country code."}</p>
            {errors.countryOfOrigin && <p className="text-sm text-red-700">{errors.countryOfOrigin}</p>}
          </div>
          <div>
            <label htmlFor="shipping-hs" className="block text-sm font-medium mb-2">HS code</label>
            <input
              id="shipping-hs"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 691200"
              {...bind("hsCode")}
              disabled={disabled}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-slate-500">Harmonized System code, 6–13 digits.</p>
            {errors.hsCode && <p className="text-sm text-red-700">{errors.hsCode}</p>}
          </div>
        </div>

        <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
          Package dimensions, shipping profiles and rates are store-wide shipping settings in Shopify; this integration
          does not manage them.
        </p>
      </div>
    </motion.div>
  );
}
