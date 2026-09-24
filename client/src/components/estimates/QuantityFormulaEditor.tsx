import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 *
 * The editor itself is PORTALLED too, and floats over the columns beside it.
 * A quantity cell is 60px wide with `overflow-hidden` — enough for "12", and
 * nowhere near enough for `{Wall tiles} * 1.1`, its result and two buttons all
 * at once. It opens as a card anchored to the cell instead, which is also what
 * makes the dropdowns visible at all: rendered inside the cell they were
 * clipped to nothing.
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number; cardBottom: number } | null>(null);

  // Where the card and its dropdowns sit: over the cell, right edges aligned.
  // Measured from the viewport because they are portalled out of the grid,
  // which scrolls in both directions.
  useLayoutEffect(() => {
    const place = () => {
      const cell = anchorRef.current;
      // The estimate page keeps its other tabs mounted and merely hidden, so a
      // card left open would float over the take-off or details tab. No cell on
      // screen, no card.
      if (!cell || cell.offsetParent === null) { setAnchor(null); return; }
      const r = cell.getBoundingClientRect();
      setAnchor({
        top: r.top - 3,
        right: Math.max(8, window.innerWidth - r.right - 4),
        cardBottom: r.bottom + 3,
      });
    };
    const poll = window.setInterval(place, 400);
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []);

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

  /** The dropdowns hang under the card; the card sits over the cell. */
  const panelStyle = anchor
    ? { position: "fixed" as const, top: anchor.cardBottom + 2, right: anchor.right, zIndex: 61 }
    : { display: "none" };
  const cardStyle = anchor
    ? { position: "fixed" as const, top: anchor.top, right: anchor.right, zIndex: 60, width: 340 }
    : { display: "none" as const };

  return (
    <div ref={anchorRef} className="relative flex h-full w-full items-center justify-end">
      {/* The cell keeps the value visible underneath while the card is open, so
          the row does not appear to empty itself as you type. */}
      <span className="pointer-events-none truncate text-sm text-muted-foreground" aria-hidden="true">
        {preview.text || (preview.error ? "—" : value)}
      </span>

      {createPortal(
        <div
          style={cardStyle}
          className="rounded-md border border-border bg-popover shadow-lg p-1.5 flex items-center gap-1.5"
          onMouseDown={(e) => {
            // Clicking the card's chrome must not blur the input and commit.
            if (e.target !== inputRef.current) e.preventDefault();
          }}
          data-testid={`editor-card-${testId}`}
        >
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
        className="h-7 flex-1 min-w-0 bg-transparent border-0 shadow-none px-1 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        autoFocus
        placeholder="12  ·  {Wall tiles} * 1.1"
        data-testid={testId}
      />

      {/* What the expression comes to, or why it cannot be worked out. A plain
          number says nothing — repeating "12" back beside "12" is noise. */}
      {(preview.text || preview.error) && (
        <span
          className={`flex-shrink-0 rounded-sm px-1.5 py-0.5 text-xs tabular-nums whitespace-nowrap ${
            preview.error
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-foreground font-medium"
          }`}
          title={preview.error}
          data-testid={`${testId}-preview`}
        >
          {preview.error ? "—" : `= ${preview.text}`}
        </span>
      )}

      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => { setPickerOpen((o) => !o); setKeypadOpen(false); }}
        className={`h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-sm hover-elevate ${pickerOpen ? "bg-primary/15 text-foreground" : "text-muted-foreground"}`}
        title="Use a take-off measurement"
        data-testid={`${testId}-takeoff`}
      >
        <Ruler className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={() => { setKeypadOpen((o) => !o); setPickerOpen(false); }}
        className={`h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-sm hover-elevate ${keypadOpen ? "bg-primary/15 text-foreground" : "text-muted-foreground"}`}
        title="Calculator"
        data-testid={`${testId}-keypad`}
      >
        <Calculator className="h-3.5 w-3.5" />
      </button>
        </div>,
        document.body,
      )}

      {keypadOpen && createPortal(
        <div
          className="grid grid-cols-4 gap-1 rounded-md border border-border bg-popover p-2 shadow-lg"
          style={panelStyle}
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
        </div>,
        document.body,
      )}

      {pickerOpen && createPortal(
        <div
          className="max-h-72 w-[22rem] overflow-auto rounded-md border border-border bg-popover shadow-lg"
          style={panelStyle}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
