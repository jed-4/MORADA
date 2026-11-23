/**
 * The estimate grid, drawn for an estimate TEMPLATE.
 *
 * The template page used to draw its own flat table — a sticky header, grey
 * group header rows, and a hand-rolled SortableRow with a fixed set of columns.
 * It looked nothing like the estimate page it produces, which was the complaint.
 *
 * This renders the real thing instead: the same EstimateGroupCard, the same
 * cells from estimateGridRow.tsx, the same configurable columns and cell
 * cursor. Templates and estimates store their lines differently, so everything
 * that differs is confined to the two adapters at the top of this file.
 *
 * Column layout is remembered under its OWN viewKey, so widening a column here
 * doesn't reach into the estimate page and vice versa.
 */
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent, DragMoveEvent, CollisionDetection } from "@dnd-kit/core";
import {
  NEST_ZONE_BOTTOM,
  NEST_ZONE_TOP,
  descendantsOf,
  hiddenGroupIds,
  planGroupDrop,
  type DropTarget,
  type GroupMove,
} from "@/components/estimates/estimateDragTypes";
import {
  UNGROUPED,
  currentTree,
  layoutTemplateGroups,
  templateDescendants,
  templateGroupOrder,
  templateGroupParents,
} from "@/components/estimates/templateGroupTree";
import { computeEstimateItemPrice, round2 } from "@shared/pricing";
import type { CostCode, CostCategory, EstimateItem, EstimateGroup, FieldCategoryWithOptions } from "@shared/schema";
import { EstimateGroupCard } from "@/components/estimates/EstimateGroupCard";
import { useResizableColumns, ColResizeHandle } from "@/components/useResizableColumns";
import {
  renderEstimateItemWithSubItems,
  type EstimateGridCtx,
  type ColumnConfig,
} from "@/components/estimates/estimateGridRow";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { BulkEditDropdown } from "@/components/estimates/BulkEditDropdown";
import { priceListItemToLineFields, priceListSelectToast } from "@/components/estimates/PriceListItemPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Columns3, Trash2 } from "lucide-react";
import { useCommitOnDismiss } from "@/hooks/useCommitOnDismiss";

// ─── The template's own row shape ────────────────────────────────────────────
// Mirrors the TemplateItem in EstimateTemplateDetail. `isGroup` rows have been
// part of this array's contract from the start — the apply-to-estimate path in
// EstimateDetail already filters them out — they were simply never written.

export interface TemplateItem {
  id: string;
  groupName?: string;
  name: string;
  description?: string;
  costCodeId?: string;
  costCodeTitle?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number; // cents
  /**
   * The catalogue item this line's cost came from.
   *
   * Template lines are JSON, so this needs no migration. It was never carried:
   * toEstimateItem hard-coded priceListItemId to null and the picker was wired
   * to a no-op, so a template could hold a cost but never say where it came
   * from — and a template built in July quietly carried July's prices forever.
   */
  priceListItemId?: string | null;
  markup?: number;
  allowance?: string;
  wastagePercent?: number;
  type?: string;
  sortOrder: number;
  isGroup: boolean;
  parentGroupName?: string;
  /** Group rows only. Kept off line rows so the apply path is unaffected. */
  isCollapsed?: boolean;
  /**
   * Whether the line appears on the proposal, and how. Pre-set here so they
   * don't have to be redone on every estimate the template is applied to (#18).
   * Missing on lines written before this existed: those read as visible, which
   * is what applying them has always produced.
   */
  proposalVisible?: boolean;
  shownAs?: string;
}

const TAX_RATE = 10;

// ─── Adapters ────────────────────────────────────────────────────────────────
// A template line and an estimate line are the same idea with different field
// names and a different money unit (templates store cents, estimate lines store
// dollars as doubles — see CLAUDE.md "Money"). Everything that differs lives
// here so the shared renderer never has to know which page it is drawing.

function toEstimateItem(t: TemplateItem): EstimateItem {
  return {
    id: t.id,
    name: t.name || "",
    description: t.description || "",
    costCode: t.costCodeId || "",
    unitType: t.unit || "",
    quantity: t.quantity ?? 0,
    unitCostExTax: (t.unitPrice ?? 0) / 100,
    markupPercent: t.markup ?? 0,
    allowance: t.allowance || "None",
    wastagePercent: t.wastagePercent ?? 0,
    type: t.type || "Material",
    groupId: t.groupName || UNGROUPED,
    // A template has no per-line workflow state and no sub-items. It does carry
    // proposal visibility and Shown As, so they round-trip through the template.
    status: "",
    shownAs: t.shownAs || "price",
    proposalVisible: t.proposalVisible ?? true,
    notes: "",
    parentItemId: null,
    isSelection: false,
    priceListItemId: t.priceListItemId ?? null,
  } as unknown as EstimateItem;
}

/**
 * Typing a cost by hand takes the line off the catalogue.
 *
 * The estimate route enforces this server-side so every path obeys it; a
 * template has no server, and toTemplatePatch is its single write path, so the
 * rule lives beside it. Skipped when the same write SETS the link, because
 * that is the link being made — picking a catalogue item writes cost and link
 * together. Everything else about a line — name, quantity, markup — keeps it.
 */
export function unlinkIfRepriced(
  existing: TemplateItem,
  patch: Partial<TemplateItem>,
  data: Record<string, any>,
): Partial<TemplateItem> {
  if ("priceListItemId" in data) return {};
  if (!existing.priceListItemId) return {};
  const costChanged = patch.unitPrice !== undefined && patch.unitPrice !== existing.unitPrice;
  return costChanged ? { priceListItemId: null } : {};
}

