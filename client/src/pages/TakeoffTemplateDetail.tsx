import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Loader2, Calculator, ChevronDown, ChevronRight,
  ChevronsDownUp, ChevronsUpDown, Columns3, Search, GripVertical,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import {
  COLOR_SWATCHES,
  FILL_PATTERN_OPTIONS,
  LINE_SIZE_OPTIONS,
  LINE_TYPE_OPTIONS,
  TYPE_OPTIONS,
  UNIT_OPTIONS,
  type MeasurementType,
} from "@/components/takeoff/TakeoffMeasurementFormModal";
import type { TakeoffTemplate, TakeoffTemplateItem } from "@shared/takeoffTemplates";
import { useResizableColumns, type ResizableColumn } from "@/components/useResizableColumns";

/**
 * Edit one take-off template's items.
 *
 * The whole point of this page is to build a kit WITHOUT drawing first. Save
 * as template, inside a take-off, can only capture measurements that already
 * exist — so a standard set could never be set up ahead of a job, only
 * harvested from one.
 *
 * Items are edited in place and saved as a whole array, because that is how
 * they are stored: one JSON blob on company_settings, not rows. The unsaved
 * state lives here and is written on Save, rather than a mutation per
 * keystroke against a blob.
 */

/** A sensible starting point, matching the measurement defaults in the schema. */
/** Items with no category of their own still need somewhere to live. */
export const UNCATEGORISED = "Uncategorised";

/**
 * The items, gathered under their category, each keeping its REAL index.
 *
 * Grouping is a view: the items are stored as one flat array, so every row has
 * to carry the index it actually sits at. Rendering a group's items by their
 * position WITHIN the group would make an edit or a delete land on whichever
 * item happened to hold that index in the whole array — the wrong one, almost
 * always, and silently.
 *
 * Group order follows first appearance rather than the alphabet, so the order
 * a builder arranged their template in survives.
 */
export function groupItems(items: TakeoffTemplateItem[]) {
  const groups: Array<{ name: string; rows: Array<{ item: TakeoffTemplateItem; index: number }> }> = [];
  const byName = new Map<string, number>();
  items.forEach((item, index) => {
    const name = item.categoryName?.trim() || UNCATEGORISED;
    let at = byName.get(name);
    if (at === undefined) {
      at = groups.length;
      byName.set(name, at);
      groups.push({ name, rows: [] });
    }
    groups[at].rows.push({ item, index });
  });
  return groups;
}

function blankItem(categoryName: string | null = null): TakeoffTemplateItem {
  return {
    name: "",
    measurementType: "area",
    color: COLOR_SWATCHES[0],
    categoryName,
    multiplier: 1,
    wastePercent: 0,
    heightMm: null,
    fillPattern: "solid",
    lineType: "solid",
    lineSize: 2,
    unit: "m²",
  };
}

/**
 * Keep a stored value selectable even when it is not one of the offered options.
 *
 * The pickers are the ones the drawing form offers, but the stored value does
 * not have to come from there — `lineSize` is an integer column and the form
 * offers only 1-3, and a fill pattern written by older code may not be in the
 * current list. A Radix Select given a value it has no item for renders BLANK,
 * and can emit an empty onValueChange when it is first opened, which would
 * quietly rewrite a template the builder never touched.
 *
 * So anything already stored is appended to its own list, marked as what it
 * is, and survives a save untouched.
 */
function withStoredValue<T extends { value: string; label: string }>(
  options: readonly T[],
  stored: string | undefined | null,
): Array<{ value: string; label: string }> {
  const list = options.map((o) => ({ value: o.value, label: o.label }));
  if (stored && !list.some((o) => o.value === stored)) {
    list.push({ value: stored, label: `${stored} (saved)` });
  }
  return list;
}

/** Stands in for the empty unit a "manual" item may legitimately have. */
const BLANK_UNIT = "__none__";

