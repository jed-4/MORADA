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

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: "ea", label: "ea" },
  { value: "m2", label: "m²" },
  { value: "m3", label: "m³" },
  { value: "lm", label: "lm" },
  { value: "hr", label: "hr" },
  { value: "day", label: "day" },
  { value: "t", label: "t" },
  { value: "kg", label: "kg" },
  { value: "l", label: "l" },
  { value: "item", label: "item" },
  { value: "wk", label: "wk" },
  { value: "lot", label: "lot" },
  { value: "set", label: "set" },
];

const TYPE_OPTIONS = [
  "Material",
  "Labour",
  "Subcontractor",
  "Equipment",
  "Other",
];

const ALLOWANCE_OPTIONS = ["None", "Prime Cost", "Provisional Sum"];

const WASTAGE_OPTIONS = [0, 5, 10, 15, 20, 25];

// ─── Column widths (CSS Grid template) ───────────────────────────────────────

const COL_DRAG = "24px";
const COL_NAME = "minmax(140px, 1fr)";
const COL_DESC = "minmax(100px, 1.2fr)";
const COL_COSTCODE = "80px";
const COL_TYPE = "90px";
const COL_ALLOWANCE = "100px";
const COL_QTY = "60px";
const COL_WASTE = "56px";
const COL_UNIT = "54px";
const COL_UCOST = "88px";
const COL_MARKUP = "64px";
const COL_AMOUNT = "90px";
const COL_ACTIONS = "28px";

const GRID_TEMPLATE = [
  COL_DRAG, COL_NAME, COL_DESC, COL_COSTCODE, COL_TYPE,
  COL_ALLOWANCE, COL_QTY, COL_WASTE, COL_UNIT, COL_UCOST, COL_MARKUP, COL_AMOUNT, COL_ACTIONS,
].join(" ");

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

const allowanceChipClass = (a?: string) =>
  a === "Prime Cost"
    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800"
    : a === "Provisional Sum"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800"
    : "text-muted-foreground";

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

// ─── Sortable row ─────────────────────────────────────────────────────────────

interface SortableRowProps {
  item: TemplateItem;
  costCodes: CostCode[];
  editingCell: CellEditingState | null;
  editingValue: string;
  onCellClick: (item: TemplateItem, field: string) => void;
  onCellChange: (v: string) => void;
  onCellBlur: () => void;
  onCellKeyDown: (e: React.KeyboardEvent) => void;
  onDelete: (item: TemplateItem) => void;
  onDuplicate: (item: TemplateItem) => void;
  onAllowanceChange: (item: TemplateItem, val: string) => void;
  onTypeChange: (item: TemplateItem, val: string) => void;
  onUnitChange: (item: TemplateItem, val: string) => void;
  onWastageChange: (item: TemplateItem, val: number) => void;
  onCostCodeChange: (item: TemplateItem, costCodeId: string, costCodes: CostCode[]) => void;
}