/** Reverse of toEstimateItem for the fields the shared cells can write. */
export function toTemplatePatch(
  data: Record<string, any>,
  costCodes: CostCode[],
): Partial<TemplateItem> {
  const patch: Partial<TemplateItem> = {};
  if ("name" in data) patch.name = data.name;
  if ("description" in data) patch.description = data.description;
  if ("quantity" in data) patch.quantity = Number(data.quantity) || 0;
  if ("unitType" in data) patch.unit = data.unitType;
  if ("type" in data) patch.type = data.type;
  if ("allowance" in data) patch.allowance = data.allowance;
  if ("wastagePercent" in data) patch.wastagePercent = Number(data.wastagePercent) || 0;
  if ("markupPercent" in data) patch.markup = Number(data.markupPercent) || 0;
  // The shared markup cell saves under the COLUMN name, "markup", not the field
  // name. Nothing here read it, so the patch came back empty and every markup
  // edit in a template was silently discarded — the cell snapped back to its old
  // value. Most visible as a markup that couldn't be taken to 0% (HIA Contract
  // stuck at 8%), but a change to any other value was lost the same way.
  if ("markup" in data) patch.markup = Number(data.markup) || 0;
  if ("unitCostExTax" in data) patch.unitPrice = Math.round((Number(data.unitCostExTax) || 0) * 100);
  // Where the cost came from. Picking from the catalogue sets it; typing a cost
  // by hand clears it, because the line no longer matches what it was linked to
  // — the same rule the estimate page follows (#67).
  if ("priceListItemId" in data) patch.priceListItemId = data.priceListItemId ?? null;
  if ("costCode" in data) {
    const cc = costCodes.find((c) => c.id === data.costCode);
    patch.costCodeId = data.costCode || undefined;
    patch.costCodeTitle = cc ? `${cc.code} - ${cc.title}` : undefined;
  }
  // Template lines are JSON, so these persist with no migration. They were
  // dropped here on the belief that a template had nowhere to put them.
  if ("proposalVisible" in data) patch.proposalVisible = !!data.proposalVisible;
  if ("shownAs" in data) patch.shownAs = data.shownAs;
  // status / notes remain estimate-only: a template has no workflow.
  return patch;
}

/** Where a cell's editor reads its starting value, when that isn't the column id. */
const CELL_FIELD_SOURCE: Record<string, string> = {
  markup: "markupPercent",
};

// ─── Columns ─────────────────────────────────────────────────────────────────
/**
 * Every column this grid can draw, and which of them start on.
 *
 * The list used to be fixed and entirely visible, with no picker: the four
 * derived money columns the estimate offers simply did not exist here, and the
 * ones that did could not be turned off. The estimate's own toggles live on
 * `visible`, so the same shape is kept and a picker drives it.
 */
const TEMPLATE_DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "item", label: "Item", visible: true, widthPx: 240 },
  { id: "description", label: "Description", visible: true, widthPx: 180 },
  { id: "costCode", label: "Cost Code", visible: true, widthPx: 120 },
  { id: "type", label: "Type", visible: true, widthPx: 100 },
  { id: "proposalVisible", label: "Proposal", visible: true, widthPx: 72 },
  { id: "shownAs", label: "Shown As", visible: true, widthPx: 84 },
  { id: "allowance", label: "Allowance", visible: true, widthPx: 84 },
  { id: "quantity", label: "Qty", visible: true, widthPx: 64 },
  { id: "wastage", label: "Waste", visible: true, widthPx: 60 },
  { id: "unitType", label: "Unit", visible: true, widthPx: 60 },
  { id: "unitCostExTax", label: "Unit Cost", visible: true, widthPx: 92 },
  { id: "markup", label: "Markup", visible: true, widthPx: 72 },
  { id: "builderCost", label: "Builder Cost", visible: true, widthPx: 100 },
  { id: "clientPriceExTax", label: "Client (ex)", visible: true, widthPx: 100 },
  { id: "clientPriceIncTax", label: "Client (inc)", visible: true, widthPx: 100 },
  // Derived from what is already on the row, so they cost nothing to carry and
  // are off until asked for — the same defaults the estimate uses.
  { id: "unitCostIncTax", label: "Unit Cost (inc)", visible: false, widthPx: 92 },
  { id: "builderCostIncTax", label: "Builder Cost (inc)", visible: false, widthPx: 105 },
  { id: "markupDollarAmount", label: "Markup $", visible: false, widthPx: 90 },
  { id: "clientTax", label: "Tax", visible: false, widthPx: 70 },
];

const COLUMN_VISIBILITY_KEY = "estimate-template-grid:columns";

/**
 * Which columns are on, read from localStorage and MERGED against the list
 * above rather than trusted wholesale.
 *
 * A stored array is a snapshot of the columns that existed when it was saved:
 * taken as-is, a column added later is missing from it, missing reads as off,
 * and its checkbox appears to do nothing forever. Unknown ids fall back to
 * their default and ids that no longer exist are dropped.
 */
function readColumnVisibility(): Record<string, boolean> {
  const merged: Record<string, boolean> = {};
  for (const c of TEMPLATE_DEFAULT_COLUMNS) merged[c.id] = c.visible;
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (!raw) return merged;
    const saved = JSON.parse(raw) as Record<string, boolean>;
    for (const c of TEMPLATE_DEFAULT_COLUMNS) {
      if (typeof saved[c.id] === "boolean") merged[c.id] = saved[c.id];
    }
  } catch {
    // A private window, or something else wrote nonsense there. Defaults.
  }
  return merged;
}

interface Props {
  items: TemplateItem[];
  onSave: (next: TemplateItem[]) => void;
  costCodes: CostCode[];
  costCategories: CostCategory[];
  formatCurrency: (n: number) => string;
  /**
   * Deleting a line is confirmed by the page's dialog, not done here. The old
   * template grid asked before removing a row and the shared cells do not, so
   * without this the move would have quietly turned a confirmed delete into an
   * instant one.
   */
  onRequestDelete: (id: string) => void;
}

