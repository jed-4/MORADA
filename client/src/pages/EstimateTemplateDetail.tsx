import { useState, useRef, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import type { CostCode } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  Trash2,
  ChevronDown,
  ChevronRight,
  Calculator,
  Settings,
  GripVertical,
  FolderPlus,
  Copy,
  Upload,
  Download,
  FileText,
} from "lucide-react";
import type { EstimateTemplate } from "@shared/schema";
import { TemplateEstimateGrid, newTemplateLine } from "@/components/estimates/TemplateEstimateGrid";
import {
  UNGROUPED,
  currentTree,
  layoutTemplateGroups,
  linesForApply,
  placeImportedGroups,
  templateGroupOrder,
  templateGroupParents,
} from "@/components/estimates/templateGroupTree";
import { formatGroupPath } from "@shared/import";
import {
  ImportEstimateItemsDialog,
  type ImportMergeMode,
} from "@/components/estimates/ImportEstimateItemsDialog";
import type { ImportEstimateItem } from "@shared/import";
import {
  exportEstimateRows,
  downloadBlankImportTemplate,
  type EstimateExportRow,
} from "@/lib/estimateSpreadsheet";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TemplateItem {
  id: string;
  groupName?: string;
  name: string;
  description?: string;
  costCodeId?: string;
  costCodeTitle?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number; // stored in cents (x100)
  markup?: number;
  allowance?: string; // "None" | "Prime Cost" | "Provisional Sum"
  wastagePercent?: number;
  type?: string; // "Material" | "Labour" | "Subcontractor" | "Equipment" | "Other"
  sortOrder: number;
  isGroup: boolean;
  parentGroupName?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const centsToDisplay = (cents?: number) => ((cents ?? 0) / 100).toFixed(2);
const displayToCents = (dollars: string | number) => Math.round(parseFloat(String(dollars) || "0") * 100);

const calcLineAmount = (item: TemplateItem): number => {
  const qty = item.quantity ?? 0;
  const uc = (item.unitPrice ?? 0) / 100; // convert cents → dollars
  const waste = item.wastagePercent ?? 0;
  const markup = item.markup ?? 0;
  const costWithWaste = uc * qty * (1 + waste / 100);
  return costWithWaste * (1 + markup / 100);
};

const fmt = (n: number) =>
  n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EstimateTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // A line Add Item just made, for the grid to open for typing.
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const clearEditLine = useCallback(() => setEditLineId(null), []);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<TemplateItem | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [addGroupDialogOpen, setAddGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  // Which group the new one goes inside; "none" = top level. A sentinel rather
  // than "" because Radix Select treats "" as no value.
  const [newGroupParent, setNewGroupParent] = useState("none");
  const [settingsName, setSettingsName] = useState("");
  const [settingsDesc, setSettingsDesc] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const costCodeMap = useMemo(() => {
    const m = new Map<string, CostCode>();
    costCodes.forEach((cc) => m.set(cc.id, cc));
    return m;
  }, [costCodes]);

  const { data: template, isLoading } = useQuery<EstimateTemplate>({
    queryKey: ["/api/estimate-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/estimate-templates/${params.templateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<EstimateTemplate>) =>
      apiRequest(`/api/estimate-templates/${params.templateId}`, "PATCH", data),
    onSuccess: () => {
      // Not while line edits are still going out: the refetch would bring back
      // the server's copy from before them.
      if (!saveLoop.current) {
        queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates", params.templateId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"] });
    },
    onError: () => toast({ title: "Failed to save changes", variant: "destructive" }),
  });

  // Derive items from template, assign fallback IDs
  const items: TemplateItem[] = useMemo(
    () =>
      ((template?.templateData as TemplateItem[]) || []).map((item, idx) => ({
        ...item,
        id: item.id || `fallback-${idx}-${item.sortOrder ?? idx}`,
        sortOrder: item.sortOrder ?? idx,
        allowance: item.allowance || "None",
        wastagePercent: item.wastagePercent ?? 0,
        type: item.type || "Material",
      })),
    [template?.templateData]
  );

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      const g = item.groupName || "ungrouped";
      if (!seen.has(g)) {
        seen.add(g);
        result.push(g);
      }
    }
    if (result.length === 0) result.push("ungrouped");
    return result;
  }, [items]);

  const totalAmount = items.filter((i) => !i.isGroup).reduce((acc, i) => acc + calcLineAmount(i), 0);
  // The group cards total BUILDER cost; the figure above is the CLIENT price.
  // Both are shown, both labelled — one bare number next to group badges that
  // measured something else just looked like an arithmetic bug.
  const builderTotal = items
    .filter((i) => !i.isGroup)
    .reduce((acc, i) => acc + ((i.unitPrice ?? 0) / 100) * (i.quantity ?? 0) * (1 + (i.wastagePercent ?? 0) / 100), 0);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Save the template's lines: shown at once, sent one at a time.
   *
   * A template saves by rewriting its whole `templateData` blob. This used to
   * PATCH and then wait for a refetch before the screen changed, so:
   *  - a click (the proposal eye, a quantity) did nothing visible for a second
   *    or more, then caught up later;
   *  - every edit in that window was built from the OLD blob, so the next save
   *    put back what the previous one changed. Toggling three eyes in a row,
   *    or taking several quantities from 1 to 0, lost all but the last, and
   *    the refetches landing in any order made rows flick on and off.
   *
   * Now the cache is updated first (so the next edit builds on this one), and
   * writes go out in order with only the latest pending blob kept: each blob
   * is the complete state, so skipping the stale ones between loses nothing.
   */
  const templateKey = ["/api/estimate-templates", params.templateId];
  const pendingBlob = useRef<TemplateItem[] | null>(null);
  const saveLoop = useRef<Promise<void> | null>(null);

  const saveItems = (newItems: TemplateItem[]): Promise<void> => {
    // A refetch in flight would land the server's older copy over this edit.
    queryClient.cancelQueries({ queryKey: templateKey, exact: true });
    queryClient.setQueryData<EstimateTemplate>(templateKey, (old) =>
      old ? { ...old, templateData: newItems as any } : old,
    );
    pendingBlob.current = newItems;
    if (!saveLoop.current) {
      saveLoop.current = (async () => {
        let failed = false;
        while (pendingBlob.current) {
          const blob = pendingBlob.current;
          pendingBlob.current = null;
          try {
            await apiRequest(`/api/estimate-templates/${params.templateId}`, "PATCH", { templateData: blob });
          } catch {
            failed = true;
            pendingBlob.current = null;
            toast({ title: "Failed to save changes", variant: "destructive" });
          }
        }
        saveLoop.current = null;
        // The list page shows line counts and totals.
        queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates"], exact: true });
        // Only resync this template from the server when a write failed, so the
        // screen stops showing an edit that was never stored.
        if (failed) queryClient.invalidateQueries({ queryKey: templateKey, exact: true });
      })();
    }
    return saveLoop.current;
  };

  const patchItem = (itemId: string, patch: Partial<TemplateItem>) => {
    const newItems = items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
    saveItems(newItems);
  };

  // Inline cell editing
  const handleDeleteItem = (item: TemplateItem) => setDeleteConfirmItem(item);
  const confirmDeleteItem = () => {
    if (!deleteConfirmItem) return;
    saveItems(items.filter((i) => i.id !== deleteConfirmItem.id));
    setDeleteConfirmItem(null);
  };

  /**
   * Add Item: a blank line with its name open for typing, so the price-list
   * search shows straight away — the same as Add Line in a group. This used to
   * set editing state on THIS page, which the grid never read, so the new line
   * just sat there blank.
   */
  const handleAddItem = (group: string) => {
    const newItem = newTemplateLine(items, group);
    saveItems([...items, newItem]);
    setEditLineId(newItem.id);
  };

  /**
   * Add Group, at the top level or inside another group.
   *
   * It used to add an empty, unnamed LINE so the group had something to show;
   * the group is a real row now and draws with nothing in it, so no stray
   * blank line is left behind to delete. A group is found by its name, so a
   * name already in the template is refused rather than silently reused.
   */
  const groupNames = useMemo(() => templateGroupOrder(items).filter((n) => n !== UNGROUPED), [items]);
  const groupParents = useMemo(() => templateGroupParents(items), [items]);
  /** "Kitchen > Joinery", for the parent picker. */
  const groupLabel = (name: string) => {
    const segments: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = name;
    while (cur && !seen.has(cur)) { seen.add(cur); segments.unshift(cur); cur = groupParents.get(cur) ?? null; }
    return formatGroupPath(segments);
  };

  const handleAddGroup = () => {
    const group = newGroupName.trim();
    if (!group) return;
    if (templateGroupOrder(items).includes(group) || group.toLowerCase() === UNGROUPED) {
      toast({
        title: "That name is taken",
        description: `This template already has a group called "${group}". Group names need to be different, including subgroups.`,
        variant: "destructive",
      });
      return;
    }
    if (group.includes(">")) {
      toast({
        title: "Use a name without \">\"",
        description: "\">\" separates a group from its subgroup in Excel (Kitchen > Joinery), so it can't be part of a name.",
        variant: "destructive",
      });
      return;
    }
    const parent = newGroupParent !== "none" ? newGroupParent : null;
    const { parentOf, orderOf } = currentTree(items);
    const rows = layoutTemplateGroups(items, parentOf, orderOf);
    const next = [
      ...rows,
      { id: crypto.randomUUID(), name: group, isGroup: true, isCollapsed: false, sortOrder: rows.length, ...(parent ? { parentGroupName: parent } : {}) } as TemplateItem,
    ];
    parentOf.set(group, parent);
    orderOf.set(group, Number.MAX_SAFE_INTEGER); // last in its parent (or at the bottom)
    saveItems(layoutTemplateGroups(next, parentOf, orderOf));
    setNewGroupName("");
    setNewGroupParent("none");
    setAddGroupDialogOpen(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, sortOrder: idx }));
    saveItems(reordered);
  };

  // ── Excel round trip ──────────────────────────────────────────────────────
  // Same column set as a job estimate export (ESTIMATE_EXPORT_HEADERS), so a
  // sheet exported here imports into an estimate and vice versa. Group header
  // rows are skipped: the Group column already carries the grouping.

  const buildExportRows = (): EstimateExportRow[] =>
    // In the order the template shows, with each line's group as a PATH —
    // "Kitchen > Joinery" — the same convention the estimate sheet uses (#317),
    // so subgroups survive the round trip instead of being flattened.
    linesForApply(items)
      .map(({ line: i, groupPath }) => {
        const code = i.costCodeId ? costCodeMap.get(i.costCodeId) : undefined;
        return {
          Group: groupPath,
          Item: i.name || "",
          Type: i.type || "",
          Description: i.description || "",
          Quantity: i.quantity ?? 0,
          Unit: i.unit || "",
          // Stored in cents, exported in dollars to match the estimate sheet.
          "Unit Cost": (i.unitPrice ?? 0) / 100,
          "Markup %": i.markup ?? 0,
          "Wastage %": i.wastagePercent ?? 0,
          "Cost Code": code ? `${code.code} - ${code.title}` : i.costCodeTitle || "",
          Allowance: i.allowance || "None",
          Notes: "",
          // Templates have no sub-ITEMS (lines under lines), so the column is
          // written blank rather than omitted, keeping the sheet
          // interchangeable with a job estimate's.
          "Sub-item": "",
        };
      });

  const handleExportXLSX = async () => {
    if (!template) return;
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "This template has no items yet." });
      return;
    }
    await exportEstimateRows(rows, { name: template.name, sheetName: "Template" });
    toast({
      title: "Exported to Excel",
      description: `${rows.length} lines. Re-imports cleanly via Import from Excel.`,
    });
  };

  const handleDownloadImportTemplate = async () => {
    await downloadBlankImportTemplate({
      sheetName: "Template Import",
      fileName: "Morada_Estimate_Template_Import.xlsx",
    });
    toast({
      title: "Template downloaded",
      description: "Fill it in, then bring it in via Import from Excel.",
    });
  };

  /**
   * Commit imported rows into templateData. Template items live in a jsonb
   * blob rather than the estimate_items table, so the shared dialog hands the
   * parsed rows back here instead of posting them.
   */
  const handleImportCommit = async (
    imported: ImportEstimateItem[],
    mode: ImportMergeMode,
  ): Promise<number> => {
    // The Group column is a PATH: "Kitchen > Joinery" puts the line in
    // Joinery, inside Kitchen, creating either if missing. A plain name is a
    // top-level group, as it always was.
    const placed = placeImportedGroups(mode === "replace" ? [] : items, imported.map((r) => r.group));
    const base = placed.items;

    const mapped: TemplateItem[] = imported.map((row, idx) => {
      // parseImportRow resolves a matched cost code to its id; an unmatched
      // one stays as the raw text, which we keep as the display title.
      const matched = row.costCode ? costCodeMap.get(row.costCode) : undefined;
      return {
        id: crypto.randomUUID(),
        groupName: placed.leafOf.get(row.group ?? ""),
        name: row.name,
        description: row.description || undefined,
        costCodeId: matched?.id,
        costCodeTitle: matched
          ? `${matched.code} - ${matched.title}`
          : row.costCode || undefined,
        unit: row.unitType || "ea",
        quantity: row.quantity ?? 1,
        unitPrice: Math.round((row.unitCostExTax ?? 0) * 100),
        markup: row.markupPercent ?? 0,
        allowance: row.allowance || "None",
        wastagePercent: row.wastagePercent ?? 0,
        type: row.type || "Material",
        sortOrder: base.length + idx,
        isGroup: false,
      };
    });

    await saveItems([...base, ...mapped]);

    return mapped.length;
  };

  const handleOpenSettings = () => {
    setSettingsName(template?.name || "");
    setSettingsDesc(template?.description || "");
    setSettingsDialogOpen(true);
  };

  const handleSaveSettings = () => {
    updateMutation.mutate({ name: settingsName.trim() || template?.name, description: settingsDesc.trim() || undefined });
    setSettingsDialogOpen(false);
    toast({ title: "Template settings saved" });
  };

  // ── Loading / Not found states ────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading template…</span>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <span className="text-sm text-muted-foreground">Template not found</span>
        <Button variant="outline" size="sm" onClick={() => navigate("/estimate-templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    );
  }

  const nonGroupItems = items.filter((i) => !i.isGroup);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* ── Row 1: Back + Title + Summary ── */}
      <div className="h-9 bg-background flex items-center px-2 gap-2 border-b border-border flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={() => navigate("/estimate-templates")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold truncate" data-testid="text-template-name">
          {template.name}
        </h2>
        {template.category && (
          <Badge variant="outline" className="text-xs flex-shrink-0">{template.category}</Badge>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {nonGroupItems.length} {nonGroupItems.length === 1 ? "item" : "items"}
        </span>
        <span className="text-xs font-medium flex-shrink-0 text-foreground tabular-nums">
          ${fmt(totalAmount)}
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0">client ex GST</span>
      </div>

      {/* ── Row 2: Toolbar ── */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 px-2 text-xs border rounded-md hover-elevate flex items-center gap-1"
            onClick={handleOpenSettings}
            data-testid="button-settings"
          >
            <Settings className="w-3 h-3" />
            Settings
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 px-2 text-xs border rounded-md hover-elevate flex items-center gap-1"
                data-testid="button-import-export"
              >
                <Upload className="w-3 h-3" />
                Import / Export
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={() => setImportDialogOpen(true)}
                data-testid="menu-import-excel"
              >
                <Upload className="w-3.5 h-3.5 mr-2" />
                Import from Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportXLSX} data-testid="menu-export-excel">
                <Download className="w-3.5 h-3.5 mr-2" />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDownloadImportTemplate}
                data-testid="menu-download-import-template"
              >
                <FileText className="w-3.5 h-3.5 mr-2" />
                Download import template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 px-2 text-xs border rounded-md hover-elevate flex items-center gap-1"
            onClick={() => setAddGroupDialogOpen(true)}
            data-testid="button-add-group"
          >
            <FolderPlus className="w-3 h-3" />
            Add Group
          </button>
          <button
            className="h-6 px-2 text-xs rounded-md bg-primary text-white border border-primary/20 active-elevate-2 flex items-center gap-1"
            onClick={() => handleAddItem(groups[groups.length - 1] || "ungrouped")}
            data-testid="button-add-item"
          >
            <Plus className="w-3 h-3" />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      {nonGroupItems.length === 0 && !items.some((i) => i.isGroup) ? (
        <div className="flex-1 text-center py-12">
          <Calculator className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-sm font-medium mb-1">No items yet</h3>
          <p className="text-xs text-muted-foreground mb-4">Add estimate items to build this template</p>
          <div className="flex items-center justify-center gap-2">
            <button
              className="h-7 px-3 text-xs border rounded-md hover-elevate flex items-center gap-1"
              onClick={() => setAddGroupDialogOpen(true)}
            >
              <FolderPlus className="w-3 h-3" />
              Add Group
            </button>
            <button
              className="h-7 px-3 text-xs rounded-md bg-primary text-white border border-primary/20 active-elevate-2 flex items-center gap-1"
              onClick={() => handleAddItem("ungrouped")}
              data-testid="button-add-first-item"
            >
              <Plus className="w-3 h-3" />
              Add Item
            </button>
            <button
              className="h-7 px-3 text-xs border rounded-md hover-elevate flex items-center gap-1"
              onClick={() => setImportDialogOpen(true)}
              data-testid="button-import-first-items"
            >
              <Upload className="w-3 h-3" />
              Import from Excel
            </button>
          </div>
        </div>
      ) : (
        <TemplateEstimateGrid
          items={items}
          onSave={saveItems}
          costCodes={costCodes}
          costCategories={[]}
          formatCurrency={(n) => `$${fmt(n)}`}
          onRequestDelete={(id: string) => {
            const row = items.find((i) => i.id === id);
            if (row) setDeleteConfirmItem(row);
          }}
          editLineId={editLineId}
          onEditLineOpened={clearEditLine}
        />
      )}

      {/* ── Footer total ── */}
      {nonGroupItems.length > 0 && (
        <div className="h-9 flex items-center justify-end gap-6 px-3 bg-muted/30 border-t border-border flex-shrink-0">
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Builder cost</span>
            <span className="text-xs font-medium tabular-nums" data-testid="text-template-builder-total">${fmt(builderTotal)}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Client ex GST</span>
            <span className="text-xs font-bold tabular-nums" data-testid="text-template-total">${fmt(totalAmount)}</span>
          </span>
        </div>
      )}

      {/* ── Import Dialog ── */}
      <ImportEstimateItemsDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImportComplete={() => setImportDialogOpen(false)}
        title="Import template items"
        groupNames={groups.filter((g) => g !== "ungrouped")}
        onCommit={handleImportCommit}
        offerMergeMode
        existingCount={nonGroupItems.length}
      />

      {/* ── Settings Dialog ── */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>Update template name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={settingsName}
                onChange={(e) => setSettingsName(e.target.value)}
                data-testid="input-settings-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={settingsDesc}
                onChange={(e) => setSettingsDesc(e.target.value)}
                placeholder="Describe this template…"
                rows={3}
                data-testid="input-settings-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings} className="bg-primary text-white border-primary/20">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Group Dialog ── */}
      <Dialog open={addGroupDialogOpen} onOpenChange={setAddGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Group</DialogTitle>
            <DialogDescription>Create a new group to organise your template items.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Group Name</Label>
            <Input
              className="mt-2"
              placeholder="e.g. Foundations"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(); }}
              autoFocus
              data-testid="input-new-template-group-name"
            />
            {groupNames.length > 0 && (
              <>
                <Label className="mt-4 block">Put it inside</Label>
                <Select value={newGroupParent} onValueChange={setNewGroupParent}>
                  <SelectTrigger className="mt-2" data-testid="select-new-template-group-parent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nothing — a top-level group</SelectItem>
                    {groupNames.map((n) => (
                      <SelectItem key={n} value={n}>{groupLabel(n)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  You can also drag a group onto another group's name to put it inside, or to an edge to take it back out.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddGroup} className="bg-primary text-white border-primary/20">
              Add Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteConfirmItem} onOpenChange={(open) => !open && setDeleteConfirmItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmItem?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
