import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centsToDollars, dollarsToCents } from "@shared/money";
import { solvePricing, type PricingField, type PricingTriple } from "@shared/selectionPricing";

/**
 * Cost / markup / charge, per unit, all including GST. Fill in any two and the
 * third is worked out; the rules for which one gives way live in
 * shared/selectionPricing.ts.
 *
 * 🚨 Staff-only. Cost and markup are never shown to a client — do not render
 * this on a client-facing page.
 */

const centsToInput = (c: number | null) => (c == null ? "" : centsToDollars(c).toFixed(2));
const markupToInput = (m: number | null) => (m == null ? "" : String(Math.round(m * 100) / 100));
const toInputs = (v: PricingTriple) => ({
  cost: centsToInput(v.costCents),
  markup: markupToInput(v.markupPercent),
  charge: centsToInput(v.chargeCents),
});
const parseNumber = (raw: string): number | null => {
  const n = parseFloat(raw);
  return raw.trim() === "" || Number.isNaN(n) ? null : n;
};

export function PricingFields({
  value,
  onChange,
  resetKey,
  disabled = false,
  size = "md",
  className,
}: {
  value: PricingTriple;
  onChange: (next: PricingTriple) => void;
  /** Change this to reload the inputs from `value` (a different record loaded). */
  resetKey?: string | number | null;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  // Text the user is typing. Only the fields they are NOT editing get rewritten
  // from the solved value, so "150." isn't reformatted under the cursor.
  const [inputs, setInputs] = useState(() => toInputs(value));
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setInputs(toInputs(valueRef.current));
  }, [resetKey]);

  const edit = (field: PricingField, raw: string) => {
    const parsed = parseNumber(raw);
    const next = solvePricing(
      {
        costCents: field === "cost" ? (parsed == null ? null : dollarsToCents(parsed)) : value.costCents,
        chargeCents: field === "charge" ? (parsed == null ? null : dollarsToCents(parsed)) : value.chargeCents,
        markupPercent: field === "markup" ? parsed : value.markupPercent,
      },
      field,
    );
    const solved = toInputs(next);
    setInputs({ ...solved, [field]: raw });
    onChange(next);
  };

  const tidy = () => setInputs(toInputs(valueRef.current));

  const inputClass = cn("text-right tabular-nums", size === "sm" ? "h-7 text-xs" : "h-9 text-sm");
  const labelClass = cn("font-medium text-muted-foreground", size === "sm" ? "text-[10px]" : "text-xs");

  return (
    <div className={cn("space-y-1", className)}>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className={labelClass}>Cost</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
            <Input
              type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
              value={inputs.cost}
              onChange={(e) => edit("cost", e.target.value)}
              onBlur={tidy}
              disabled={disabled}
              className={cn(inputClass, "pl-5")}
              data-testid="input-pricing-cost"
            />
          </div>
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Markup</span>
          <div className="relative">
            <Input
              type="number" step="0.01" inputMode="decimal" placeholder="0"
              value={inputs.markup}
              onChange={(e) => edit("markup", e.target.value)}
              onBlur={tidy}
              disabled={disabled}
              className={cn(inputClass, "pr-6")}
              data-testid="input-pricing-markup"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
          </div>
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Charge</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
            <Input
              type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
              value={inputs.charge}
              onChange={(e) => edit("charge", e.target.value)}
              onBlur={tidy}
              disabled={disabled}
              className={cn(inputClass, "pl-5")}
              data-testid="input-pricing-charge"
            />
          </div>
        </label>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Per unit, including GST. Fill in any two. The client only ever sees the charge.
      </p>
    </div>
  );
}