function SortableRow({
  item,
  costCodes,
  editingCell,
  editingValue,
  onCellClick,
  onCellChange,
  onCellBlur,
  onCellKeyDown,
  onDelete,
  onDuplicate,
  onAllowanceChange,
  onTypeChange,
  onUnitChange,
  onWastageChange,
  onCostCodeChange,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    gridTemplateColumns: GRID_TEMPLATE,
  };

  const isEditingField = (field: string) => editingCell?.itemId === item.id && editingCell?.field === field;
  const isRowActive = editingCell?.itemId === item.id;

  const amount = calcLineAmount(item);

  const editableCell = (field: string, value: string, align: "left" | "right" = "left", placeholder = "") => {
    if (isEditingField(field)) {
      return (
        <div className="w-full h-full ring-1 ring-inset ring-primary/60 rounded-[2px] flex items-center">
          <input
            autoFocus
            className="w-full h-full bg-transparent border-0 outline-none px-1 text-xs"
            style={{ textAlign: align }}
            value={editingValue}
            onChange={(e) => onCellChange(e.target.value)}
            onBlur={onCellBlur}
            onKeyDown={onCellKeyDown}
          />
        </div>
      );
    }
    return (
      <div
        className="w-full h-full flex items-center px-1 cursor-pointer border-b border-transparent hover:border-primary/30 transition-colors"
        style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}
        onClick={() => onCellClick(item, field)}
        title="Click to edit"
      >
        {value ? (
          <span className="text-xs truncate" style={{ textAlign: align }}>{value}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40 truncate">{placeholder}</span>
        )}
      </div>
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid items-center min-h-[32px] border-b border-border/50 hover:bg-muted/20 group ${isRowActive ? 'bg-primary/[0.04]' : ''}`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-60 hover:opacity-100 h-full"
      >
        <GripVertical className="w-3 h-3 text-muted-foreground" />
      </div>

      {/* Name */}
      <div className="h-8 flex items-center pr-1">
        {editableCell("name", item.name, "left", "Item name…")}
      </div>

      {/* Description */}
      <div className="h-8 flex items-center pr-1">
        {editableCell("description", item.description || "", "left", "Description…")}
      </div>

      {/* Cost Code */}
      <div className="h-8 flex items-center pr-1">
        {isEditingField("costCode") ? (
          <div className="w-full h-full ring-1 ring-inset ring-primary/60 rounded-[2px] flex items-center">
            <CostCodeSelect
              value={item.costCodeId || ""}
              onValueChange={(v) => {
                onCostCodeChange(item, v, costCodes);
              }}
              placeholder="Select…"
              triggerClassName="h-full border-0 shadow-none focus-visible:ring-0 bg-transparent text-xs"
            />
          </div>
        ) : (
          <div
            className="w-full flex items-center cursor-pointer h-full px-1 border-b border-transparent hover:border-primary/30 transition-colors"
            onClick={() => onCellClick(item, "costCode")}
          >
            {item.costCodeTitle ? (
              <Badge variant="outline" className="h-4 px-1 text-[9px] max-w-full truncate">
                {item.costCodeTitle}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground/40">—</span>
            )}
          </div>
        )}
      </div>

      {/* Type */}
      <div className="h-8 flex items-center pr-1">
        <Select value={item.type || "Material"} onValueChange={(v) => onTypeChange(item, v)}>
          <SelectTrigger className="h-6 text-xs border-0 shadow-none px-1 focus:ring-0 bg-transparent hover:bg-muted/40 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Allowance */}
      <div className="h-8 flex items-center pr-1">
        <Select value={item.allowance || "None"} onValueChange={(v) => onAllowanceChange(item, v)}>
          <SelectTrigger className="h-6 text-xs border-0 shadow-none px-1 focus:ring-0 bg-transparent hover:bg-muted/40 w-full">
            <SelectValue>
              {item.allowance && item.allowance !== "None" ? (
                <span className={`text-[9px] px-1 py-0.5 rounded border ${allowanceChipClass(item.allowance)}`}>
                  {item.allowance === "Prime Cost" ? "PC" : "PS"}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ALLOWANCE_OPTIONS.map((a) => (
              <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quantity */}
      <div className="h-8 flex items-center pr-1">
        {editableCell("quantity", item.quantity != null ? String(item.quantity) : "", "right", "0")}
      </div>

      {/* Wastage % */}
      <div className="h-8 flex items-center pr-1">
        <Select
          value={String(item.wastagePercent ?? 0)}
          onValueChange={(v) => onWastageChange(item, parseInt(v))}
        >
          <SelectTrigger className="h-6 text-xs border-0 shadow-none px-1 focus:ring-0 bg-transparent hover:bg-muted/40 w-full">
            <SelectValue>{(item.wastagePercent ?? 0) > 0 ? `+${item.wastagePercent}%` : "—"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {WASTAGE_OPTIONS.map((w) => (
              <SelectItem key={w} value={String(w)} className="text-xs">
                {w === 0 ? "None" : `+${w}%`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Unit */}
      <div className="h-8 flex items-center pr-1">
        <Select value={item.unit || "ea"} onValueChange={(v) => onUnitChange(item, v)}>
          <SelectTrigger className="h-6 text-xs border-0 shadow-none px-1 focus:ring-0 bg-transparent hover:bg-muted/40 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIT_OPTIONS.map((u) => (
              <SelectItem key={u.value} value={u.value} className="text-xs">{u.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Unit Cost */}
      <div className="h-8 flex items-center pr-1">
        {editableCell("unitPrice", centsToDisplay(item.unitPrice), "right", "0.00")}
      </div>

      {/* Markup % */}
      <div className="h-8 flex items-center pr-1">
        {editableCell("markup", item.markup != null ? String(item.markup) : "", "right", "0")}
      </div>

      {/* Amount */}
      <div className="h-8 flex items-center justify-end pr-1">
        <span className="text-xs font-medium text-foreground">${fmt(amount)}</span>
      </div>

      {/* Actions */}
      <div className="h-8 flex items-center justify-center opacity-0 group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <MoreVertical className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDuplicate(item)} className="text-xs">
              <Copy className="w-3 h-3 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(item)}
              className="text-xs text-destructive focus:text-destructive"
            >
              <Trash2 className="w-3 h-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
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

  const groupItems = useCallback(
    (group: string) =>
      items
        .filter((i) => (i.groupName || "ungrouped") === group && !i.isGroup)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );

  const totalAmount = items.filter((i) => !i.isGroup).reduce((acc, i) => acc + calcLineAmount(i), 0);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const saveItems = (newItems: TemplateItem[]) => {
    updateMutation.mutate({ templateData: newItems });
  };

  const patchItem = (itemId: string, patch: Partial<TemplateItem>) => {
    const newItems = items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
    saveItems(newItems);
  };

  // Inline cell editing
  const handleCellClick = (item: TemplateItem, field: string) => {
    if (field === "costCode") {
      setEditingCell({ itemId: item.id, field });
      return;
    }
    let value = "";
    if (field === "name") value = item.name;
    else if (field === "description") value = item.description || "";
    else if (field === "quantity") value = item.quantity != null ? String(item.quantity) : "";
    else if (field === "unitPrice") value = centsToDisplay(item.unitPrice);
    else if (field === "markup") value = item.markup != null ? String(item.markup) : "";
    setEditingCell({ itemId: item.id, field });
    setEditingValue(value);
  };

  const handleCellBlur = () => {
    if (!editingCell) return;
    const { itemId, field } = editingCell;
    let patch: Partial<TemplateItem> = {};
    if (field === "name") patch = { name: editingValue.trim() };
    else if (field === "description") patch = { description: editingValue.trim() };
    else if (field === "quantity") patch = { quantity: parseFloat(editingValue) || 0 };
    else if (field === "unitPrice") patch = { unitPrice: displayToCents(editingValue) };
    else if (field === "markup") patch = { markup: parseFloat(editingValue) || 0 };
    if (Object.keys(patch).length > 0) patchItem(itemId, patch);
    setEditingCell(null);
    setEditingValue("");
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { handleCellBlur(); }
    else if (e.key === "Escape") { setEditingCell(null); setEditingValue(""); }
  };

  const handleCostCodeChange = (item: TemplateItem, costCodeId: string, codes: CostCode[]) => {
    const cc = codes.find((c) => c.id === costCodeId);
    patchItem(item.id, {
      costCodeId: costCodeId || undefined,
      costCodeTitle: cc ? `${cc.code} - ${cc.title}` : undefined,
    });
    setEditingCell(null);
  };

  const handleAllowanceChange = (item: TemplateItem, val: string) => patchItem(item.id, { allowance: val });
  const handleTypeChange = (item: TemplateItem, val: string) => patchItem(item.id, { type: val });
  const handleUnitChange = (item: TemplateItem, val: string) => patchItem(item.id, { unit: val });
  const handleWastageChange = (item: TemplateItem, val: number) => patchItem(item.id, { wastagePercent: val });

  const handleDeleteItem = (item: TemplateItem) => setDeleteConfirmItem(item);
  const confirmDeleteItem = () => {
    if (!deleteConfirmItem) return;
    saveItems(items.filter((i) => i.id !== deleteConfirmItem.id));
    setDeleteConfirmItem(null);
  };

  const handleDuplicateItem = (item: TemplateItem) => {
    const dup: TemplateItem = { ...item, id: crypto.randomUUID(), sortOrder: items.length };
    saveItems([...items, dup]);
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

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
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
        <span className="text-xs font-medium flex-shrink-0 text-foreground">
          ${fmt(totalAmount)}
        </span>
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
            className="h-6 px-2 text-xs rounded-md bg-[#bba7db] text-white border border-[#bba7db]/20 active-elevate-2 flex items-center gap-1"
            onClick={() => handleAddItem(groups[groups.length - 1] || "ungrouped")}
            data-testid="button-add-item"
          >
            <Plus className="w-3 h-3" />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Column Headers ── */}
      <div
        className="grid items-center h-7 bg-muted/50 border-b border-border flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground select-none"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <div /> {/* drag */}
        <div className="pl-1">Item Name</div>
        <div className="pl-1">Description</div>
        <div className="pl-1">Code</div>
        <div className="pl-1">Type</div>
        <div className="pl-1">Allowance</div>
        <div className="text-right pr-1">Qty</div>
        <div className="text-right pr-1">Waste</div>
        <div className="pl-1">Unit</div>
        <div className="text-right pr-1">Unit Cost</div>
        <div className="text-right pr-1">Markup%</div>
        <div className="text-right pr-1">Amount</div>
        <div />
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {nonGroupItems.length === 0 && groups.length <= 1 ? (
          <div className="text-center py-12">
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
                className="h-7 px-3 text-xs rounded-md bg-[#bba7db] text-white border border-[#bba7db]/20 active-elevate-2 flex items-center gap-1"
                onClick={() => handleAddItem("ungrouped")}
                data-testid="button-add-first-item"
              >
                <Plus className="w-3 h-3" />
                Add Item
              </button>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {groups.map((group) => {
              const gItems = groupItems(group);
              const isExpanded = expandedGroups.has(group);
              const groupTotal = gItems.reduce((acc, i) => acc + calcLineAmount(i), 0);
              const label = group === "ungrouped" ? "General" : group;

              return (
                <div key={group}>
                  {/* Group header row */}
                  <div
                    className="grid items-center h-8 bg-muted/40 border-b border-border cursor-pointer select-none sticky top-0 z-10"
                    style={{ gridTemplateColumns: GRID_TEMPLATE }}
                    onClick={() => toggleGroup(group)}
                  >
                    <div className="flex items-center justify-center">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="col-span-10 pl-1 flex items-center gap-2">
                      <span className="text-xs font-semibold">{label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {gItems.length} {gItems.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-right pr-1">${fmt(groupTotal)}</div>
                    <div />
                  </div>

                  {/* Items */}
                  {isExpanded && (
                    <>
                      <SortableContext items={gItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        {gItems.map((item) => (
                          <SortableRow
                            key={item.id}
                            item={item}
                            costCodes={costCodes}
                            editingCell={editingCell}
                            editingValue={editingValue}
                            onCellClick={handleCellClick}
                            onCellChange={setEditingValue}
                            onCellBlur={handleCellBlur}
                            onCellKeyDown={handleCellKeyDown}
                            onDelete={handleDeleteItem}
                            onDuplicate={handleDuplicateItem}
                            onAllowanceChange={handleAllowanceChange}
                            onTypeChange={handleTypeChange}
                            onUnitChange={handleUnitChange}
                            onWastageChange={handleWastageChange}
                            onCostCodeChange={handleCostCodeChange}
                          />
                        ))}
                      </SortableContext>

                      {/* Add item row */}
                      <div
                        className="grid items-center h-7 border-b border-border/40 cursor-pointer hover:bg-muted/20 group"
                        style={{ gridTemplateColumns: GRID_TEMPLATE }}
                        onClick={() => handleAddItem(group)}
                        data-testid={`button-add-item-group-${group}`}
                      >
                        <div />
                        <div className="col-span-12 pl-1 flex items-center gap-1 opacity-0 group-hover:opacity-60 transition-opacity">
                          <Plus className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Add item</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </DndContext>
        )}
      </div>

      {/* ── Footer totals ── */}
      {nonGroupItems.length > 0 && (
        <div
          className="grid items-center h-9 bg-muted/30 border-t border-border flex-shrink-0"
          style={{ gridTemplateColumns: GRID_TEMPLATE }}
        >
          <div />
          <div className="col-span-10 pl-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Total
          </div>
          <div className="text-xs font-bold text-right pr-1">${fmt(totalAmount)}</div>
          <div />
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
            <Button onClick={handleSaveSettings} className="bg-[#bba7db] text-white border-[#bba7db]/20">
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
            <Button onClick={handleAddGroup} className="bg-[#bba7db] text-white border-[#bba7db]/20">
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
