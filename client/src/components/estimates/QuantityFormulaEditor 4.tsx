import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Calculator, Ruler } from "lucide-react";
import type { TakeoffMeasurement, TakeoffCategory } from "@shared/schema";

/**
 * The quantity cell, when a quantity can come from the take-off.
 *
 * It stays a plain number field until you want more: type `{` and the take-off
 * list drops down, grouped the way it is on the plan. Picking an item inserts
 * it by name, and the cell shows what the expression comes to as you type —
 * `{Wall tiles} * 1.1` on the left, `53.09` on the right.
 *
 * Everything here edits the SAME string the grid already holds for the cell, so
 * Tab, Enter, Escape and type-to-replace keep working exactly as they do in
 * every other cell. Buttons inside the popovers suppress mousedown so the
 * input never loses focus — a blur would commit the cell mid-edit.
 */

export interface QuantityPreview {
  /** What the formula comes to, formatted, or "" when there is nothing to show. */
  text: string;
  /** Why it cannot be worked out, if it cannot. */
  error?: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  measurements: TakeoffMeasurement[];
  categories: TakeoffCategory[];
  preview: QuantityPreview;
  /** Remembers which item a name came from, so two items can share a name. */
  onPick: (name: string, id: string) => void;
  onAddInTakeoff?: () => void;
  testId: string;
}

const UNCAT = "__uncat__";

export default function QuantityFormulaEditor({
  value,
  onChange,
  onKeyDown,
  onBlur,
  onFocus,
  measurements,
  categories,
  preview,
  onPick,
  onAddInTakeoff,
  testId,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);

  // What has been typed since the `{`, used to narrow the list as you keep typing.
  const search = useMemo(() => {
    const open = value.lastIndexOf("{");
    if (open < 0) return null;
    const after = value.slice(open + 1);
    return after.includes("}") ? null : after;
  }, [value]);

  useEffect(() => {
    if (search !== null) setPickerOpen(true);
  }, [search]);

  const grouped = useMemo(() => {
    const term = (search ?? "").trim().toLowerCase();
    const byCat = new Map<string, TakeoffMeasurement[]>();
    for (const m of measurements) {
      if (term && !m.name.toLowerCase().includes(term)) continue;
      const key = m.categoryId ?? UNCAT;
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(m);
    }
    const sortedCats = [...categories].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name),
    );
    const out: Array<{ id: string; name: string; rows: TakeoffMeasurement[] }> = [];
    for (const c of sortedCats) {
      const rows = byCat.get(c.id);
      if (rows?.length) out.push({ id: c.id, name: c.name, rows });
    }
    const uncat = byCat.get(UNCAT);
    if (uncat?.length) out.push({ id: UNCAT, name: "Uncategorised", rows: uncat });
    return out;
  }, [measurements, categories, search]);

  /** Replace the open `{…` with the chosen item, or append a fresh reference. */
  const insert = (m: TakeoffMeasurement) => {
    onPick(m.name, m.id);
    const open = value.lastIndexOf("{");
    const next =
      open >= 0 && !value.slice(open).includes("}")
        ? `${value.slice(0, open)}{${m.name}}`
        : `${value}{${m.name}}`;
    onChange(next);
    setPickerOpen(false);
    inputRef.current?.focus();
  };

  const append = (text: string) => {
    onChange(value + text);
    inputRef.current?.focus();
  };

  // Keep the caret in the cell: a blur commits, and a popover click must not.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const closeAndBlur = () => {
    // A click elsewhere on the page should still commit the cell.
    if (!pickerOpen && !keypadOpen) onBlur();
  };

  return (
    <div className="relative flex h-full w-full items-center">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && (pickerOpen || keypadOpen)) {
            // Close the helper, keep the formula — Escape a second time is what
            // discards the edit, which is what the grid does everywhere else.
            e.stopPropagation();
            setPickerOpen(false);
            setKeypadOpen(false);
            return;
          }
          onKeyDown(e);
        }}
        onBlur={closeAndBlur}
        onFocus={onFocus}
        onDoubleClick={(e) => e.stopPropagation()}
        className="h-full flex-1 bg-transparent border-0 rounded-none shadow-none px-0 text-sm text-right focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        autoFocus
        data-testid={testId}
      />

      {/* What the expression comes to. Nothing is shown for a plain number —
          repeating it back would only take up room. */}
      {(preview.text || preview.error) && (
        <span
          className={`px-1 text-xs tabular-nums whitespace-nowrap ${
            preview.error ? "text-destructive" : "text-muted-foreground"
          }`}
          title={preview.error}
          data-testid={`${testId}-preview`}
        >
          {preview.error ? "—" : preview.text}
        </span>
      )}

      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => { setPickerOpen((o) => !o); setKeypadOpen(false); }}
        className="px-1 text-muted-foreground hover:text-foreground"
        title="Use a take-off measurement"
        data-testid={`${testId}-takeoff`}
      >
        <Ruler className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => { setKeypadOpen((o) => !o); setPickerOpen(false); }}
        className="pr-0.5 text-muted-foreground hover:text-foreground"
        title="Calculator"
        data-testid={`${testId}-keypad`}
      >
        <Calculator className="h-3.5 w-3.5" />
      </button>

      {keypadOpen && (
        <div
          className="absolute top-full right-0 z-50 mt-1 grid grid-cols-4 gap-1 rounded-md border border-border bg-popover p-2 shadow-lg"
          onMouseDown={keepFocus}
          data-testid={`${testId}-keypad-panel`}
        >
          {["7", "8", "9", "+", "4", "5", "6", "-", "1", "2", "3", "*", "0", ".", "ROUND(", "/"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => append(k)}
              className="h-8 min-w-[2.5rem] rounded-sm bg-muted text-sm hover-elevate"
              data-testid={`${testId}-key-${k === "*" ? "times" : k === "/" ? "divide" : k.replace("(", "")}`}
            >
              {k === "*" ? "×" : k === "/" ? "÷" : k === "ROUND(" ? "ROUND" : k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => append(")")}
            className="col-span-4 h-8 rounded-sm bg-muted text-sm hover-elevate"
            data-testid={`${testId}-key-close`}
          >
            )
          </button>
          <div className="col-span-4 pt-1 text-[11px] text-muted-foreground">
            ROUND( … ) rounds up to a whole number
          </div>
        </div>
      )}

      {pickerOpen && (
        <div
          className="absolute top-full right-0 z-50 mt-1 max-h-72 w-[22rem] overflow-auto rounded-md border border-border bg-popover shadow-lg"
          onMouseDown={keepFocus}
          data-testid={`${testId}-picker`}
        >
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
            Type {"{ }"} to use a measurement
          </div>
          {grouped.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {measurements.length === 0
                ? "Nothing measured on this project yet."
                : "No measurement matches that."}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.id}>
                <div className="px-3 py-1.5 text-xs font-medium bg-primary/5">{group.name}</div>
                {group.rows.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => insert(m)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover-elevate"
                    data-testid={`${testId}-option-${m.id}`}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round((m.quantity ?? 0) * 100) / 100} {m.unit}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-popover px-3 py-2">
            <button
              type="button"
              onClick={() => { setPickerOpen(false); onAddInTakeoff?.(); }}
              className="flex items-center gap-1.5 text-sm text-primary hover-elevate rounded-sm px-1 py-0.5"
              data-testid={`${testId}-add-in-takeoff`}
            >
              <Ruler className="h-4 w-4" /> Add in take-off
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
