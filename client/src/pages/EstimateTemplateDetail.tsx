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
} from "lucide-react";
import type { EstimateTemplate } from "@shared/schema";
import { TemplateEstimateGrid } from "@/components/estimates/TemplateEstimateGrid";
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

// ─── Empty-item factory ───────────────────────────────────────────────────────

const makeEmpty = (groupName: string, sortOrder: number): TemplateItem => ({
  id: crypto.randomUUID(),
  groupName,
  name: "",
  description: "",
  costCodeId: undefined,
  costCodeTitle: undefined,
  unit: "ea",
  quantity: 1,
  unitPrice: 0,
  markup: 0,
  allowance: "None",
  wastagePercent: 0,
  type: "Material",
  sortOrder,
  isGroup: false,
});

// ─── Inline cell editor ───────────────────────────────────────────────────────

interface CellEditingState {
  itemId: string;
  field: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EstimateTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Editing state
  const [editingCell, setEditingCell] = useState<CellEditingState | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["ungrouped"]));
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<TemplateItem | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [addGroupDialogOpen, setAddGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsDesc, setSettingsDesc] = useState("");

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
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-templates", params.templateId] });
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

  const saveItems = (newItems: TemplateItem[]) => {
    updateMutation.mutate({ templateData: newItems });
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

  const handleAddItem = (group: string) => {
    const newItem = makeEmpty(group === "ungrouped" ? "" : group, items.length);
    saveItems([...items, newItem]);
    // Auto-open name editing for the new item
    setTimeout(() => {
      setEditingCell({ itemId: newItem.id, field: "name" });
      setEditingValue("");
      setExpandedGroups((prev) => new Set([...prev, group]));
    }, 200);
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    const group = newGroupName.trim();
    setExpandedGroups((prev) => new Set([...prev, group]));
    // Add a placeholder item to keep the group visible
    const placeholder = makeEmpty(group, items.length);
    saveItems([...items, placeholder]);
    setNewGroupName("");
    setAddGroupDialogOpen(false);
    setTimeout(() => {
      setEditingCell({ itemId: placeholder.id, field: "name" });
      setEditingValue("");
    }, 200);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, sortOrder: idx }));
    saveItems(reordered);
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
      {nonGroupItems.length === 0 && groups.length <= 1 ? (
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
            />
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
