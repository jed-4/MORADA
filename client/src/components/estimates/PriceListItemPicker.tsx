import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { centsToDollars, dollarsToCents, exGstFromInc, formatCents } from "@shared/money";
import type { AssemblyWithComponents, PriceListItem } from "@shared/schema";
import { assemblyRateBreakdown } from "@shared/assemblies";

/** A catalogue row as the lookup endpoint returns it — item plus its book. */
export type PriceListLookupItem = PriceListItem & {
  listName: string;
  listColour: string | null;
};

/**
 * What a catalogue item contributes to an estimate line.
 *
 * Cost ONLY. The item's own markupPercent is deliberately NOT carried: the estimate
 * already has one margin story (line markup falling back to the project's), and a
 * catalogue item quietly overriding it would make two lines with the same cost show
 * different sell prices for reasons nobody can see on screen.
 *
 * unitCostExTax is DOLLARS (estimate_items is doublePrecision dollars) while the
 * catalogue stores CENTS — and stores them inc GST when the item says so. Both
 * conversions go through shared/money.ts; never hand-roll them.
 */
export function priceListItemToLineFields(
  item: PriceListLookupItem,
  opts?: { allowedUnits?: string[] },
) {
  const exGstCents = item.gstInclusive ? exGstFromInc(item.costPrice) : item.costPrice;
  return {
    name: item.name,
    // Unit only travels when the estimate actually knows it. The catalogue and the
    // estimate draw from DIFFERENT unit vocabularies — a catalogue item priced per
    // "lm" hits an estimate whose Field Settings list has no such option, and the
    // Select silently resolves it to nothing, saving a line with no unit at all.
    // Keeping the line's existing unit is the lesser wrong; the toast says so.
    ...(unitCarriesToEstimate(item.unitType, opts?.allowedUnits)
      ? { unitType: item.unitType }
      : {}),
    unitCostExTax: centsToDollars(exGstCents),
    // The catalogue carries a cost code precisely so provenance survives the hop.
    // Note the field names disagree but the VALUES match: estimate_items.costCode is
    // a text column that actually stores a cost code ID (see how the grid resolves it
    // — costCodes.find(c => c.id === item.costCode)), which is what costCodeId is too.
    // Only applied when the item has one; never blank out a code the line already had.
    ...(item.costCodeId ? { costCode: item.costCodeId } : {}),
    priceListItemId: item.id,
  };
}

/**
 * One message for every entry point — the estimate grid, its dialog, and the
 * estimate TEMPLATE grid.
 *
 * It says what the price was AND calls out a unit that couldn't come across,
 * because a silently-missing unit on a line priced per linear metre is how you
 * quote 40 metres of cornice as 40 "each". It lived in EstimateDetail; it is
 * here now so the template grid says the same thing rather than its own
 * version, or nothing.
 */
export function priceListSelectToast(
  picked: PriceListLookupItem,
  allowedUnits?: string[],
) {
  const carried = unitCarriesToEstimate(picked.unitType, allowedUnits);
  const price = `${formatCents(lookupItemExGstCents(picked))} / ${picked.unitType}`;
  return carried
    ? {
        title: "Priced from catalogue",
        description: `${picked.name} — ${price} from ${picked.listName}.`,
      }
    : {
        title: "Priced from catalogue — check the unit",
        description: `${picked.name} — ${price} from ${picked.listName}. This list has no "${picked.unitType}" unit, so the line kept its existing one.`,
      };
}

/**
 * Whether a catalogue unit exists in the estimate's own unit list.
 *
 * With no list supplied (nothing loaded yet) we let it through rather than silently
 * dropping every unit — the Select's own behaviour is then no worse than before.
 */
export function unitCarriesToEstimate(unitType: string, allowedUnits?: string[]) {
  if (!allowedUnits || allowedUnits.length === 0) return true;
  return allowedUnits.some(u => u.toLowerCase() === unitType.toLowerCase());
}

/** Ex-GST unit cost of a catalogue row, in cents — for display in the dropdown. */
export function lookupItemExGstCents(item: PriceListLookupItem) {
  return item.gstInclusive ? exGstFromInc(item.costPrice) : item.costPrice;
}

interface PriceListItemPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** A catalogue row was chosen. The caller writes cost + link to the line. */
  onSelect: (item: PriceListLookupItem) => void;
  /**
   * An assembly was chosen. Passing this turns assemblies on: they list FIRST,
   * above the price-list items, marked with the assembly icon. Leave it out
   * where a line can't become an assembly (dialogs, templates, sub-items).
   */
  onSelectAssembly?: (assembly: AssemblyWithComponents) => void;
  /** Enter/blur with no catalogue row chosen — save the typed text as-is. */
  onCommit?: () => void;
  /**
   * Escape with the dropdown already closed. Omit inside a dialog: without a handler
   * the key is left to bubble, so Escape still closes the dialog as Radix expects.
   */
  onCancel?: () => void;
  /** Grid navigation etc. Only reached when the dropdown isn't handling the key. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * The line is already linked to a catalogue item, so the user is RENAMING it.
   * The list then stays shut until they type, and nothing is pre-highlighted —
   * Enter saves the typed name. Otherwise a shortened name ("Plasterboard")
   * still matches its own catalogue item, Enter re-picks it, and the full
   * catalogue name comes straight back. Arrow keys / click still pick.
   */
  linked?: boolean;
  "data-testid"?: string;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

