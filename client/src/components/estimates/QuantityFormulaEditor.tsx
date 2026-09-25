import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Calculator, Ruler, Search, X } from "lucide-react";
import type { TakeoffMeasurement, TakeoffCategory } from "@shared/schema";
import { isPlainNumber } from "@shared/quantityFormula";

/**
 * The quantity cell, when a quantity can come from the take-off.
 *
 * It stays a plain number field until you want more: type `{` and the take-off
 * list drops down, grouped the way it is on the plan. Picking an item inserts
 * it by name, and the cell shows what the expression comes to as you type —
 * `{Wall tiles} * 1.1` on the left, `53.09` on the right.
 *
 * The list has its own search box, and focus moves there the moment the list
 * opens — from `{` or from the ruler button, which used to give an unfiltered
 * list you could only get through by scrolling. Typing narrows it, up and down
 * move through it, Enter takes the highlighted one. A project with sixty
 * measurements is otherwise unusable in a 60px cell.
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
  const searchRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  /** What has been typed into the list's own search box. */
  const [query, setQuery] = useState("");
  /** Which row Enter would take, as an index into the flattened list. */
  const [highlight, setHighlight] = useState(0);
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

  // Whatever sits after an unclosed `{` in the cell. Null when there is no
  // open brace, which is also how "the ruler button opened this" looks.
  const braceText = useMemo(() => {
    const open = value.lastIndexOf("{");
    if (open < 0) return null;
    const after = value.slice(open + 1);
    return after.includes("}") ? null : after;
  }, [value]);

  /**
   * One way in, so both entry points behave the same: seed the search, show the
   * list, and put the caret in the search box. Typing `{` then carries straight
   * on into the search rather than into the formula.
   */
  const openPicker = (seed: string) => {
    setQuery(seed);
    setHighlight(0);
    setKeypadOpen(false);
    setPickerOpen(true);
    // Focus is taken by the effect below, once the portal has actually mounted.
  };

  const closePicker = (returnFocus = true) => {
    setPickerOpen(false);
    setQuery("");
    if (returnFocus) inputRef.current?.focus();
  };

  // A `{` typed into the cell opens the list. Only on a CHANGE, so dismissing
  // it with Escape while the brace is still there does not reopen it.
  useEffect(() => {
    if (braceText !== null && !pickerOpen) openPicker(braceText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [braceText]);

  const grouped = useMemo(() => {
    const term = query.trim().toLowerCase();
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
  }, [measurements, categories, query]);

  // The groups are for reading; the keyboard needs one flat sequence.
  const flat = useMemo(() => grouped.flatMap((g) => g.rows), [grouped]);
  const indexOfRow = useMemo(() => new Map(flat.map((m, i) => [m.id, i])), [flat]);

  // Narrowing the list can strand the highlight past its end.
  useEffect(() => {
    setHighlight((h) => (flat.length === 0 ? 0 : Math.min(h, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlight, pickerOpen]);

  // The search box lives in a portal that mounts on the render this opens, so
  // focus has to wait for the commit. A requestAnimationFrame here was a race:
  // it won from the button, and lost from the `{` path, where the open comes
  // out of an effect and the input did not exist yet.
  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus();
  }, [pickerOpen]);

  /**
   * Put the chosen item into the cell.
   *
   * Three cases, because "append" is only right for one of them. Typing `{`
   * means replace from the brace. A cell holding nothing or a bare number —
   * which is every cell that has never had a formula, since quantity defaults
   * to 1 — means the number is a placeholder, not something to build on:
   * appending there gave `1{Wall linings}`, which is not a valid expression.
   * Anything else is a part-written expression, so the reference goes on the end.
   */
  const insert = (m: TakeoffMeasurement) => {
    onPick(m.name, m.id);
    const ref = `{${m.name}}`;
    const open = value.lastIndexOf("{");
    const inBrace = open >= 0 && !value.slice(open).includes("}");
    const next = inBrace
      ? `${value.slice(0, open)}${ref}`
      : !value.trim() || isPlainNumber(value)
        ? ref
        : `${value}${ref}`;
    onChange(next);
    closePicker();
  };

  const append = (text: string) => {
    onChange(value + text);
    inputRef.current?.focus();
  };

  // Keep the caret in the cell: a blur commits, and a popover click must not.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  /**
   * Up and down move, Enter takes, Escape and Tab give the cell back. These
   * keys must not reach the grid's own handler: Enter there commits the cell,
   * and the arrows move the selection to another row.
   */
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (flat.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => Math.min(flat.length - 1, Math.max(0, h + step)));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const pick = flat[highlight];
      if (pick) insert(pick);
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      // Tab gives the cell back rather than inserting: a half-typed search is
      // not a choice, and Tab is how the grid moves on.
      e.preventDefault();
      e.stopPropagation();
      closePicker();
    }
  };

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
            setQuery("");
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
        onClick={() => { if (pickerOpen) closePicker(); else openPicker(""); }}
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
          {/* Sticky, because the list scrolls under it and the search is how you
              get back out of a long one. */}
          <div className="sticky top-0 z-10 border-b border-border bg-popover px-2 py-2">
            <div className="flex items-center gap-1.5 rounded-sm border border-border px-2">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
                onKeyDown={onSearchKeyDown}
                // While the list is open the caret is HERE, not in the cell, so
                // this is the blur that has to commit the edit when the user
                // clicks away. Focus moving to the card or the list itself is
                // not leaving — and a click on a row never blurs at all,
                // because the panel swallows the mousedown.
                onBlur={(e) => {
                  const next = e.relatedTarget as HTMLElement | null;
                  if (next?.closest(`[data-testid="editor-card-${testId}"], [data-testid="${testId}-picker"]`)) return;
                  setPickerOpen(false);
                  setQuery("");
                  onBlur();
                }}
                className="h-7 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search measurements…"
                data-testid={`${testId}-picker-search`}
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={keepFocus}
                  onClick={() => { setQuery(""); setHighlight(0); searchRef.current?.focus(); }}
                  className="flex-shrink-0 rounded-sm p-0.5 text-muted-foreground hover-elevate"
                  title="Clear"
                  data-testid={`${testId}-picker-clear`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="px-0.5 pt-1.5 text-[11px] text-muted-foreground">
              {flat.length} of {measurements.length} · ↑↓ to move, Enter to use
            </div>
          </div>
          {grouped.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {measurements.length === 0
                ? "Nothing measured on this project yet."
                : `Nothing matches “${query.trim()}”.`}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.id}>
                <div className="px-3 py-1.5 text-xs font-medium bg-primary/5">{group.name}</div>
                {group.rows.map((m) => {
                  const index = indexOfRow.get(m.id) ?? 0;
                  const isHighlighted = index === highlight;
                  return (
                  <button
                    key={m.id}
                    ref={isHighlighted ? highlightRef : undefined}
                    type="button"
                    onClick={() => insert(m)}
                    // Hover moves the highlight, so the mouse and the keyboard
                    // never disagree about what Enter would take.
                    onMouseEnter={() => setHighlight(index)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover-elevate ${
                      isHighlighted ? "bg-primary/10" : ""
                    }`}
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
                  );
                })}
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