/**
 * The editor's columns.
 *
 * Through `useResizableColumns` — the shared primitive the template grid, the
 * labour sheet, the price list and the allowance tables all use. Widths and
 * order persist per namespace, so a builder arranges this once.
 *
 * Reordering only works because the row below MAPS over `cols`. A grid that
 * lists its cells positionally in JSX keeps drawing them in source order while
 * the headers move, which is why the primitive makes reorder opt-in.
 */
const COLUMNS: ResizableColumn[] = [
  { key: "color", defaultWidth: 56, fixed: true },
  { key: "name", defaultWidth: 240, flex: true },
  { key: "category", defaultWidth: 150 },
  { key: "measurementType", defaultWidth: 110 },
  { key: "unit", defaultWidth: 90 },
  { key: "heightMm", defaultWidth: 100 },
  { key: "fillPattern", defaultWidth: 130 },
  { key: "lineType", defaultWidth: 115 },
  { key: "lineSize", defaultWidth: 85 },
  { key: "wastePercent", defaultWidth: 85 },
];

const COLUMN_LABELS: Record<string, string> = {
  color: "",
  name: "Item",
  category: "Category",
  measurementType: "Measures",
  unit: "Unit",
  heightMm: "Height mm",
  fillPattern: "Fill",
  lineType: "Line",
  lineSize: "Weight",
  wastePercent: "Waste %",
};

function defaultUnitFor(type: string): string {
  if (type === "area") return "m²";
  if (type === "linear") return "lm";
  if (type === "count") return "each";
  return "";
}