/**
 * Item-name input with a catalogue typeahead attached.
 *
 * Shared by the estimate grid's inline name cell and the item dialog so the two
 * behave identically — the grid is where you add ten lines fast, the dialog is where
 * you add one carefully, and neither should be the only place the catalogue exists.
 *
 * Free typing always wins: a name that matches nothing saves exactly as typed. The
 * dropdown is an offer, never a requirement.
 */
export function PriceListItemPicker({
  value,
  onChange,
  onSelect,
  onSelectAssembly,
  onCommit,
  onCancel,
  onKeyDown,
  className,
  placeholder,
  autoFocus,
  linked = false,
  "data-testid": testId,
}: PriceListItemPickerProps) {
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const noHighlight = linked ? -1 : 0;
  const [highlight, setHighlight] = useState(noHighlight);
  // The name the input opened with. A linked line opening on its own catalogue
  // name would otherwise pop the list the moment the cell is clicked.
  const initialTermRef = useRef(value.trim());
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  // Set while a dropdown row is being clicked. The input's blur fires BEFORE the
  // click lands, and blur commits the cell — without this the dropdown would
  // dismiss itself and save the half-typed text instead of the chosen item.
  const selectingRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  const term = debounced.trim();
  const enabled = term.length >= MIN_QUERY_LENGTH;

  const { data: results = [] } = useQuery<PriceListLookupItem[]>({
    queryKey: ["/api/price-list/lookup", term],
    queryFn: async () => {
      const res = await fetch(`/api/price-list/lookup?q=${encodeURIComponent(term)}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });

  // Assemblies are few (a company's recipes, not a catalogue), so the whole list
  // loads once and filters here. Same cache key as the Add-assembly dialog.
  const assembliesOn = !!onSelectAssembly;
  const { data: allAssemblies = [] } = useQuery<AssemblyWithComponents[]>({
    queryKey: ["/api/assemblies", { includeArchived: false }],
    queryFn: async () => {
      const res = await fetch("/api/assemblies", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: assembliesOn && enabled,
    staleTime: 30_000,
  });
  const assemblyResults = useMemo(() => {
    if (!assembliesOn || !enabled) return [];
    const words = term.toLowerCase().split(/\s+/).filter(Boolean);
    return allAssemblies
      .filter((a) => words.every((w) => a.name.toLowerCase().includes(w)))
      .slice(0, 5);
  }, [assembliesOn, enabled, term, allAssemblies]);

  // One list for the keyboard: assemblies first, then price-list items.
  type Option = { kind: "assembly"; assembly: AssemblyWithComponents } | { kind: "item"; item: PriceListLookupItem };
  const options: Option[] = useMemo(() => [
    ...assemblyResults.map((assembly) => ({ kind: "assembly" as const, assembly })),
    ...results.map((item) => ({ kind: "item" as const, item })),
  ], [assemblyResults, results]);

  // Reopen whenever fresh results arrive for what the user is currently typing.
  // Keyed off the term, not the array, so dismissing with Escape stays dismissed
  // until the next keystroke.
  useEffect(() => {
    if (enabled && !(linked && term === initialTermRef.current)) setOpen(true);
    setHighlight(noHighlight);
  }, [term, enabled, linked, noHighlight]);

  const visible = open && enabled && options.length > 0;

  // The list is portalled to <body> because the estimate grid clips it otherwise:
  // the name cell is overflow-hidden, and so are five more ancestors up to <main>.
  // That means positioning by hand off the input's viewport rect, and re-reading the
  // rect whenever anything scrolls — the grid body scrolls independently of the page.
  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchorRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    measure();
    // Capture phase: catches scrolls on the grid's inner container, not just window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [visible, measure, options.length]);

  const choose = (option: Option) => {
    selectingRef.current = false;
    setOpen(false);
    if (option.kind === "assembly") onSelectAssembly?.(option.assembly);
    else onSelect(option.item);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // While the list is showing it owns the arrows and Enter — otherwise the grid's
    // cursor would move a row underneath an open dropdown.
    if (visible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight(h => (h + 1 + options.length) % options.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setHighlight(h => (h < 0 ? options.length - 1 : (h - 1 + options.length) % options.length));
        return;
      }
      if (e.key === "Enter" && highlight >= 0) {
        e.preventDefault();
        e.stopPropagation();
        choose(options[highlight]);
        return;
      }
      if (e.key === "Enter") {
        // Nothing highlighted (a linked line being renamed): drop the list and let
        // Enter do what it does with no list open — save the typed name.
        setOpen(false);
      }
      if (e.key === "Escape") {
        // First Escape closes the list, a second cancels the edit — so dismissing a
        // dropdown never throws away what you typed.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        return;
      }
    }
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
      return;
    }
    onKeyDown?.(e);
  };

  const MAX_LIST_HEIGHT = 256;
  const spaceBelow = anchorRect ? window.innerHeight - anchorRect.bottom : 0;
  // Flip above only when below genuinely can't hold the list — a dropdown that jumps
  // sides on a row near the fold is worse than one that's a little short.
  const flipUp = anchorRect != null && spaceBelow < 140 && anchorRect.top > spaceBelow;

  return (
    <div ref={anchorRef} className="relative w-full h-full">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (selectingRef.current) return;
          setOpen(false);
          onCommit?.();
        }}
        onFocus={e => {
          initialTermRef.current = e.target.value.trim();
          e.target.select();
        }}
        className={className}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={visible ? "price-list-picker-list" : undefined}
        data-testid={testId}
      />
      {visible && anchorRect && createPortal(
        <ul
          id="price-list-picker-list"
          role="listbox"
          className="fixed z-[60] overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md"
          style={{
            left: Math.min(anchorRect.left, window.innerWidth - 360),
            width: Math.max(anchorRect.width, 352),
            maxHeight: MAX_LIST_HEIGHT,
            // A modal Radix dialog sets pointer-events:none on everything outside its
            // content, and this list is portalled to <body> — so without this the
            // options render perfectly and simply cannot be clicked.
            pointerEvents: "auto",
            ...(flipUp
              ? { bottom: window.innerHeight - anchorRect.top + 4 }
              : { top: anchorRect.bottom + 4 }),
          }}
          // Same reason in reverse: the dialog treats a pointerdown outside its
          // subtree as "dismiss me". Stop it here so picking an item doesn't shut
          // the dialog the item was meant to fill in.
          onPointerDown={e => e.stopPropagation()}
          data-testid="list-price-list-suggestions"
        >
          {assemblyResults.length > 0 && (
            <li role="presentation" className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Assemblies
            </li>
          )}
          {options.map((option, i) => {
            const common = {
              active: i === highlight,
              onHover: () => setHighlight(i),
              onPick: () => choose(option),
              onPickStart: () => { selectingRef.current = true; },
            };
            if (option.kind === "assembly") {
              return <AssemblyOption key={`a-${option.assembly.id}`} assembly={option.assembly} {...common} />;
            }
            return (
              <PriceListOptionWithDivider
                key={option.item.id}
                item={option.item}
                first={i === assemblyResults.length && assemblyResults.length > 0}
                {...common}
              />
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}

function PriceListOption({
  item,
  active,
  onHover,
  onPick,
  onPickStart,
}: {
  item: PriceListLookupItem;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  onPickStart: () => void;
}) {
  const cents = useMemo(() => lookupItemExGstCents(item), [item]);
  return (
    <li
      role="option"
      aria-selected={active}
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 px-2 py-1.5 text-xs",
        active && "bg-primary/[0.08]",
      )}
      // mousedown fires before the input's blur, so this is where the guard has to
      // be raised; the actual pick happens on mouseup/click.
      onMouseDown={e => { e.preventDefault(); onPickStart(); }}
      onMouseEnter={onHover}
      onClick={onPick}
      data-testid={`option-price-list-item-${item.id}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[item.code, item.listName].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap pt-0.5 text-[11px] text-muted-foreground">
        <Tag
          className="h-3 w-3"
          style={item.listColour ? { color: item.listColour } : undefined}
        />
        {formatCents(cents)} / {item.unitType}
      </span>
    </li>
  );
}

function PriceListOptionWithDivider({ first, ...props }: Parameters<typeof PriceListOption>[0] & { first: boolean }) {
  if (!first) return <PriceListOption {...props} />;
  return (
    <>
      <li role="presentation" className="mt-1 border-t border-border px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Price list
      </li>
      <PriceListOption {...props} />
    </>
  );
}

function AssemblyOption({
  assembly,
  active,
  onHover,
  onPick,
  onPickStart,
}: {
  assembly: AssemblyWithComponents;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  onPickStart: () => void;
}) {
  // Per-unit rate on the right where a price-list row shows its unit cost;
  // fixed costs on the second line so the name keeps its room.
  const { perUnitExTax, fixedExTax } = useMemo(() => assemblyRateBreakdown(assembly.components), [assembly]);
  const money = (d: number) => formatCents(dollarsToCents(d), { alwaysShowDecimals: true });
  const n = assembly.components.length;
  return (
    <li
      role="option"
      aria-selected={active}
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 px-2 py-1.5 text-xs",
        active && "bg-primary/[0.08]",
      )}
      onMouseDown={e => { e.preventDefault(); onPickStart(); }}
      onMouseEnter={onHover}
      onClick={onPick}
      data-testid={`option-assembly-${assembly.id}`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-1.5">
        <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{assembly.name}</span>
            <span className="shrink-0 rounded bg-primary/10 px-1 py-px text-[10px] font-medium text-primary">Assembly</span>
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {n} component{n === 1 ? "" : "s"}
            {fixedExTax > 0 ? ` · + ${money(fixedExTax)} fixed` : ""}
          </span>
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] text-muted-foreground">
        {money(perUnitExTax)} / {assembly.unitType}
      </span>
    </li>
  );
}
