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
import type { DragEndEvent } from "@dnd-kit/core";
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
const UNGROUPED = "ungrouped";

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
    priceListItemId: null,
  } as unknown as EstimateItem;
}

/** Reverse of toEstimateItem for the fields the shared cells can write. */
function toTemplatePatch(
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
// The estimate page's 16 defaults minus the columns a template has no data for.

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
];

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
  const taskCols = useResizableColumns(
    "estimate-template-grid",
    TEMPLATE_DEFAULT_COLUMNS.map((c) => ({
      key: c.id,
      defaultWidth: c.widthPx,
      flex: c.id === "item",     // the item name soaks up the leftover width
    })),
    0,
    { reorderable: true },
  );
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [activeCell, setActiveCell] = useState<{ itemId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
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

    const order: string[] = [];
    const seen = new Set<string>();
    // Group rows first (they carry the author's ordering), then any group that
    // only exists as a name on a line — i.e. every template written before
    // groups became real records.
    groupRows.forEach((g) => {
      const n = g.name || UNGROUPED;
      if (!seen.has(n)) { seen.add(n); order.push(n); }
    });
    lineItems.forEach((i) => {
      const n = i.groupName || UNGROUPED;
      if (!seen.has(n)) { seen.add(n); order.push(n); }
    });
    if (order.length === 0) order.push(UNGROUPED);

    return order.map((name) => ({
      id: name,
      name: name === UNGROUPED ? "General" : name,
      description: byName.get(name)?.description || null,
      isCollapsed: byName.get(name)?.isCollapsed ?? false,
      // A group row's costCodeId is the group's DEFAULT: new lines added to the
      // group start on it, and applying the template gives the estimate's group
      // the same default. EstimateGroupCard shows it as a badge by the name.
      defaultCostCode: byName.get(name)?.costCodeId || null,
    }) as unknown as EstimateGroup);
  }, [groupRows, lineItems]);

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

  // ── Writes ─────────────────────────────────────────────────────────────────
  const patchItem = useCallback(
    (itemId: string, data: Record<string, any>) => {
      const patch = toTemplatePatch(data, costCodes);
      if (Object.keys(patch).length === 0) return;
      onSave(items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
    },
    [items, onSave, costCodes],
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

  const setGroupCollapsed = useCallback(
    (groupName: string, collapsed: boolean) => {
      const existing = items.find((i) => i.isGroup && (i.name || UNGROUPED) === groupName);
      if (existing) {
        onSave(items.map((i) => (i.id === existing.id ? { ...i, isCollapsed: collapsed } : i)));
        return;
      }
      // First time this group is touched it becomes a real record. Lines are
      // untouched — they still link by name.
      onSave([
        ...items,
        {
          id: crypto.randomUUID(),
          name: groupName,
          isGroup: true,
          isCollapsed: collapsed,
          sortOrder: items.length,
        } as TemplateItem,
      ]);
    },
    [items, onSave],
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
    (groupName: string, next: { name: string; description: string; costCodeId?: string }) => {
      const newName = next.name.trim() || groupName;
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
        return i;
      });
      onSave(
        found
          ? updated
          : [...updated, { id: crypto.randomUUID(), isGroup: true, sortOrder: items.length, ...groupFields } as TemplateItem],
      );
    },
    [items, onSave, costCodes],
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
      updateGroup(groupName, {
        name: keepUngrouped ? UNGROUPED : name,
        description,
        costCodeId: costCodeId || undefined,
      });
    }
    setEditingGroup(null);
  };

  const groupEditorDismiss = useCommitOnDismiss({
    isDirty: groupEditorIsDirty,
    commit: saveGroupEditor,
    discard: () => setEditingGroup(null),
  });

  const addItemToGroup = useCallback(
    (groupName: string) => {
      // New lines start on the group's default cost code, as on an estimate.
      const groupRow = items.find((i) => i.isGroup && (i.name || UNGROUPED) === groupName);
      onSave([
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

  const deleteGroup = useCallback(
    (groupName: string) => {
      onSave(
        items.filter(
          (i) => !(i.isGroup && (i.name || UNGROUPED) === groupName) && (i.groupName || UNGROUPED) !== groupName,
        ),
      );
    },
    [items, onSave],
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ordered = items.filter((i) => !i.isGroup).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const from = ordered.findIndex((i) => i.id === active.id);
      const to = ordered.findIndex((i) => i.id === over.id);
      if (from < 0 || to < 0) return;
      const moved = arrayMove(ordered, from, to).map((i, idx) => ({ ...i, sortOrder: idx }));
      const byId = new Map(moved.map((i) => [i.id, i]));
      onSave(items.map((i) => byId.get(i.id) ?? i));
    },
    [items, onSave],
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
    handlePriceListSelect: () => {},
    estimate: { isLocked: false, taxRate: TAX_RATE, projectMarkupPercent: null },
    columns,
    costCodes,
    costCategories,
    priceListItemMap: new Map(),
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
      const src = items.find((i) => i.id === id);
      if (!src) return;
      onSave([...items, { ...src, id: crypto.randomUUID(), sortOrder: items.length }]);
    },
    handleCopyItem: () => {},
    form: { reset: () => {} },
    setEditingItemId: () => {},
    setIsEditDialogOpen: () => {},
    setIsAddItemOpen: () => {},
    setItemToDelete: (id: string | null) => { if (id) onRequestDelete(id); },
    setIsDeleteDialogOpen: () => {},
    setLocation: () => {},
    toast: () => {},
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
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={lineItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div>
              {groups.map((group, idx) => (
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
                  onDeleteGroup={deleteGroup}
                  onEditGroup={openGroupEditor}
                  onEditGroupDescription={openGroupEditor}
                  onDuplicateGroup={() => {}}
                  onCopyGroup={() => {}}
                  onAddSubgroup={() => {}}
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