export function TemplateEstimateGrid({
  items,
  onSave,
  costCodes,
  costCategories,
  formatCurrency,
  onRequestDelete,
}: Props) {
  // Order and widths come from useResizableColumns — the same hook the allowance
  // detail and price-list tables use — so this grid gets drag-to-reorder and
  // drag-to-resize headers instead of a fixed layout, and behaves like the rest
  // of the app's bespoke grids rather than being a third way of doing columns.
  // Read once, synchronously, so the first paint already has the right columns.
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(readColumnVisibility);

  const toggleColumn = useCallback((id: string) => {
    setColumnVisibility((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(next)); } catch { /* not worth an error */ }
      return next;
    });
  }, []);

  const taskCols = useResizableColumns(
    "estimate-template-grid",
    TEMPLATE_DEFAULT_COLUMNS.filter((c) => columnVisibility[c.id] !== false).map((c) => ({
      key: c.id,
      defaultWidth: c.widthPx,
      flex: c.id === "item",     // the item name soaks up the leftover width
    })),
    0,
    { reorderable: true },
  );
  /**
   * The newest copy of the lines, including edits not yet drawn.
   *
   * Every write here rewrites the whole list, and `items` only catches up on
   * the next render. Two edits close together (Enter on one quantity, then
   * straight into the next) used to build the second from the list as it was
   * BEFORE the first, so the second save quietly put the first one back.
   * Writes start from this instead; it only takes `items` when the page
   * hands over a genuinely new list.
   */
  const latestItems = useRef(items);
  const seenItems = useRef(items);
  if (seenItems.current !== items) {
    seenItems.current = items;
    latestItems.current = items;
  }
  const commit = useCallback(
    (build: (current: TemplateItem[]) => TemplateItem[]) => {
      const next = build(latestItems.current);
      latestItems.current = next;
      onSave(next);
    },
    [onSave],
  );

  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [activeCell, setActiveCell] = useState<{ itemId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const { toast } = useToast();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  /* The catalogue items this template's lines are linked to, so a linked line
     can be marked as one. Same shape as the estimate page: ids sorted for a
     stable query key, and no request at all when nothing is linked — which is
     every template written before this. */
  const linkedPriceListIds = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.priceListItemId).filter(Boolean) as string[])).sort(),
    [items],
  );
  const { data: linkedPriceListItems = [] } = useQuery<any[]>({
    queryKey: ["/api/price-list/items/by-ids", linkedPriceListIds.join(",")],
    queryFn: async () => {
      const res = await fetch(
        `/api/price-list/items/by-ids?ids=${encodeURIComponent(linkedPriceListIds.join(","))}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: linkedPriceListIds.length > 0,
  });
  const priceListItemMap = useMemo(
    () => new Map(linkedPriceListItems.map((i) => [i.id, i])),
    [linkedPriceListItems],
  );
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // NOTE: this grid used to persist its layout server-side under the view key
  // "estimate_template_detail". That followed a user between devices, which the
  // hook's localStorage does not — but it was only introduced with this grid, so
  // no one has a saved layout to lose, and having ONE owner of column state
  // beats two stores disagreeing about the same table.

  const { data: statusCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.status"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const { data: unitCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.unit"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // ── Derive groups ──────────────────────────────────────────────────────────
  // A group's identity is its NAME, not a generated id. Lines link to their
  // group by `groupName`, and that is what the apply-to-estimate path reads —
  // so keeping name as the id means group metadata can be added without
  // re-pointing a single line, and an older template with no group rows at all
  // still renders.
  const lineItems = useMemo(() => items.filter((i) => !i.isGroup), [items]);
  const groupRows = useMemo(() => items.filter((i) => i.isGroup), [items]);

  const groups: EstimateGroup[] = useMemo(() => {
    const byName = new Map<string, TemplateItem>();
    groupRows.forEach((g) => byName.set(g.name || UNGROUPED, g));

    // Group rows first (they carry the author's ordering), then any group that
    // only exists as a name on a line — i.e. every template written before
    // groups became real records. A group's parent comes from its row's
    // parentGroupName; `order` is its place in that list, which is all the
    // shared card needs to sort siblings.
    const order = templateGroupOrder(items);
    const parents = templateGroupParents(items);

    return order.map((name, idx) => ({
      id: name,
      parentGroupId: parents.get(name) ?? null,
      order: idx,
      name: name === UNGROUPED ? "General" : name,
      description: byName.get(name)?.description || null,
      isCollapsed: byName.get(name)?.isCollapsed ?? false,
      // A group row's costCodeId is the group's DEFAULT: new lines added to the
      // group start on it, and applying the template gives the estimate's group
      // the same default. EstimateGroupCard shows it as a badge by the name.
      defaultCostCode: byName.get(name)?.costCodeId || null,
    }) as unknown as EstimateGroup);
  }, [groupRows, items]);

  const groupedItems: Record<string, EstimateItem[]> = useMemo(() => {
    const out: Record<string, EstimateItem[]> = {};
    groups.forEach((g) => { out[g.id] = []; });
    lineItems
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .forEach((i) => {
        const g = i.groupName || UNGROUPED;
        (out[g] ||= []).push(toEstimateItem(i));
      });
    return out;
  }, [groups, lineItems]);

  // ── Pricing ────────────────────────────────────────────────────────────────
  const calculatePricingValues = useCallback((item: EstimateItem) => {
    const priced = computeEstimateItemPrice({
      unitCostExTax: item.unitCostExTax,
      quantity: item.quantity,
      markupPercent: item.markupPercent,
      taxRate: TAX_RATE,
      wastagePercent: (item as any).wastagePercent,
    } as any);
    return {
      unitCostIncTax: priced.unitCostIncTax,
      builderCost: priced.builderCost,
      builderCostIncTax: priced.builderCostIncTax,
      markupPercent: item.markupPercent,
      clientPriceExTax: priced.lineExTax,
      clientTax: priced.taxAmount,
      clientPriceIncTax: priced.lineIncTax,
    };
  }, []);

  const groupTotalsMap = useMemo(() => {
    const out: Record<string, any> = {};
    groups.forEach((g) => {
      const rows = groupedItems[g.id] || [];
      const t = rows.reduce(
        (acc, r) => {
          const p = calculatePricingValues(r);
          acc.builderCostExTax += p.builderCost;
          acc.builderCostIncTax += p.builderCostIncTax;
          acc.clientAmountExTax += p.clientPriceExTax;
          acc.clientTax += p.clientTax;
          acc.clientAmountIncTax += p.clientPriceIncTax;
          return acc;
        },
        { builderCostExTax: 0, builderCostIncTax: 0, clientAmountExTax: 0, clientTax: 0, clientAmountIncTax: 0 },
      );
      out[g.id] = t;
    });
    // A parent's figures include everything nested under it, as on the
    // estimate (calculateGroupTotals). Deepest groups first, so each child is
    // final before it is added to its parent.
    const depth = (id: string) => {
      let d = 0;
      let cur = (groups.find((x) => x.id === id) as any)?.parentGroupId;
      while (cur && d < 50) { d++; cur = (groups.find((x) => x.id === cur) as any)?.parentGroupId; }
      return d;
    };
    groups
      .slice()
      .sort((a, b) => depth(b.id) - depth(a.id))
      .forEach((g) => {
        const parent = (g as any).parentGroupId as string | null;
        if (!parent || !out[parent]) return;
        for (const k of Object.keys(out[g.id])) out[parent][k] += out[g.id][k];
      });
    groups.forEach((g) => {
      const t = out[g.id];
      out[g.id] = {
        builderCostExTax: round2(t.builderCostExTax),
        builderCostIncTax: round2(t.builderCostIncTax),
        clientAmountExTax: round2(t.clientAmountExTax),
        clientTax: round2(t.clientTax),
        clientAmountIncTax: round2(t.clientAmountIncTax),
      };
    });
    return out;
  }, [groups, groupedItems, calculatePricingValues]);

  /** The units this template's own Field Settings list offers. */
  const templateUnitNames = useMemo(
    () => ((unitCategory?.options ?? []) as any[]).map((o) => o.name).filter(Boolean) as string[],
    [unitCategory],
  );

  // ── Writes ─────────────────────────────────────────────────────────────────
  /**
   * Bulk edit, through the same menu the estimate page uses.
   *
   * The checkboxes have rendered on this grid since it was written and nothing
   * consumed the selection — you could tick twenty rows and the page did
   * nothing, which reads as broken rather than missing.
   *
   * BulkEditDropdown hands back a patch in ESTIMATE-ITEM terms and
   * toTemplatePatch already knows how to land that on a template line, money
   * unit and all. So the only template-specific part is the group, which is a
   * NAME here rather than an id.
   */
  const applyBulk = useCallback(
    (itemIds: string[], data: Record<string, any>) => {
      const ids = new Set(itemIds);
      const patch = toTemplatePatch(data, costCodes);
      // groupId is not in toTemplatePatch — on a template it is a group NAME,
      // and "none" means ungrouped.
      const movesGroup = "groupId" in data;
      const groupName = data.groupId === UNGROUPED || data.groupId === "none" ? undefined : data.groupId;
      if (Object.keys(patch).length === 0 && !movesGroup) return;
      commit((current) =>
        current.map((i) =>
          ids.has(i.id) && !i.isGroup
            ? {
                ...i,
                ...patch,
                ...(movesGroup ? { groupName } : {}),
                // Bulk-setting a cost unlinks too — the same rule as typing one.
                ...unlinkIfRepriced(i, patch, data),
              }
            : i,
        ),
      );
    },
    [commit, costCodes],
  );

  /**
   * The Group option's choices.
   *
   * BulkEditDropdown takes EstimateGroup rows because that is what a job
   * estimate has. A template's groups are names on its lines, so each is
   * presented as a pseudo-group whose id IS its name — which is exactly what
   * applyBulk then writes to groupName.
   */
  const templateGroupsForBulk = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => !i.isGroup)
            .map((i) => i.groupName)
            .filter((n): n is string => !!n && n !== UNGROUPED),
        ),
      )
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: name, name }) as unknown as EstimateGroup),
    [items],
  );

  const deleteSelected = useCallback(() => {
    const ids = selectedItems;
    if (ids.size === 0) return;
    commit((current) => current.filter((i) => !ids.has(i.id) || i.isGroup));
    setSelectedItems(new Set());
  }, [commit, selectedItems]);

  const patchItem = useCallback(
    (itemId: string, data: Record<string, any>) => {
      const patch = toTemplatePatch(data, costCodes);
      if (Object.keys(patch).length === 0) return;
      commit((current) =>
        current.map((i) => (i.id === itemId ? { ...i, ...patch, ...unlinkIfRepriced(i, patch, data) } : i)),
      );
    },
    [commit, costCodes],
  );

  /**
   * The shared cells call `updateItemMutation.mutate({ itemId, data })` with
   * estimate field names. A template saves by rewriting the whole blob, so this
   * stands in for the react-query mutation with the same call shape.
   */
  const updateItemMutation = useMemo(
    () => ({ mutate: ({ itemId, data }: { itemId: string; data: any }) => patchItem(itemId, data), isPending: false }),
    [patchItem],
  );

  const noopMutation = useMemo(() => ({ mutate: () => {}, isPending: false }), []);

  const handleCellEdit = useCallback((item: EstimateItem, field: string) => {
    // A cell's column name and the field it holds differ for markup; reading
    // item.markup found nothing, so the editor opened blank.
    const raw = (item as any)[CELL_FIELD_SOURCE[field] ?? field];
    setEditingCell({ itemId: item.id, field });
    setActiveCell({ itemId: item.id, field });
    setEditingValue(raw == null ? "" : String(raw));
  }, []);

  const handleCellSave = useCallback(
    (item: EstimateItem, field: string) => {
      patchItem(item.id, { [field]: editingValue });
      setEditingCell(null);
      setEditingValue("");
      gridRef.current?.focus();
    },
    [editingValue, patchItem],
  );

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
    gridRef.current?.focus();
  }, []);

  // The template grid has no type-to-open path yet, so every editor here opens
  // on a value the user means to replace.
  const handleEditorFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.select(),
    [],
  );

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, item: EstimateItem, field: string) => {
      if (e.key === "Enter") { e.preventDefault(); handleCellSave(item, field); }
      else if (e.key === "Escape") { e.preventDefault(); handleCellCancel(); }
    },
    [handleCellSave, handleCellCancel],
  );

  const handleToggleSelection = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  /**
   * The list with a real row for every group, in the order they show.
   *
   * A group that only exists as a name on its lines has nowhere to keep
   * anything (collapsed, a description, a parent). Giving it a row used to
   * APPEND one, and since group rows are read before name-only groups, that
   * quietly moved the group up the page. Laying the rows out in place keeps
   * every group where it was.
   */
  const withGroupRows = (current: TemplateItem[]) => {
    const { parentOf, orderOf } = currentTree(current);
    return layoutTemplateGroups(current, parentOf, orderOf);
  };

  const setGroupCollapsed = useCallback(
    (groupName: string, collapsed: boolean) => {
      commit((current) =>
        withGroupRows(current).map((i) =>
          i.isGroup && (i.name || UNGROUPED) === groupName ? { ...i, isCollapsed: collapsed } : i,
        ),
      );
    },
    [commit],
  );

  /**
   * Edit a group's name, description and default cost code (the template's
   * "Edit Group" used to be a no-op).
   *
   * Upserts the group row the way setGroupCollapsed does. Lines link to their
   * group by NAME, so a rename re-points every line in the group too — otherwise
   * they would silently fall out of it into a new name-only group.
   */
  const updateGroup = useCallback(
    (groupName: string, next: { name: string; description: string; costCodeId?: string }): boolean => {
      const items = withGroupRows(latestItems.current);
      const newName = next.name.trim() || groupName;
      // A group IS its name — lines and subgroups find it that way — so two
      // groups can't share one. Renaming onto an existing name would merge
      // them silently, which is not what anyone renaming means.
      if (newName !== groupName && templateGroupOrder(items).includes(newName)) {
        toast({
          title: "That name is taken",
          description: `This template already has a group called "${newName}". Group names need to be different, including subgroups.`,
          variant: "destructive",
        });
        return false;
      }
      const cc = costCodes.find((c) => c.id === next.costCodeId);
      const groupFields = {
        name: newName,
        description: next.description || undefined,
        costCodeId: next.costCodeId || undefined,
        costCodeTitle: cc ? `${cc.code} - ${cc.title}` : undefined,
      };
      const renamed = newName !== groupName;
      let found = false;
      const updated = items.map((i) => {
        if (i.isGroup && (i.name || UNGROUPED) === groupName) {
          found = true;
          return { ...i, ...groupFields };
        }
        if (renamed && !i.isGroup && (i.groupName || UNGROUPED) === groupName) {
          return { ...i, groupName: newName === UNGROUPED ? undefined : newName };
        }
        // Subgroups point at their parent by name too.
        if (renamed && i.isGroup && i.parentGroupName === groupName) {
          return { ...i, parentGroupName: newName };
        }
        return i;
      });
      commit(() =>
        found
          ? updated
          : [...updated, { id: crypto.randomUUID(), isGroup: true, sortOrder: items.length, ...groupFields } as TemplateItem],
      );
      return true;
    },
    [commit, costCodes, toast],
  );

  // ── Edit Group dialog ──────────────────────────────────────────────────────
  // `groupName` is the name the group had when opened, which is its identity.
  const [editingGroup, setEditingGroup] = useState<
    { groupName: string; name: string; description: string; costCodeId: string } | null
  >(null);

  const openGroupEditor = useCallback(
    (groupName: string) => {
      const row = items.find((i) => i.isGroup && (i.name || UNGROUPED) === groupName);
      setEditingGroup({
        groupName,
        name: groupName === UNGROUPED ? "General" : groupName,
        description: row?.description ?? "",
        costCodeId: row?.costCodeId ?? "",
      });
    },
    [items],
  );

  const groupEditorIsDirty = () => {
    if (!editingGroup) return false;
    const row = items.find((i) => i.isGroup && (i.name || UNGROUPED) === editingGroup.groupName);
    const originalName = editingGroup.groupName === UNGROUPED ? "General" : editingGroup.groupName;
    return (
      editingGroup.name !== originalName ||
      editingGroup.description !== (row?.description ?? "") ||
      editingGroup.costCodeId !== (row?.costCodeId ?? "")
    );
  };

  const saveGroupEditor = () => {
    if (!editingGroup) return;
    if (groupEditorIsDirty()) {
      const { groupName, name, description, costCodeId } = editingGroup;
      // "General" is the display name of the ungrouped bucket, not a real name.
      const keepUngrouped = groupName === UNGROUPED && name.trim() === "General";
      const ok = updateGroup(groupName, {
        name: keepUngrouped ? UNGROUPED : name,
        description,
        costCodeId: costCodeId || undefined,
      });
      if (!ok) return; // keep the dialog open so the name can be changed
    }
    setEditingGroup(null);
  };

  // ── Description dialog ─────────────────────────────────────────────────────
  // The shared Description cell only sets editingCell; the estimate page owns
  // the dialog that then opens. This grid never had one, so clicking a
  // template line's description did nothing and the column could never be
  // filled in.
  const editingDescriptionItem =
    editingCell?.field === "description" ? items.find((i) => i.id === editingCell.itemId) : undefined;

  const saveDescription = () => {
    if (!editingDescriptionItem) return;
    patchItem(editingDescriptionItem.id, { description: editingValue });
    setEditingCell(null);
    setEditingValue("");
  };

  const descriptionDialogDismiss = useCommitOnDismiss({
    isDirty: () =>
      !!editingDescriptionItem && (editingValue ?? "") !== (editingDescriptionItem.description ?? ""),
    commit: saveDescription,
    discard: () => {
      setEditingCell(null);
      setEditingValue("");
    },
  });

  const groupEditorDismiss = useCommitOnDismiss({
    isDirty: groupEditorIsDirty,
    commit: saveGroupEditor,
    discard: () => setEditingGroup(null),
  });

  const addItemToGroup = useCallback(
    (groupName: string) => {
      const items = latestItems.current;
      // New lines start on the group's default cost code, as on an estimate.
      const groupRow = items.find((i) => i.isGroup && (i.name || UNGROUPED) === groupName);
      commit(() => [
        ...items,
        {
          id: crypto.randomUUID(),
          name: "",
          groupName: groupName === UNGROUPED ? undefined : groupName,
          costCodeId: groupRow?.costCodeId,
          costCodeTitle: groupRow?.costCodeTitle,
          quantity: 1,
          unitPrice: 0,
          markup: 0,
          proposalVisible: false,
          shownAs: "price",
          wastagePercent: 0,
          allowance: "None",
          type: "Material",
          sortOrder: items.length,
          isGroup: false,
        } as TemplateItem,
      ]);
    },
    [items, onSave],
  );

  /**
   * Delete a group with everything in it — its lines AND its subgroups, at any
   * depth. Leaving subgroups behind would orphan them at the top level, which
   * is the opposite of what deleting a section you've finished with means.
   */
  const deleteGroup = useCallback(
    (groupName: string) => {
      commit((current) => {
        const doomed = templateDescendants(templateGroupParents(current), groupName);
        doomed.add(groupName);
        return current.filter((i) =>
          i.isGroup ? !doomed.has(i.name || UNGROUPED) : !doomed.has(i.groupName || UNGROUPED),
        );
      });
    },
    [commit],
  );

  /**
   * Deleting a group asks first, saying what goes with it. It used to delete
   * on the click; with subgroups, one click can now take a whole section.
   */
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const groupDeleteSummary = useMemo(() => {
    if (!groupToDelete) return null;
    const parents = templateGroupParents(items);
    const inside = templateDescendants(parents, groupToDelete);
    const all = new Set(inside);
    all.add(groupToDelete);
    const lines = items.filter((i) => !i.isGroup && all.has(i.groupName || UNGROUPED)).length;
    return { subgroups: inside.size, lines };
  }, [groupToDelete, items]);

  /**
   * Add Subgroup (from the group's menu). Was a no-op on templates. The new
   * subgroup goes last inside its parent with a unique name, and the Edit
   * Group dialog opens straight away to name it.
   */
  const addSubgroup = useCallback(
    (parentName: string) => {
      if (parentName === UNGROUPED) {
        toast({ title: "Name this group first", description: "General holds ungrouped lines and can't contain subgroups." });
        return;
      }
      const existing = new Set(templateGroupOrder(latestItems.current));
      let name = "New Subgroup";
      for (let n = 2; existing.has(name); n++) name = `New Subgroup ${n}`;
      commit((current) => {
        const rows = withGroupRows(current);
        const { parentOf, orderOf } = currentTree(rows);
        const withChild = [
          ...rows,
          { id: crypto.randomUUID(), name, isGroup: true, isCollapsed: false, parentGroupName: parentName, sortOrder: rows.length } as TemplateItem,
        ];
        parentOf.set(name, parentName);
        orderOf.set(name, Number.MAX_SAFE_INTEGER); // last among its siblings
        return layoutTemplateGroups(withChild, parentOf, orderOf);
      });
      setEditingGroup({ groupName: name, name, description: "", costCodeId: "" });
    },
    [commit, toast],
  );

  // ── Group drag: nest, un-nest, reorder ──────────────────────────────────────
  // The same gesture and the same rules as the estimate page (#315), through
  // the same pure planner: the middle band of a group header drops the group
  // INSIDE it (last child); the top/bottom edges drop it beside it, which is
  // how groups reorder and how a subgroup is pulled back out.
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const setDropTargetSync = (t: DropTarget | null) => {
    dropTargetRef.current = t;
    setDropTarget(t);
  };

  // The live pointer. Reconstructing it from dnd-kit's rect + delta counts the
  // movement twice (the rect is already translated) — see estimateDragTypes.
  const pointerYRef = useRef<number | null>(null);
  useEffect(() => {
    const track = (e: PointerEvent) => { pointerYRef.current = e.clientY; };
    document.addEventListener("pointermove", track, { passive: true });
    document.addEventListener("pointerup", track, { passive: true });
    return () => {
      document.removeEventListener("pointermove", track);
      document.removeEventListener("pointerup", track);
    };
  }, []);

  const handleDragMove = useCallback(
    (e: DragMoveEvent) => {
      const activeIdStr = String(e.active.id);
      if (!activeIdStr.startsWith("group-")) return;
      const cursorY = pointerYRef.current;
      if (cursorY == null) return;
      const dragged = activeIdStr.slice("group-".length);

      // Not into itself, its own subtree, or a group hidden inside a collapsed
      // one (clipped, not removed, so it still measures full height).
      const blocked = descendantsOf(groups as any, dragged);
      blocked.add(dragged);
      for (const id of Array.from(hiddenGroupIds(groups as any))) blocked.add(id);

      const headers: { id: string; top: number; height: number; midpoint: number }[] = [];
      gridRef.current?.querySelectorAll("[data-group-header-id]").forEach((el) => {
        const gid = el.getAttribute("data-group-header-id");
        if (!gid || blocked.has(gid)) return;
        const r = el.getBoundingClientRect();
        if (r.height === 0) return;
        headers.push({ id: gid, top: r.top, height: r.height, midpoint: r.top + r.height / 2 });
      });
      if (headers.length === 0) { setDropTargetSync(null); return; }
      headers.sort((a, b) => a.top - b.top);

      // General is the bucket for ungrouped lines: it can't hold subgroups and
      // can't go inside another group.
      const canNest = (targetId: string) => dragged !== UNGROUPED && targetId !== UNGROUPED;
      const nestOver = headers.find(
        (h) => cursorY >= h.top + h.height * NEST_ZONE_TOP && cursorY <= h.top + h.height * NEST_ZONE_BOTTOM,
      );
      if (nestOver && canNest(nestOver.id)) {
        setDropTargetSync({ id: `group-${nestOver.id}`, position: "inside" });
        return;
      }
      if (cursorY < headers[0].midpoint) {
        setDropTargetSync({ id: `group-${headers[0].id}`, position: "above" });
        return;
      }
      // Below a header: beside the last header above the cursor.
      let above = headers[0];
      for (const h of headers) if (h.midpoint <= cursorY) above = h;
      setDropTargetSync({ id: `group-${above.id}`, position: "below" });
    },
    [groups],
  );

  const applyGroupMoves = useCallback(
    (moves: GroupMove[]) => {
      commit((current) => {
        const rows = withGroupRows(current);
        const { parentOf, orderOf } = currentTree(rows);
        // planGroupDrop orders are per parent; currentTree's are global. Only
        // relative order among siblings is read, so a moved level is
        // re-sequenced on its own scale, after everything already there.
        const base = rows.length + 1;
        for (const m of moves) {
          orderOf.set(m.id, base + m.order);
          if ("parentGroupId" in m) parentOf.set(m.id, m.parentGroupId ?? null);
        }
        return layoutTemplateGroups(rows, parentOf, orderOf);
      });
    },
    [commit],
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      const target = dropTargetRef.current;
      setDropTargetSync(null);
      const { active, over } = e;
      const activeIdStr = String(active.id);

      if (activeIdStr.startsWith("group-")) {
        if (!target) return;
        const dragged = activeIdStr.slice("group-".length);
        const targetId = target.id.slice("group-".length);
        const moves = planGroupDrop(groups as any, dragged, targetId, target.position);
        // General stays top level whichever way it is dropped.
        if (moves.some((m) => m.id === UNGROUPED && m.parentGroupId)) return;
        if (moves.length > 0) applyGroupMoves(moves);
        return;
      }

      const items = latestItems.current;
      if (!over || active.id === over.id) return;
      const ordered = items.filter((i) => !i.isGroup).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const from = ordered.findIndex((i) => i.id === active.id);
      const to = ordered.findIndex((i) => i.id === over.id);
      if (from < 0 || to < 0) return;
      // Dropping a line onto a line in another group moves it into that group,
      // which used to be ignored: it changed position in a list nobody sees and
      // stayed put on screen.
      const destinationGroup = ordered[to].groupName;
      const moved = arrayMove(ordered, from, to).map((i, idx) =>
        i.id === active.id ? { ...i, sortOrder: idx, groupName: destinationGroup } : { ...i, sortOrder: idx },
      );
      const byId = new Map(moved.map((i) => [i.id, i]));
      commit((current) => current.map((i) => byId.get(i.id) ?? i));
    },
    [groups, applyGroupMoves, commit],
  );

  /** Item drags resolve `over` to a line only. A group card's rect encloses all
      of its rows, so closestCenter would otherwise hand the drop to the card. */
  const collisionDetection: CollisionDetection = useCallback(
    (args) =>
      String(args.active.id).startsWith("group-")
        ? closestCenter(args)
        : closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith("group-")),
          }),
    [],
  );

  // ── Layout ─────────────────────────────────────────────────────────────────
  // EstimateGroupCard and the shared cell renderer both take ColumnConfig[], and
  // they map over it — so reordering here reorders the data with it, for free.
  const labelFor = useMemo(
    () => new Map(TEMPLATE_DEFAULT_COLUMNS.map((c) => [c.id, c.label])),
    [],
  );
  const columns: ColumnConfig[] = useMemo(
    () => taskCols.cols.map((c) => ({
      id: c.key,
      label: labelFor.get(c.key) ?? c.key,
      visible: true,
      widthPx: c.width,
    })),
    [taskCols.cols, labelFor],
  );
  const visibleCols = columns;
  const gridTemplate = `40px ${taskCols.gridTemplate} 80px`;
  const tableWidth = 40 + taskCols.minWidth + 80;

  const ctx: EstimateGridCtx = {
    editingCell, activeCell, editingValue, setEditingValue, setEditingCell, setActiveCell,
    handleCellEdit, handleCellSave, handleCellCancel, handleCellKeyDown, handleEditorFocus,
    handlePriceListSelect: (item, picked) => {
      setEditingCell(null);
      setEditingValue("");
      // priceListItemToLineFields is the SHARED helper the estimate page uses,
      // so a template line gets the same treatment: cost ex GST, the cost code
      // for provenance, and the unit only when this grid's own unit list has
      // it. toTemplatePatch then lands all of that in template terms.
      patchItem(item.id, priceListItemToLineFields(picked, { allowedUnits: templateUnitNames }));
      toast(priceListSelectToast(picked));
    },
    estimate: { isLocked: false, taxRate: TAX_RATE, projectMarkupPercent: null },
    columns,
    costCodes,
    costCategories,
    priceListItemMap,
    poLinkMap: new Map(),
    selectionByEstimateItemId: new Map(),
    estimateItemStatusCategory: statusCategory,
    estimateItemUnitCategory: unitCategory,
    calculatePricingValues,
    formatCurrency,
    getSubItems: () => [],            // templates are one level deep
    selectedItems,
    handleToggleSelection,
    collapsedItems: new Set(),
    handleToggleItemCollapse: () => {},
    dropTarget: null,
    activeId,
    updateItemMutation,
    createSelectionFromItemMutation: noopMutation,
    handleDuplicateItem: (id: string) => {
      commit((current) => {
        const src = current.find((i) => i.id === id);
        return src ? [...current, { ...src, id: crypto.randomUUID(), sortOrder: current.length }] : current;
      });
    },
    handleCopyItem: () => {},
    form: { reset: () => {} },
    setEditingItemId: () => {},
    setIsEditDialogOpen: () => {},
    setIsAddItemOpen: () => {},
    setItemToDelete: (id: string | null) => { if (id) onRequestDelete(id); },
    setIsDeleteDialogOpen: () => {},
    setLocation: () => {},
    // Was `() => {}`, so every message the shared cells raised — a price-list
    // confirmation, a unit that could not come across, a failed save — went
    // nowhere. The grid looked silent when it was actually trying to speak.
    toast,
  };

  const renderItemRow = useCallback(
    (item: EstimateItem, groupContext?: any, gt?: string, vc?: ColumnConfig[], rowIndex?: number) =>
      renderEstimateItemWithSubItems(ctx, item, groupContext, gt, vc, rowIndex ?? 0),
    [ctx],
  );

  return (
    <div className="flex-1 min-h-0 overflow-auto" ref={gridRef} tabIndex={-1}>
      <div style={{ width: tableWidth, minWidth: "100%" }}>
        {/* Column headings — the group cards draw their own rows beneath.
            Laid out exactly as the live estimate's header, which sits over the
            same EstimateGroupCard:
            - OPAQUE. bg-muted/50 was a half-transparent fill on a sticky header,
              so rows showed through it as they scrolled up underneath.
            - pl-px, and no padding around the cards below. The cards were
              wrapped in p-1.5 on top of their own 1px border, so every body
              column sat 7px right of its heading; the live estimate offsets the
              header by just the border. */}
        {/* Columns picker. The header row itself reorders and resizes; this is
            what turns a column on or off, which this grid had no way to do. */}
        <div className="sticky top-0 z-40 flex items-center gap-2 bg-card px-2 py-1 border-b border-border">
          {/* Selection bar, mirroring the estimate page. Nothing consumed the
              selection before, so the checkboxes were decoration. */}
          {selectedItems.size > 0 && (
            // Pinned LEFT as well as top: this bar lives inside the grid's
            // horizontal scroller, so without it the selection controls slide
            // off the screen the moment you scroll right to reach the columns
            // you wanted to bulk-edit.
            <div className="sticky left-0 flex items-center gap-2 bg-card pr-2">
              <span className="text-xs font-medium whitespace-nowrap" data-testid="text-selected-count">
                {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} selected
              </span>
              <BulkEditDropdown
                // No estimate behind a template, so the route is never used —
                // onApply takes over. The id is still required by the props.
                estimateId=""
                selectedItemIds={Array.from(selectedItems)}
                groups={templateGroupsForBulk}
                unitOptions={(unitCategory?.options as any) || []}
                statusOptions={[]}
                taxRate={TAX_RATE}
                // A template has no per-line workflow and no tax of its own:
                // it is cost data that gets priced when it is used.
                omitFields={["status", "unitCostIncTax"]}
                onApply={applyBulk}
                onComplete={() => setSelectedItems(new Set())}
              />
              <button
                className="h-6 w-auto px-2 text-xs border border-destructive/30 text-destructive rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                onClick={deleteSelected}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <button
                className="h-6 w-auto px-2 text-xs border border-border/50 text-muted-foreground rounded-md hover-elevate active-elevate-2"
                onClick={() => setSelectedItems(new Set())}
                data-testid="button-clear-selection"
              >
                Clear
              </button>
            </div>
          )}
          <div className="ml-auto" />
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                title="Columns"
                aria-label="Columns"
                data-testid="button-template-column-visibility"
              >
                <Columns3 className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-2" data-testid="popover-template-columns">
              <div className="px-1.5 pt-1 text-sm font-semibold">Columns</div>
              <p className="px-1.5 pb-2 text-xs text-muted-foreground">
                Drag a heading to reorder · toggle to show or hide.
              </p>
              <div className="max-h-80 overflow-y-auto space-y-0.5 pr-0.5">
                {TEMPLATE_DEFAULT_COLUMNS.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-1.5 py-1 rounded-sm hover-elevate cursor-pointer text-sm"
                    data-testid={`template-column-toggle-${c.id}`}
                  >
                    <Checkbox
                      checked={columnVisibility[c.id] !== false}
                      onCheckedChange={() => toggleColumn(c.id)}
                    />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div
          className="grid items-center h-7 bg-card border-b border-border sticky top-0 z-30 pl-px text-data font-semibold uppercase tracking-wide text-muted-foreground select-none"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div />
          {visibleCols.map((c) => (
            <div
              key={c.id}
              {...taskCols.headerDragProps(c.id)}
              style={{ opacity: taskCols.draggingKey === c.id ? 0.4 : 1 }}
              title="Drag to move · drag the edge to resize"
              data-testid={`tpl-col-${c.id}`}
              className={`relative px-2 truncate select-none cursor-grab active:cursor-grabbing transition-opacity ${
                ["quantity", "unitCostExTax", "markup", "builderCost", "clientPriceExTax", "clientPriceIncTax"].includes(c.id)
                  ? "text-right"
                  : ["type", "allowance", "wastage"].includes(c.id)
                    ? "text-center"
                    : ""
              }`}
            >
              {c.label}
              <ColResizeHandle
                onStart={(e) => taskCols.startResize(c.id, e.clientX, c.widthPx)}
                testId={`tpl-col-resize-${c.id}`}
              />
            </div>
          ))}
          <div />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragMove={handleDragMove}
          onDragCancel={() => { setActiveId(null); setDropTargetSync(null); }}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={[...groups.map((g) => `group-${g.id}`), ...lineItems.map((i) => i.id)]}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {groups.filter((g) => !(g as any).parentGroupId).map((group, idx) => (
                <EstimateGroupCard
                  key={group.id}
                  group={group}
                  groupedItems={groupedItems}
                  columns={columns}
                  tableWidth={tableWidth}
                  gridTemplate={gridTemplate}
                  visibleCols={visibleCols}
                  groupIndex={idx}
                  handleToggleGroupCollapse={(id, current) => setGroupCollapsed(id, !current)}
                  renderItemRow={renderItemRow}
                  onDeleteGroup={setGroupToDelete}
                  onEditGroup={openGroupEditor}
                  onEditGroupDescription={openGroupEditor}
                  onDuplicateGroup={() => {}}
                  onCopyGroup={() => {}}
                  onAddSubgroup={addSubgroup}
                  subgroups={groups.filter((g) => !!(g as any).parentGroupId)}
                  allGroups={groups}
                  dropTarget={dropTarget}
                  onAddItemToGroup={addItemToGroup}
                  isLocked={false}
                  selectedItems={selectedItems}
                  selectedGroups={selectedGroups}
                  onToggleGroupSelection={(id) =>
                    setSelectedGroups((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                  groupTotals={groupTotalsMap[group.id]}
                  groupTotalsMap={groupTotalsMap}
                  formatCurrency={formatCurrency}
                  costCodes={costCodes}
                  costCategories={costCategories}
                  onCreateFrom={() => {}}
                  activeDragId={activeId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Delete group — confirm, with what goes with it. */}
      <Dialog open={!!groupToDelete} onOpenChange={(open) => { if (!open) setGroupToDelete(null); }}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>
              Delete {groupToDelete === UNGROUPED ? "General" : `"${groupToDelete}"`}?
            </DialogTitle>
          </DialogHeader>
          {groupDeleteSummary && (
            <p className="text-sm text-muted-foreground" data-testid="text-template-group-delete-summary">
              This removes {groupDeleteSummary.lines} line{groupDeleteSummary.lines === 1 ? "" : "s"}
              {groupDeleteSummary.subgroups > 0
                ? ` and ${groupDeleteSummary.subgroups} subgroup${groupDeleteSummary.subgroups === 1 ? "" : "s"}`
                : ""}{" "}
              from this template.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupToDelete(null)} data-testid="button-cancel-template-group-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (groupToDelete) deleteGroup(groupToDelete);
                setGroupToDelete(null);
              }}
              data-testid="button-confirm-template-group-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Description — the same dialog the estimate page opens. */}
      <Dialog open={!!editingDescriptionItem} onOpenChange={descriptionDialogDismiss.onOpenChange}>
        <DialogContent className="max-w-2xl rounded-xl" {...descriptionDialogDismiss.contentProps}>
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <RichTextEditor
              content={editingValue}
              onChange={(html) => setEditingValue(html)}
              placeholder="Enter description..."
              data-testid="richtext-template-item-description"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditingCell(null); setEditingValue(""); }}
              data-testid="button-cancel-template-description"
            >
              Cancel
            </Button>
            <Button onClick={saveDescription} data-testid="button-save-template-description">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Group — clicking away keeps the edit, as on the estimate. */}
      <Dialog open={!!editingGroup} onOpenChange={groupEditorDismiss.onOpenChange}>
        <DialogContent className="max-w-lg rounded-xl" {...groupEditorDismiss.contentProps}>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          {editingGroup && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-group-name">Name</Label>
                <Input
                  id="tpl-group-name"
                  value={editingGroup.name}
                  onChange={(e) => setEditingGroup((g) => (g ? { ...g, name: e.target.value } : g))}
                  data-testid="input-template-group-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default cost code</Label>
                <CostCodeSelect
                  value={editingGroup.costCodeId || "none"}
                  onValueChange={(v) =>
                    setEditingGroup((g) => (g ? { ...g, costCodeId: v === "none" ? "" : v } : g))
                  }
                  data-testid="select-template-group-cost-code"
                />
                <p className="text-xs text-muted-foreground">
                  New lines in this group start on it, and the estimate's group gets it when the template is applied.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <RichTextEditor
                  content={editingGroup.description}
                  onChange={(html) => setEditingGroup((g) => (g ? { ...g, description: html } : g))}
                  placeholder="Describe this stage of the work — this appears on the proposal..."
                  data-testid="richtext-template-group-description"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGroup(null)} data-testid="button-cancel-template-group">
              Cancel
            </Button>
            <Button onClick={saveGroupEditor} data-testid="button-save-template-group">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