export default function TakeoffTemplateDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: templates, isLoading } = useQuery<TakeoffTemplate[]>({
    queryKey: ["/api/takeoff-templates"],
  });
  const template = templates?.find((t) => t.id === params.id);

  const [items, setItems] = useState<TakeoffTemplateItem[]>([]);
  const [dirty, setDirty] = useState(false);

  // Seed once the template arrives. Keyed on the id so opening a different
  // template replaces the draft rather than merging into it, and guarded on
  // `dirty` so a background refetch cannot wipe unsaved edits mid-typing.
  useEffect(() => {
    if (!template || dirty) return;
    setItems(template.items ?? []);
  }, [template?.id, template?.items, dirty]);

  const save = useMutation({
    mutationFn: async () => apiRequest(`/api/takeoff-templates/${params.id}`, "PATCH", { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoff-templates"] });
      setDirty(false);
      toast({ title: "Template saved" });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const update = (index: number, patch: Partial<TakeoffTemplateItem>) => {
    setDirty(true);
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const unitsFor = (type: string): string[] =>
    UNIT_OPTIONS[(type as MeasurementType)] ?? UNIT_OPTIONS.manual;

  const invalid = useMemo(
    () => items.some((i) => !i.name.trim()),
    [items],
  );

  const [search, setSearch] = useState("");

  /**
   * Search filters the VIEW, never the array.
   *
   * Rows keep their true index through the filter, so an edit made while
   * searching still lands on the right item — and Save always writes the whole
   * template, not just what matched.
   *
   * A category whose NAME matches keeps all of its items, so searching
   * "Tiling" gives you the section rather than nothing.
   */
  const term = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const all = groupItems(items);
    if (!term) return all;
    return all
      .map((group) => {
        if (group.name.toLowerCase().includes(term)) return group;
        return { ...group, rows: group.rows.filter((r) => r.item.name.toLowerCase().includes(term)) };
      })
      .filter((group) => group.rows.length > 0);
  }, [items, term]);

  const matchCount = useMemo(
    () => groups.reduce((n, g) => n + g.rows.length, 0),
    [groups],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.name));

  /** Existing category names, offered as you type rather than imposed. */
  const categoryNames = useMemo(
    () =>
      Array.from(
        new Set(items.map((i) => i.categoryName?.trim()).filter((n): n is string => !!n)),
      ).sort((a, b) => a.localeCompare(b)),
    [items],
  );

  /**
   * Move a whole category above another, taking its items with it.
   *
   * The array IS the order — it is what the editor renders from and what the
   * apply path numbers categories and measurements by — so reordering here is
   * a rebuild of the array, category block by category block. Items keep their
   * order within their own category.
   *
   * Native HTML5 drag, matching the column headers rather than adding a
   * dnd-kit context for the sake of one list.
   */
  const moveCategory = (from: string, to: string) => {
    if (from === to) return;
    setDirty(true);
    setItems((prev) => {
      const blocks = groupItems(prev);
      const fromAt = blocks.findIndex((g) => g.name === from);
      const toAt = blocks.findIndex((g) => g.name === to);
      if (fromAt === -1 || toAt === -1) return prev;
      const reordered = blocks.slice();
      reordered.splice(toAt, 0, reordered.splice(fromAt, 1)[0]);
      return reordered.flatMap((g) => g.rows.map((r) => r.item));
    });
  };
  /**
   * The category being dragged.
   *
   * A REF, not state, because the dragover handler needs it synchronously —
   * React has not re-rendered between dragstart and the first dragover, so a
   * state value read there is still null and the drop does nothing. This is
   * the same reason useResizableColumns keeps its dragged column at module
   * level; the state below exists only to grey out the row being moved.
   */
  const dragCategoryRef = useRef<string | null>(null);
  const [dragCategory, setDragCategory] = useState<string | null>(null);

  /**
   * Rename a category across every item in it.
   *
   * A template has no category rows — each item carries a `categoryName`
   * string — so the name is only editable per item, one at a time, which for a
   * category holding twenty lines is not a rename at all. This rewrites the
   * whole group.
   *
   * Renaming ONTO an existing category merges the two, deliberately: that is
   * how "Fix out" and "Fix Out" get reconciled, and grouping is by trimmed
   * name, so the merge is what the editor shows the moment it saves.
   */
  const renameCategory = (from: string, to: string) => {
    const next = to.trim();
    if (!next || next === from) return;
    setDirty(true);
    setCollapsed((prev) => {
      const s2 = new Set(prev);
      if (s2.delete(from)) s2.add(next);
      return s2;
    });
    setItems((prev) =>
      prev.map((item) =>
        (item.categoryName?.trim() || UNCATEGORISED) === from
          ? { ...item, categoryName: next === UNCATEGORISED ? null : next }
          : item,
      ),
    );
  };
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const beginCategoryDrag = (name: string) => {
    dragCategoryRef.current = name;
    setDragCategory(name);
  };
  const endCategoryDrag = () => {
    dragCategoryRef.current = null;
    setDragCategory(null);
  };

  const toggleGroup = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  /** Add an item at the END of its category, so it lands where you are looking. */
  const addItem = (categoryName: string | null) => {
    setDirty(true);
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(categoryName?.trim() || UNCATEGORISED);
      return next;
    });
    setItems((prev) => {
      const key = categoryName?.trim() || UNCATEGORISED;
      let lastInGroup = -1;
      prev.forEach((item, i) => {
        if ((item.categoryName?.trim() || UNCATEGORISED) === key) lastInGroup = i;
      });
      const fresh = blankItem(categoryName);
      if (lastInGroup === -1) return [...prev, fresh];
      return [...prev.slice(0, lastInGroup + 1), fresh, ...prev.slice(lastInGroup + 1)];
    });
  };

  const { cols, gridTemplate, minWidth, startResize, headerDragProps, draggingKey, resetOrder } =
    useResizableColumns("takeoff-template-items", COLUMNS, 40, { reorderable: true });

  /** One cell. Keyed by column so the header's order drives the row's order. */
  const renderCell = (key: string, item: TakeoffTemplateItem, index: number) => {
    switch (key) {
      case "color":
        return (
          <Select value={item.color} onValueChange={(color) => update(index, { color })}>
            <SelectTrigger className="h-8 w-full" data-testid={`select-color-${index}`}>
              <span
                className="h-4 w-4 rounded-full border border-border"
                style={{ backgroundColor: item.color }}
              />
            </SelectTrigger>
            <SelectContent>
              {COLOR_SWATCHES.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: c }} />
                    {c}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "name":
        return (
          <Input
            value={item.name}
            onChange={(e) => update(index, { name: e.target.value })}
            placeholder="Item name, e.g. Wall tiles"
            className="h-8 w-full"
            data-testid={`input-name-${index}`}
          />
        );

      case "category":
        // Free text, but offering what is already in use. A template is stored
        // with category NAMES, not ids, so two spellings make two categories —
        // and on apply, two real categories in the project.
        return (
          <Input
            value={item.categoryName ?? ""}
            onChange={(e) => update(index, { categoryName: e.target.value || null })}
            placeholder="Category"
            className="h-8 w-full"
            list="takeoff-template-categories"
            data-testid={`input-category-${index}`}
          />
        );

      case "measurementType":
        return (
          <Select
            value={item.measurementType}
            onValueChange={(measurementType) => {
              // The unit follows the type unless the current one still applies
              // — changing Area to Count must not leave "m²".
              const allowed = unitsFor(measurementType);
              update(index, {
                measurementType,
                unit: allowed.includes(item.unit ?? "") ? item.unit : defaultUnitFor(measurementType),
                // A wall height only means anything on a linear run.
                heightMm: measurementType === "linear" ? item.heightMm ?? null : null,
              });
            }}
          >
            <SelectTrigger className="h-8 w-full" data-testid={`select-type-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "unit":
        return (
          <Select
            value={item.unit || BLANK_UNIT}
            // A Radix Select cannot hold "" as a value — that means "no
            // selection" — so the blank unit a manual item is allowed to have
            // travels as a sentinel and is mapped back here.
            onValueChange={(unit) => update(index, { unit: unit === BLANK_UNIT ? "" : unit })}
          >
            <SelectTrigger className="h-8 w-full" data-testid={`select-unit-${index}`}>
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              {withStoredValue(
                unitsFor(item.measurementType).map((u) => ({ value: u || BLANK_UNIT, label: u || "—" })),
                item.unit || undefined,
              ).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "heightMm":
        // Wall height turns a run into an area, so it only applies to linear.
        // The cell stays present but empty, because the column is shared: a
        // row that dropped out of the grid would take its alignment with it.
        return item.measurementType === "linear" ? (
          <Input
            type="number"
            value={item.heightMm ?? ""}
            onChange={(e) =>
              update(index, { heightMm: e.target.value === "" ? null : Number(e.target.value) })
            }
            placeholder="Height mm"
            className="h-8 w-full"
            data-testid={`input-height-${index}`}
          />
        ) : null;

      case "fillPattern":
        return (
          <Select value={item.fillPattern ?? "solid"} onValueChange={(fillPattern) => update(index, { fillPattern })}>
            <SelectTrigger className="h-8 w-full" data-testid={`select-fill-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withStoredValue(FILL_PATTERN_OPTIONS, item.fillPattern).map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "lineType":
        return (
          <Select value={item.lineType ?? "solid"} onValueChange={(lineType) => update(index, { lineType })}>
            <SelectTrigger className="h-8 w-full" data-testid={`select-linetype-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withStoredValue(LINE_TYPE_OPTIONS, item.lineType).map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "lineSize":
        return (
          <Select value={String(item.lineSize ?? 2)} onValueChange={(v) => update(index, { lineSize: Number(v) })}>
            <SelectTrigger className="h-8 w-full" data-testid={`select-linesize-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withStoredValue(
                LINE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n}px` })),
                item.lineSize === undefined ? undefined : String(item.lineSize),
              ).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "wastePercent":
        return (
          <Input
            type="number"
            value={item.wastePercent}
            onChange={(e) => update(index, { wastePercent: Number(e.target.value) || 0 })}
            className="h-8 w-full"
            title="Waste %"
            data-testid={`input-waste-${index}`}
          />
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="loading-template">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/takeoff-templates")}
          >
            Take-offs
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">Not found</span>
        </div>
        <EmptyState
          icon={Calculator}
          title="Template not found"
          description="It may have been deleted. Pick another from the list."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="page-takeoff-template-detail">
      {/* Breadcrumb strip, then a header panel that is the top of one card the
          body closes — the Tasks/Timesheets pattern the app is migrating to,
          rather than the legacy full-bleed bar this page had. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/templates")}
          data-testid="link-templates"
        >
          Templates
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/takeoff-templates")}
          data-testid="button-back"
        >
          Take-offs
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground truncate" data-testid="text-page-title">
          {template.name}
        </span>
      </div>

      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
              {items.length} {items.length === 1 ? "item" : "items"}
              {groups.length > 1 && ` · ${groups.length} categories`}
            </span>
            {/* Always visible at w-40, the Timesheets variant of the pattern. */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items..."
                className="h-6 w-40 pl-7 pr-2 text-xs border border-border/50 rounded-md bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                data-testid="input-search-items"
              />
            </div>
            {search && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {matchCount} {matchCount === 1 ? "match" : "matches"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Icon-only, per the token rules, and it says which way it goes. */}
            {groups.length > 1 && (
              <button
                className="h-6 w-6 flex items-center justify-center text-xs border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2"
                onClick={() =>
                  setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.name)))
                }
                title={allCollapsed ? "Expand all categories" : "Collapse all categories"}
                aria-label={allCollapsed ? "Expand all categories" : "Collapse all categories"}
                data-testid="button-toggle-all-groups"
              >
                {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              className="h-6 w-6 flex items-center justify-center text-xs border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2"
              onClick={resetOrder}
              title="Put the columns back in their original order"
              aria-label="Reset column order"
              data-testid="button-reset-columns"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-0.5"
              onClick={() => addItem(null)}
              data-testid="button-add-item"
            >
              <Plus className="h-3 w-3" />
              Add Item
            </button>
            {/* Primary CTA is a raw button, per the pattern. */}
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 disabled:opacity-40 disabled:pointer-events-none"
              onClick={() => save.mutate()}
              // Blocked on a nameless item rather than silently saving one: an
              // item with no name is unusable on a plan and impossible to pick
              // out of a list afterwards.
              disabled={!dirty || invalid || save.isPending}
              title={invalid ? "Every item needs a name" : undefined}
              data-testid="button-save-template"
            >
              {save.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        {invalid && (
          <div className="px-3 py-1 text-xs text-destructive border-t border-border">
            Every item needs a name before this can be saved.
          </div>
        )}
      </div>

      {/* One list for every row's category field. */}
      <datalist id="takeoff-template-categories">
        {categoryNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex-1 overflow-auto min-h-0 border-x border-b border-border rounded-b-lg bg-card">
        {items.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="No items yet"
            description="Add the measurements this template should set up — what you measure, and how it is drawn."
            action={{
              label: "Add Item",
              icon: Plus,
              onClick: () => addItem(null),
              "data-testid": "button-add-first-item",
            }}
          />
        ) : (
          <div style={{ minWidth: `${minWidth}px` }}>
            {/* Column header — drag a label to reorder, drag its right edge to
                resize. Sticky so it survives scrolling an 87-item template,
                and inside the horizontal scroller so the labels stay over
                their own columns. */}
            <div
              className="sticky top-0 z-20 grid items-center bg-muted/70 backdrop-blur border-b border-border px-0 h-8 text-data font-medium text-muted-foreground uppercase tracking-wide select-none"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {cols.map((col) => (
                <div
                  key={col.key}
                  className={`relative flex items-center h-8 px-2 truncate ${
                    col.fixed ? "" : "cursor-grab"
                  } ${draggingKey === col.key ? "opacity-40" : ""}`}
                  title={col.fixed ? undefined : "Drag to move, drag the edge to resize"}
                  {...headerDragProps(col.key)}
                >
                  <span className="truncate">{COLUMN_LABELS[col.key] ?? col.key}</span>
                  {!col.fixed && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize group/resize z-10"
                      onMouseDown={(e) => startResize(col.key, e.clientX, col.width)}
                      title="Drag to resize"
                    >
                      <div className="w-px h-full bg-border/0 group-hover/resize:bg-border transition-colors" />
                    </div>
                  )}
                </div>
              ))}
              {/* Trailing delete column — no label, never moves. */}
              <div />
            </div>

            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.name);
              const needsName = group.rows.some((r) => !r.item.name.trim());
              return (
                <div key={group.name} data-testid={`group-${group.name}`}>
                  {/* The category band. With 87 items in a real template, a flat
                      list put a builder's Tiling items on five different screens. */}
                  <div
                    className={`sticky top-8 z-10 flex items-center gap-2 h-8 px-2 bg-muted border-y border-border ${
                      dragCategory === group.name ? "opacity-40" : ""
                    }`}
                    style={{ minWidth: `${minWidth}px` }}
                    // Dragging is disabled while searching: the visible groups
                    // are a filtered subset then, so a drop would reorder
                    // against a list the builder cannot see in full.
                    draggable={!term}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      beginCategoryDrag(group.name);
                    }}
                    onDragOver={(e) => {
                      const from = dragCategoryRef.current;
                      if (!from || term) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      // Reorder as you drag, not on drop — the drop event is
                      // the least reliable part of HTML5 drag-and-drop, and
                      // waiting for it means nothing moves until you let go.
                      if (from !== group.name) moveCategory(from, group.name);
                    }}
                    onDragEnd={endCategoryDrag}
                    onDrop={(e) => { e.preventDefault(); endCategoryDrag(); }}
                  >
                    {!term && (
                      <GripVertical
                        className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 cursor-grab"
                        aria-hidden
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => toggleGroup(group.name)}
                      aria-label={isCollapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                      data-testid={`button-toggle-group-${group.name}`}
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    {renamingCategory === group.name ? (
                      <input
                        autoFocus
                        value={categoryDraft}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        onBlur={() => { renameCategory(group.name, categoryDraft); setRenamingCategory(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); renameCategory(group.name, categoryDraft); setRenamingCategory(null); }
                          if (e.key === "Escape") { e.preventDefault(); setRenamingCategory(null); }
                        }}
                        list="takeoff-template-categories"
                        className="h-6 w-44 px-1 text-[13px] font-semibold bg-background border border-border rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                        aria-label={`Rename ${group.name}`}
                        data-testid={`input-rename-category-${group.name}`}
                      />
                    ) : (
                      <button
                        type="button"
                        // Uncategorised is where items with no category land,
                        // not a category — naming it would mean giving every
                        // one of them the same new category, which is not what
                        // renaming a heading looks like it does.
                        onDoubleClick={() => {
                          if (group.name === UNCATEGORISED) return;
                          setCategoryDraft(group.name);
                          setRenamingCategory(group.name);
                        }}
                        title={group.name === UNCATEGORISED ? undefined : "Double-click to rename"}
                        className={`text-[13px] font-semibold text-left ${group.name === UNCATEGORISED ? "text-muted-foreground cursor-default" : ""}`}
                        data-testid={`button-category-name-${group.name}`}
                      >
                        {group.name}
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {group.rows.length}
                    </span>
                    {/* Only worth saying while the group is shut — otherwise the
                        row's own empty name field is right there. */}
                    {needsName && isCollapsed && (
                      <span className="text-xs text-destructive">needs a name</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-6 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => addItem(group.name === UNCATEGORISED ? null : group.name)}
                      data-testid={`button-add-to-${group.name}`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>

                  {!isCollapsed &&
                    group.rows.map(({ item, index }) => (
                      <div
                        key={index}
                        className="grid items-center border-b border-border/60 hover:bg-muted/30"
                        style={{ gridTemplateColumns: gridTemplate, minWidth: `${minWidth}px` }}
                        data-testid={`row-template-item-${index}`}
                      >
                        {/* Cells are MAPPED over cols, never listed in source
                            order — that is the whole requirement for the header
                            reorder to move the data with the label. */}
                        {cols.map((col) => (
                          <div key={col.key} className="px-1 py-1 min-w-0">
                            {renderCell(col.key, item, index)}
                          </div>
                        ))}
                        <div className="flex items-center justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setDirty(true);
                              setItems((prev) => prev.filter((_, i) => i !== index));
                            }}
                            aria-label={`Remove ${item.name || "item"}`}
                            data-testid={`button-remove-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
