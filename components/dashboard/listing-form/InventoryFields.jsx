"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { PackageSearch } from "lucide-react";
import { makeBinder } from "@/components/dashboard/listing-form/bind";
import { useShopifyOptions } from "@/components/dashboard/listing-form/useShopifyOptions";

const fieldClass = "w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500";

// Stock per location. Editable when the store granted write_inventory and
// the product has a single variant; otherwise shown read-only.
// `onEditable(boolean|null)` tells the form whether stock can be sent.
export default function Inventory({ formData, setFormData, errors = {}, onEditable, disabledReason = null }) {
  const bind = makeBinder(formData, setFormData, errors);
  const { loading, error, data, reload } = useShopifyOptions("/api/shopify/options/locations");
  const locations = data?.locations || [];
  const editable = Boolean(data?.editable) && !disabledReason;
  const tracked = Boolean(formData.trackInventory);

  useEffect(() => {
    onEditable?.(data ? editable : null);
  }, [data, editable, onEditable]);

  const setQuantity = (locationId) => (e) =>
    setFormData((prev) => ({ ...prev, inventory: { ...prev.inventory, [locationId]: e.target.value } }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center">
          <PackageSearch size={22} className="text-orange-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Inventory</h2>
          <p className="text-sm text-slate-500">SKU, barcode and available stock per location.</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="inventory-sku" className="block text-sm font-medium mb-2">SKU</label>
          <input id="inventory-sku" type="text" {...bind("sku")} placeholder="IPHONE16PRO" className={fieldClass} />
        </div>

        <div>
          <label htmlFor="inventory-barcode" className="block text-sm font-medium mb-2">Barcode</label>
          <input id="inventory-barcode" type="text" {...bind("barcode")} placeholder="1234567890123" className={fieldClass} />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" {...bind("trackInventory", { checkbox: true })} disabled={!editable} className="w-5 h-5" />
          <span>Track quantity</span>
        </label>

        <fieldset>
          <legend className="block text-sm font-medium mb-2">Available quantity</legend>
          <div aria-live="polite" className="space-y-2">
            {disabledReason && <p className="text-xs text-amber-700">{disabledReason}</p>}
            {loading && <p className="text-sm text-slate-500">Loading locations…</p>}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}{" "}
                <button type="button" onClick={reload} className="underline">Retry</button>
              </p>
            )}
            {data && !data.editable && (
              <p className="text-sm text-amber-800">
                Changing stock from SmartSell needs the Shopify permission {data.missingScopes.join(", ")}, which isn&apos;t
                granted yet. Current stock is shown below.
              </p>
            )}
            {data && locations.length === 0 && (
              <p className="text-sm text-slate-500">No active locations found. Run a sync to load your store&apos;s locations.</p>
            )}
            {data && locations.length > 0 && !tracked && (
              <p className="text-sm text-slate-500">Quantity isn&apos;t tracked for this product.</p>
            )}
            {data && tracked && locations.map((location) => (
              <div key={location.id} className="grid grid-cols-3 items-center gap-3">
                <label htmlFor={`stock-${location.id}`} className="col-span-2 text-sm text-slate-700">{location.name}</label>
                <input
                  id={`stock-${location.id}`}
                  type="number"
                  step="1"
                  inputMode="numeric"
                  placeholder={editable ? "0" : "—"}
                  value={formData.inventory?.[location.id] ?? ""}
                  onChange={setQuantity(location.id)}
                  disabled={!editable}
                  className={fieldClass}
                  aria-invalid={errors.inventory ? true : undefined}
                />
              </div>
            ))}
            {errors.inventory && <p className="text-sm text-red-700">{errors.inventory}</p>}
          </div>
        </fieldset>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" {...bind("continueSelling", { checkbox: true })} className="w-5 h-5" />
          <span>Continue selling when out of stock</span>
        </label>
      </div>
    </motion.div>
  );
}
