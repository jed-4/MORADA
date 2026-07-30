import React, { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProject } from "@/contexts/ProjectContext";
import { useClientPortal } from "@/hooks/use-client-portal";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type Selection,
  type InsertSelection,
  type FieldCategoryWithOptions,
  type SelectionWithOptions,
  type SelectionOption,
  type OptionAttachment,
  type Contact,
  type SelectionTemplate,
} from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  CalendarIcon,
  Eye,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Image as ImageIcon,
  Check,
  MessageSquare,
  Paperclip,
  X,
  ShoppingCart,
  ExternalLink,
  Loader2,
  HardHat,
  FileText,
  Copy,
  GripVertical,
  LayoutTemplate,
  Layers,
  ChevronLeft,
  BookCopy,
  CheckSquare,
  Filter,
  LayoutGrid,
  LayoutList,
  Send,
  Link as LinkIcon,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import {
  type DerivedStatus,
  getDerivedStatus,
  getSelectedOption,
  getActualCents,
  formatMoneyCents,
  formatVarianceCents,
  ProgressStrip,
} from "@/components/selections/selectionHelpers";
import {
  SortableSelectionRow,
  type SelectionColumnVisibility,
} from "@/components/selections/SelectionRow";
import { SelectionCard } from "@/components/selections/SelectionCard";
import { SelectionDrawer } from "@/components/selections/SelectionDrawer";

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

interface StatCardProps {
  value: number | string;
  label: string;
  variant: "default" | "primary" | "amber" | "sage" | "coral";
  active?: boolean;
  onClick?: () => void;
  testId?: string;
}

function StatCard({ value, label, variant, active = false, onClick, testId }: StatCardProps) {
  const variantClasses: Record<typeof variant, string> = {
    default: "bg-card border-border text-foreground",
    primary: "bg-primary/10 border-primary/30 text-primary",
    amber: "bg-[hsl(var(--amber-bg))] border-[hsl(var(--amber))]/30 text-[hsl(var(--amber))]",
    sage: "bg-[hsl(var(--sage-bg))] border-[hsl(var(--sage))]/30 text-[hsl(var(--sage))]",
    coral: "bg-[hsl(var(--coral-bg))] border-[hsl(var(--coral))]/30 text-[hsl(var(--coral))]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`rounded-lg border px-3 py-2 w-[120px] text-left transition-shadow ${variantClasses[variant]} hover-elevate active-elevate-2 ${
        active ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="text-[17px] font-bold leading-tight tabular-nums">{value}</div>
      <div className="text-[9px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </button>
  );
}


// ───────────────────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────────────────

export default function Selections() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusTab, setStatusTab] = useState<"all" | DerivedStatus>("all");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [createPOSupplierId, setCreatePOSupplierId] = useState<string>("");
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [showTemplatePanel, setShowTemplatePanel] = useState<boolean>(() => {
    return localStorage.getItem("selections-template-panel") === "true";
  });
  const [groupBy, setGroupBy] = useState<"none" | "category" | "location">(() => {
    return (localStorage.getItem("selections-group-by") as "none" | "category" | "location") || "none";
  });
  // List/Cards toggle — persisted like the detail page's grid/table toggle
  const [viewMode, setViewMode] = useState<"list" | "cards">(() => {
    return (localStorage.getItem("selections-view-mode") as "list" | "cards") || "list";
  });
  useEffect(() => {
    localStorage.setItem("selections-view-mode", viewMode);
  }, [viewMode]);
  // Quick-view drawer (replaces the old inline expand panel)
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // Column sorting: click a header to cycle asc → desc → off (manual order)
  type SortKey = "name" | "category" | "location" | "status" | "budget" | "due";
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const cycleSort = (key: SortKey) => {
    if (sortBy !== key) { setSortBy(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else setSortBy(null);
  };

  // Optional columns so wide monitors aren't bare (persisted)
  const [visibleColumns, setVisibleColumns] = useState<SelectionColumnVisibility>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("selections-columns") || "null");
      if (stored && typeof stored.category === "boolean") return stored;
    } catch { /* corrupted — fall through */ }
    return { category: true, location: true, options: false };
  });
  useEffect(() => {
    localStorage.setItem("selections-columns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Saved column widths per the app table standard (resizable via the header
  // dividers; name is the filler column)
  type WidthKey = "category" | "location" | "status" | "budget" | "deadline";
  const [columnWidths, setColumnWidths] = useState<Record<WidthKey, number>>(() => {
    const defaults: Record<WidthKey, number> = { category: 110, location: 120, status: 120, budget: 200, deadline: 90 };
    try {
      const stored = JSON.parse(localStorage.getItem("selections-column-widths") || "null");
      if (stored && typeof stored.status === "number") return { ...defaults, ...stored };
    } catch { /* corrupted — fall through */ }
    return defaults;
  });
  useEffect(() => {
    localStorage.setItem("selections-column-widths", JSON.stringify(columnWidths));
  }, [columnWidths]);
  const gridTemplate = [
    "16px",
    "64px",
    "minmax(200px,1fr)",
    visibleColumns.category ? `${columnWidths.category}px` : null,
    visibleColumns.location ? `${columnWidths.location}px` : null,
    `${columnWidths.status}px`,
    visibleColumns.options ? "60px" : null,
    `${columnWidths.budget}px`,
    `${columnWidths.deadline}px`,
    "64px",
  ].filter(Boolean).join(" ");

  // Column resize. Listeners live on window, NOT the handle element — the
  // handle unmounts on the first width re-render, which killed the drag after
  // one tick and left the col-resize cursor stuck on the whole page.
  const resizeRef = useRef<{ key: WidthKey; startX: number; startW: number } | null>(null);
  const startColumnResize = (key: WidthKey, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { key, startX: e.clientX, startW: columnWidths[key] };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.max(60, Math.min(400, r.startW + (ev.clientX - r.startX)));
      setColumnWidths((prev) => ({ ...prev, [r.key]: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [templateSearch, setTemplateSearch] = useState("");
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateCategory, setSaveTemplateCategory] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject } = useProject();
  const { isClient } = useClientPortal();

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [showSummaryCards, setShowSummaryCards] = useState<boolean>(() => {
    const stored = localStorage.getItem("selections-cards-visible");
    return stored === null ? true : stored === "true";
  });
  useEffect(() => {
    localStorage.setItem("selections-cards-visible", String(showSummaryCards));
  }, [showSummaryCards]);

  useEffect(() => {
    localStorage.setItem("selections-template-panel", String(showTemplatePanel));
  }, [showTemplatePanel]);

  useEffect(() => {
    localStorage.setItem("selections-group-by", groupBy);
  }, [groupBy]);

  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (searchExpanded) {
      searchInputRef.current?.focus();
    }
  }, [searchExpanded]);
  useEffect(() => {
    if (!searchExpanded) return;
    const onClick = (e: MouseEvent) => {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(e.target as Node) &&
        !searchTerm
      ) {
        setSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [searchExpanded, searchTerm]);

  const projectId = currentProject?.id;

  // Fetch selections WITH options & attachments in a single call
  const { data: selectionsWithOptions = [], isLoading } = useQuery<SelectionWithOptions[]>({
    queryKey: ["/api/selections/with-options", projectId],
    queryFn: () => apiRequest(`/api/selections/with-options?projectId=${projectId}`, "GET"),
    enabled: !!projectId,
  });

  // Sync orderedIds from server data (preserve local order if already set for same IDs)
  useEffect(() => {
    const incoming = selectionsWithOptions.map((s) => s.id);
    setOrderedIds((prev) => {
      // Both empty — data not yet loaded. Return prev (same ref) so we don't trigger a re-render.
      if (incoming.length === 0 && prev.length === 0) return prev;
      if (prev.length === 0) return incoming;
      const prevSet = new Set(prev);
      const incomingSet = new Set(incoming);
      const same = incoming.every((id) => prevSet.has(id)) && prev.every((id) => incomingSet.has(id));
      if (same) return prev; // preserve local drag order
      // IDs changed (add/delete) — rebuild: keep existing order, add new at end, remove gone
      const kept = prev.filter((id) => incomingSet.has(id));
      const added = incoming.filter((id) => !prevSet.has(id));
      return [...kept, ...added];
    });
  }, [selectionsWithOptions]);

  const batchSortMutation = useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) =>
      apiRequest("/api/selections/batch-sort", "POST", { updates }),
    onError: () => {
      toast({ title: "Failed to save order", variant: "destructive" });
      // Revert to server order
      setOrderedIds(selectionsWithOptions.map((s) => s.id));
    },
  });

  const isDraggable = !searchTerm && !categoryFilter && statusTab === "all" && !sortBy;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedIds((prev) => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      const next = arrayMove(prev, oldIndex, newIndex);
      batchSortMutation.mutate(next.map((id, idx) => ({ id, sortOrder: idx })));
      return next;
    });
  };

  // Fetch selection categories for filter
  const { data: selectionCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
  });

  // Fetch selection templates for the template panel
  const { data: selectionTemplates = [] } = useQuery<SelectionTemplate[]>({
    queryKey: ["/api/selection-templates"],
    queryFn: () => apiRequest("/api/selection-templates", "GET"),
  });

  // Fetch contacts for supplier picker in Create PO modal
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: () => apiRequest(`/api/contacts?projectId=${projectId}`, "GET"),
    enabled: !!projectId,
  });
  const supplierContacts = useMemo(
    () => contacts.filter((c) => c.contactType === "supplier" || c.contactType === "subcontractor"),
    [contacts],
  );

  // Mutations
  const createSelectionMutation = useMutation({
    mutationFn: async (selection: InsertSelection) => {
      return await apiRequest("/api/selections", "POST", selection);
    },
    onSuccess: (newSelection: Selection) => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: "Selection created" });
      setLocation(`/selections/${newSelection.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create selection.", variant: "destructive" });
    },
  });

  const deleteSelectionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/selections/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: "Selection deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete selection.", variant: "destructive" });
    },
  });

  const duplicateSelectionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/selections/${id}/duplicate`, "POST");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: "Selection duplicated", description: `"${data.selection.name}" has been created.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to duplicate selection.", variant: "destructive" });
    },
  });

  const selectOptionMutation = useMutation({
    mutationFn: async ({ selectionId, optionId }: { selectionId: string; optionId: string }) => {
      const sel = selectionsWithOptions.find((s) => s.id === selectionId);
      if (!sel) throw new Error("Selection not found");

      // Clear any previously selected option(s)
      const previouslySelected = sel.options.filter((o) => o.isSelectedByClient && o.id !== optionId);
      await Promise.all(
        previouslySelected.map((o) =>
          apiRequest(`/api/selection-options/${o.id}`, "PATCH", { isSelectedByClient: false }),
        ),
      );

      // Set the chosen one
      await apiRequest(`/api/selection-options/${optionId}`, "PATCH", { isSelectedByClient: true });

      // Bump status from draft → pending so it shows as Submitted
      if (sel.status === "draft") {
        await apiRequest(`/api/selections/${selectionId}`, "PATCH", { status: "pending" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update selection.", variant: "destructive" });
    },
  });

  // Computed stats (across the unfiltered set so they're stable)
  const stats = useMemo(() => {
    let open = 0, submitted = 0, approved = 0, overdue = 0, ordered = 0;
    let totalAllowance = 0, totalActual = 0, pendingAmount = 0;
    let openCount = 0;
    selectionsWithOptions.forEach((sel) => {
      const d = getDerivedStatus(sel);
      if (d === "open") { open++; openCount++; }
      if (d === "submitted") submitted++;
      if (d === "approved") approved++;
      if (d === "overdue") overdue++;
      if (d === "ordered" || d === "received") ordered++;
      if (sel.allowance) totalAllowance += sel.allowance;
      const a = getActualCents(sel);
      if (a !== null) totalActual += a;
      if (d === "open" && sel.allowance) pendingAmount += sel.allowance;
    });
    return {
      total: selectionsWithOptions.length,
      open,
      submitted,
      approved,
      overdue,
      ordered,
      totalAllowance,
      totalActual,
      variance: totalActual - totalAllowance,
      pendingAmount,
      openCount,
    };
  }, [selectionsWithOptions]);

  // Filtered list — ordered by orderedIds (drag order), then filtered
  const filtered = useMemo(() => {
    const idToSel = new Map(selectionsWithOptions.map((s) => [s.id, s]));
    const ordered = orderedIds.length > 0
      ? orderedIds.map((id) => idToSel.get(id)).filter(Boolean) as typeof selectionsWithOptions
      : selectionsWithOptions;
    return ordered.filter((sel) => {
      const d = getDerivedStatus(sel);
      // "ordered" tab shows both ordered + received
      if (statusTab === "ordered") {
        if (d !== "ordered" && d !== "received") return false;
      } else if (statusTab !== "all" && statusTab !== d) {
        return false;
      }
      if (categoryFilter && sel.category !== categoryFilter) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (
          !sel.name.toLowerCase().includes(t) &&
          !(sel.category?.toLowerCase().includes(t)) &&
          !(sel.room?.toLowerCase().includes(t))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [selectionsWithOptions, orderedIds, statusTab, categoryFilter, searchTerm]);

  // Header sort — applied on top of the manual drag order when active
  const STATUS_SORT_ORDER: Record<DerivedStatus, number> = {
    overdue: 0, open: 1, submitted: 2, approved: 3, ordered: 4, received: 5,
  };
  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (sel: (typeof filtered)[number]): string | number => {
      switch (sortBy) {
        case "name": return sel.name.toLowerCase();
        case "category": return (sel.category ?? "").toLowerCase();
        case "location": return (sel.room ?? "").toLowerCase();
        case "status": return STATUS_SORT_ORDER[getDerivedStatus(sel)];
        case "budget": return getActualCents(sel) ?? sel.allowance ?? -1;
        case "due": {
          // Decided items sort last; missing deadlines just before them
          const d = getDerivedStatus(sel);
          if (d === "approved" || d === "ordered" || d === "received") return Number.MAX_SAFE_INTEGER;
          return sel.deadline ? new Date(sel.deadline).getTime() : Number.MAX_SAFE_INTEGER - 1;
        }
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortBy, sortDir]);

  // Approved spend
  const approvedSpend = useMemo(() => {
    return selectionsWithOptions.reduce((sum, sel) => {
      const d = getDerivedStatus(sel);
      if (d === "approved") {
        const a = getActualCents(sel);
        if (a !== null) return sum + a;
      }
      return sum;
    }, 0);
  }, [selectionsWithOptions]);

  // Handlers
  const handleAddSelection = () => {
    if (!projectId) return;
    createSelectionMutation.mutate({
      projectId,
      name: "New Selection",
      description: "",
      category: "",
      room: "",
      selectionType: "selection",
      status: "draft",
      clientCanChange: true,
      clientCanSeePrice: false,
    });
  };

  const handleEdit = (id: string) => setLocation(`/selections/${id}`);
  const handleDelete = (id: string) => deleteSelectionMutation.mutate(id);
  const handleDuplicate = (id: string) => duplicateSelectionMutation.mutate(id);

  const handleCheck = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  // Create PO mutation
  const createPOMutation = useMutation({
    mutationFn: async ({ selectionIds, supplierId }: { selectionIds: string[]; supplierId: string }) => {
      return await apiRequest("/api/selections/create-po", "POST", {
        projectId,
        selectionIds,
        supplierId: supplierId || null,
      });
    },
    onSuccess: (result: any) => {
      toast({ title: `PO ${result.poNumber} created`, description: `${result.count} item(s) added to purchase order.` });
      setCheckedIds(new Set());
      setShowCreatePOModal(false);
      setCreatePOSupplierId("");
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      if (result.purchaseOrderId) {
        setLocation(`/projects/${projectId}/purchase-orders/${result.purchaseOrderId}`);
      }
    },
    onError: (err: any) => {
      toast({ title: "Error creating PO", description: err?.message ?? "Something went wrong.", variant: "destructive" });
    },
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async ({ templateId, itemIds }: { templateId: string; itemIds?: string[] }) => {
      const endpoint = itemIds
        ? `/api/selection-templates/${templateId}/apply-items`
        : `/api/selection-templates/${templateId}/apply`;
      return await apiRequest(endpoint, "POST", itemIds ? { projectId, itemIds } : { projectId });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: `${data.created} selection${data.created !== 1 ? "s" : ""} added from template` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to apply template", description: err?.message ?? "Something went wrong.", variant: "destructive" });
    },
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: async ({ name, category }: { name: string; category?: string }) => {
      return await apiRequest(`/api/projects/${projectId}/save-as-template`, "POST", { name, category: category || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      setShowSaveTemplateDialog(false);
      setSaveTemplateName("");
      setSaveTemplateCategory("");
      toast({ title: "Template saved", description: "Your selections have been saved as a template." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save template", description: err?.message ?? "Something went wrong.", variant: "destructive" });
    },
  });

  // ── Grouping helpers ── must be above the early return to respect Rules of Hooks ──
  const groupedFiltered = useMemo(() => {
    if (groupBy === "none") return null;
    const key = groupBy === "category" ? "category" : "room";
    const groups = new Map<string, typeof sorted>();
    for (const sel of sorted) {
      const g = (sel as any)[key] || "Uncategorised";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(sel);
    }
    return groups;
  }, [sorted, groupBy]);

  const allGroupKeys = useMemo(() => (groupedFiltered ? [...groupedFiltered.keys()] : []), [groupedFiltered]);

  // Initialise all groups as expanded when grouping first turns on
  useEffect(() => {
    if (groupBy !== "none" && allGroupKeys.length > 0) {
      setExpandedGroupIds((prev) => prev.size === 0 ? new Set(allGroupKeys) : prev);
    }
  }, [groupBy, allGroupKeys]);

  if (!currentProject) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Please select a project to view selections.</p>
        </div>
      </div>
    );
  }

  // Status tab definition
  const tabs: { key: "all" | DerivedStatus; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "open", label: "Open", count: stats.open },
    { key: "submitted", label: "Submitted", count: stats.submitted },
    { key: "approved", label: "Approved", count: stats.approved },
    { key: "overdue", label: "Overdue", count: stats.overdue },
    { key: "ordered", label: "Ordered", count: stats.ordered },
  ];

  const varianceMeta = formatVarianceCents(stats.variance);

  const toggleGroup = (key: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full bg-background rounded-lg border overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Summary strip (hideable) */}
      {showSummaryCards && (
        <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          {/* Left: stat cards */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatCard
              value={stats.total}
              label="Total"
              variant="default"
              active={statusTab === "all"}
              onClick={() => setStatusTab("all")}
              testId="stat-total"
            />
            <StatCard
              value={stats.open}
              label="Open"
              variant="primary"
              active={statusTab === "open"}
              onClick={() => setStatusTab("open")}
              testId="stat-open"
            />
            <StatCard
              value={stats.submitted}
              label="Submitted"
              variant="amber"
              active={statusTab === "submitted"}
              onClick={() => setStatusTab("submitted")}
              testId="stat-submitted"
            />
            <StatCard
              value={stats.approved}
              label="Approved"
              variant="sage"
              active={statusTab === "approved"}
              onClick={() => setStatusTab("approved")}
              testId="stat-approved"
            />
            <StatCard
              value={stats.overdue}
              label="Overdue"
              variant="coral"
              active={statusTab === "overdue"}
              onClick={() => setStatusTab("overdue")}
              testId="stat-overdue"
            />
            <StatCard
              value={stats.ordered}
              label="Ordered"
              variant="primary"
              active={statusTab === "ordered"}
              onClick={() => setStatusTab("ordered")}
              testId="stat-ordered"
            />
          </div>

          {/* Right: decision progress + budget summary */}
          <div className="rounded-lg border border-border bg-card px-4 py-2 flex items-center gap-6">
            <ProgressStrip selections={selectionsWithOptions} />
            <div className="w-px self-stretch bg-border/70" />
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Allowance</div>
              <div className="text-[13px] font-bold text-foreground tabular-nums" data-testid="text-total-allowance">
                {formatMoneyCents(stats.totalAllowance)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Actual</div>
              <div
                className={`text-[13px] font-bold tabular-nums ${
                  stats.variance > 0 ? "text-[hsl(var(--coral))]" : "text-[hsl(var(--sage))]"
                }`}
                data-testid="text-total-actual"
              >
                {formatMoneyCents(stats.totalActual)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Variance</div>
              <div
                className={`text-[13px] font-bold tabular-nums ${
                  varianceMeta.tone === "over"
                    ? "text-[hsl(var(--coral))]"
                    : varianceMeta.tone === "under"
                      ? "text-[hsl(var(--sage))]"
                      : "text-foreground"
                }`}
                data-testid="text-total-variance"
              >
                {varianceMeta.text}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single-row toolbar */}
      <div className="h-9 flex items-center px-2 gap-2 border-b border-border flex-shrink-0">
          {/* Left: status pill tabs (scroll on narrow) */}
          <div className="flex items-center gap-1 overflow-x-auto min-w-0">
            {tabs.map((tab) => {
              const isActive = statusTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusTab(tab.key)}
                  data-testid={`tab-${tab.key}`}
                  className={cn(
                    "h-6 rounded-md px-2 text-xs flex items-center gap-1.5 whitespace-nowrap border border-transparent hover-elevate active-elevate-2",
                    isActive
                      ? "bg-primary text-white"
                      : "text-muted-foreground"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "tabular-nums text-[10px] px-1 rounded",
                      isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Icon-expand search */}
          <div ref={searchWrapRef} className="flex items-center flex-shrink-0">
            <div
              className={cn(
                "flex items-center transition-all duration-200 overflow-hidden",
                searchExpanded ? "w-56" : "w-6"
              )}
            >
              {searchExpanded ? (
                <div className="relative w-full">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search selections…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearchTerm("");
                        setSearchExpanded(false);
                      }
                    }}
                    className="pl-7 pr-7 h-6 text-xs"
                    data-testid="input-search-selections"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded hover-elevate text-muted-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchExpanded(true)}
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2 text-muted-foreground"
                  data-testid="button-search-toggle"
                  aria-label="Search"
                >
                  <Search className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {/* List / Cards toggle */}
            <div className="flex items-center rounded-md border border-border/50 p-px mr-1">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "h-5 w-6 flex items-center justify-center rounded",
                  viewMode === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
                data-testid="button-view-list"
                aria-label="List view"
              >
                <LayoutList className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={cn(
                  "h-5 w-6 flex items-center justify-center rounded",
                  viewMode === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
                data-testid="button-view-cards"
                aria-label="Cards view"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
            </div>
            {/* Column visibility (list view) */}
            {viewMode === "list" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center border border-border/50 rounded-md hover-elevate active-elevate-2 text-muted-foreground"
                    data-testid="button-columns"
                    aria-label="Columns"
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5 rotate-90" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.category}
                    onCheckedChange={(v) => setVisibleColumns((p) => ({ ...p, category: !!v }))}
                  >
                    Category
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.location}
                    onCheckedChange={(v) => setVisibleColumns((p) => ({ ...p, location: !!v }))}
                  >
                    Location
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={visibleColumns.options}
                    onCheckedChange={(v) => setVisibleColumns((p) => ({ ...p, options: !!v }))}
                  >
                    Options count
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Group-by dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`h-6 w-6 flex items-center justify-center border rounded-md hover-elevate active-elevate-2 ${groupBy !== "none" ? "border-primary/50 text-primary bg-primary/5" : "border-border/50 text-muted-foreground"}`}
                  data-testid="button-group-by"
                  aria-label="Group by"
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setGroupBy("none")}>
                  <span className={groupBy === "none" ? "font-medium" : ""}>No grouping</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("category")}>
                  <span className={groupBy === "category" ? "font-medium" : ""}>Group by Category</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("location")}>
                  <span className={groupBy === "location" ? "font-medium" : ""}>Group by Location</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Category filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`h-6 w-6 flex items-center justify-center border rounded-md hover-elevate active-elevate-2 ${categoryFilter ? "border-primary/50 text-primary bg-primary/5" : "border-border/50 text-muted-foreground"}`}
                  data-testid="button-category-filter"
                  aria-label="Filter by category"
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCategoryFilter("")}>
                  <span className={!categoryFilter ? "font-medium" : ""}>All Categories</span>
                </DropdownMenuItem>
                {selectionCategories?.options?.map((opt) => (
                  <DropdownMenuItem
                    key={opt.key}
                    onClick={() => setCategoryFilter(opt.name)}
                    className={categoryFilter === opt.name ? "bg-accent" : ""}
                  >
                    {opt.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Add Selection primary — builder-only; clients view and approve. */}
            {!isClient && (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 disabled:opacity-60 disabled:pointer-events-none"
              onClick={handleAddSelection}
              disabled={createSelectionMutation.isPending}
              data-testid="button-add-selection"
            >
              {createSelectionMutation.isPending ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              <span>Add Selection</span>
            </button>
            )}

            {/* Options dropdown — templates, exports, share links: builder-only. */}
            {!isClient && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2 text-muted-foreground"
                  data-testid="button-selections-options"
                  aria-label="Selections options"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={() => setShowTemplatePanel((p) => !p)}
                  data-testid="button-toggle-templates"
                >
                  <LayoutTemplate className="w-3.5 h-3.5 mr-2" />
                  {showTemplatePanel ? "Hide Templates" : "Show Templates"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showSummaryCards}
                  onCheckedChange={(c) => setShowSummaryCards(!!c)}
                  onSelect={(e) => e.preventDefault()}
                  data-testid="option-show-summary-cards"
                >
                  Show summary cards
                </DropdownMenuCheckboxItem>
                {projectId && (
                  <>
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/projects/${projectId}/trades-portal-token`, { method: "POST" });
                          if (!res.ok) throw new Error();
                          const { url } = await res.json();
                          await navigator.clipboard.writeText(url);
                          toast({ title: "Trades portal link copied!", description: "Share this link with your trades." });
                        } catch {
                          toast({ title: "Failed to copy link", variant: "destructive" });
                        }
                      }}
                    >
                      <HardHat className="w-3.5 h-3.5 mr-2" />
                      Copy Trades View Link
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => window.open(`/api/selections/project/${projectId}/pdf`, "_blank")}
                    >
                      <FileText className="w-3.5 h-3.5 mr-2" />
                      Export Schedule PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowSaveTemplateDialog(true)}
                      data-testid="option-save-as-template"
                    >
                      <BookCopy className="w-3.5 h-3.5 mr-2" />
                      Save as Template
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Table header — hidden in cards view. Click a label to sort
            (asc → desc → off); drag the divider after a label to resize
            (widths persisted). */}
        {viewMode === "list" && (() => {
          // Plain render functions (NOT components) — inline component types
          // remounted the header every render, breaking drags mid-resize
          const headerCell = (
            label: string,
            sortKey: NonNullable<typeof sortBy>,
            widthKey?: WidthKey,
            align: "left" | "right" = "left",
          ) => (
            <div key={sortKey} className={cn("relative flex items-center h-full min-w-0", align === "right" && "justify-end")}>
              <button
                type="button"
                onClick={() => cycleSort(sortKey)}
                className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:text-foreground truncate"
                data-testid={`sort-${sortKey}`}
              >
                {label}
                {sortBy === sortKey && <span className="text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>}
              </button>
              {widthKey && (
                <div
                  className="absolute -right-2 top-0 h-full w-3 cursor-col-resize flex items-center justify-center group/handle touch-none"
                  onPointerDown={(e) => startColumnResize(widthKey, e)}
                  data-testid={`resize-${widthKey}`}
                >
                  <div className="h-4 w-px bg-border group-hover/handle:bg-primary group-hover/handle:w-0.5" />
                </div>
              )}
            </div>
          );
          return (
            <div
              className="grid gap-3 items-center bg-muted border-b border-border h-[34px] px-3 text-[10px] text-muted-foreground sticky top-0 z-10"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div></div>
              <div></div>
              {headerCell("Selection", "name")}
              {visibleColumns.category && headerCell("Category", "category", "category")}
              {visibleColumns.location && headerCell("Location", "location", "location")}
              {headerCell("Status", "status", "status")}
              {visibleColumns.options && <div className="text-center uppercase tracking-wider font-semibold">Opts</div>}
              {headerCell("Budget", "budget", "budget", "right")}
              {headerCell("Due", "due", "deadline", "right")}
              <div></div>
            </div>
          );
        })()}

        {/* Body — DndContext always mounted so hook count stays stable */}
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {isLoading ? (
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">Loading selections…</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-base font-medium mb-2">No selections found</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {searchTerm || categoryFilter || statusTab !== "all"
                  ? "Try adjusting your filters."
                  : "Create your first selection to get started."}
              </p>
              {!isClient && !searchTerm && !categoryFilter && statusTab === "all" && (
                <Button onClick={handleAddSelection} disabled={createSelectionMutation.isPending} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Selection
                </Button>
              )}
            </div>
          ) : groupBy !== "none" && groupedFiltered ? (
            /* Grouped rendering — DnD enabled within each group */
            <div>
              {allGroupKeys.map((groupKey) => {
                const groupItems = groupedFiltered.get(groupKey) || [];
                const isOpen = expandedGroupIds.has(groupKey);
                return (
                  <div key={groupKey}>
                    {/* Floating group header — sticky, compact, does not occupy a full row */}
                    <div className="sticky top-[34px] z-[9]">
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupKey)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-background/90 backdrop-blur-sm border-b border-border/40 text-left w-full"
                      >
                        {isOpen
                          ? <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                          : <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                        <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">{groupKey}</span>
                        <span className="text-[9px] text-muted-foreground/40 bg-muted/50 rounded px-1 py-px ml-0.5">{groupItems.length}</span>
                      </button>
                    </div>
                    {/* Group items — cards grid or sortable rows */}
                    {isOpen && (viewMode === "cards" ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 px-3 py-3">
                        {groupItems.map((sel) => (
                          <SelectionCard
                            key={sel.id}
                            selection={sel}
                            onOpenDrawer={setDrawerId}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            projectId={projectId!}
                          />
                        ))}
                      </div>
                    ) : (
                      <SortableContext
                        items={groupItems.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {groupItems.map((sel) => (
                          <SortableSelectionRow
                            key={sel.id}
                            selection={sel}
                            gridTemplate={gridTemplate}
                            columns={visibleColumns}
                            onOpenDrawer={setDrawerId}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            isChecked={checkedIds.has(sel.id)}
                            projectId={projectId!}
                            isDraggable={isDraggable}
                          />
                        ))}
                      </SortableContext>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Flat rendering — cards grid or sortable rows */
            viewMode === "cards" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 px-3 py-3">
                {sorted.map((sel) => (
                  <SelectionCard
                    key={sel.id}
                    selection={sel}
                    onOpenDrawer={setDrawerId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    projectId={projectId!}
                  />
                ))}
              </div>
            ) : (
            <SortableContext
              items={sorted.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {sorted.map((sel) => (
                  <SortableSelectionRow
                    key={sel.id}
                    selection={sel}
                    gridTemplate={gridTemplate}
                    columns={visibleColumns}
                    onOpenDrawer={setDrawerId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    isChecked={checkedIds.has(sel.id)}
                    projectId={projectId!}
                    isDraggable={isDraggable}
                  />
                ))}
              </div>
            </SortableContext>
            )
          )}
        </DndContext>
      </div>

      {/* Bulk action toolbar */}
      {checkedIds.size > 0 && (
        <div className="flex-none border-t border-border bg-primary/5 flex items-center justify-between px-4 py-2 gap-3 flex-shrink-0">
          <span className="text-sm font-medium text-foreground">
            {checkedIds.size} selection{checkedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCheckedIds(new Set())}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreatePOModal(true)}
              data-testid="button-create-po"
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1" />
              Convert to PO
            </Button>
          </div>
        </div>
      )}

      {/* Sticky footer */}
      <div className="flex-none h-11 bg-muted/30 border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground flex-shrink-0">
        <span data-testid="text-footer-count">
          {filtered.length} of {stats.total} selections shown
        </span>
        <span data-testid="text-footer-summary">
          Approved spend: <span className="text-foreground font-medium tabular-nums">{formatMoneyCents(approvedSpend)}</span>
          {" · "}
          Pending: <span className="text-foreground font-medium tabular-nums">{formatMoneyCents(stats.pendingAmount)}</span>
          {" across "}
          <span className="text-foreground font-medium">{stats.openCount}</span>
          {" open selections"}
        </span>
      </div>

      {/* Create PO modal */}
      <Dialog open={showCreatePOModal} onOpenChange={(open) => { if (!open) { setShowCreatePOModal(false); setCreatePOSupplierId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Convert Selections to Purchase Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {checkedIds.size} approved selection{checkedIds.size !== 1 ? "s" : ""} will be converted into a new Purchase Order.
              Each selection's chosen option becomes a line item.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Supplier <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Select value={createPOSupplierId} onValueChange={setCreatePOSupplierId}>
                <SelectTrigger data-testid="select-po-supplier">
                  <SelectValue placeholder="No supplier assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {supplierContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
              {[...checkedIds].map((id) => {
                const sel = selectionsWithOptions.find((s) => s.id === id);
                const opt = sel?.options?.find((o) => o.isSelectedByClient);
                return sel ? (
                  <div key={id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium truncate">{sel.name}</span>
                    <span className="text-muted-foreground text-xs truncate">{opt?.name ?? "—"}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreatePOModal(false); setCreatePOSupplierId(""); }}
              disabled={createPOMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createPOMutation.mutate({ selectionIds: [...checkedIds], supplierId: createPOSupplierId === "none" ? "" : createPOSupplierId })}
              disabled={createPOMutation.isPending}
              data-testid="button-confirm-create-po"
            >
              {createPOMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating…</>
              ) : (
                <><ShoppingCart className="w-3.5 h-3.5 mr-1.5" />Create PO</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={(open) => { if (!open) { setShowSaveTemplateDialog(false); setSaveTemplateName(""); setSaveTemplateCategory(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookCopy className="w-4 h-4" />
              Save as Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Save all {filtered.length} visible selection{filtered.length !== 1 ? "s" : ""} as a reusable template.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template Name *</label>
              <Input
                placeholder="e.g., Standard 4-bed Home"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                data-testid="input-save-template-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g., Residential, Commercial"
                value={saveTemplateCategory}
                onChange={(e) => setSaveTemplateCategory(e.target.value)}
                data-testid="input-save-template-category"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowSaveTemplateDialog(false); setSaveTemplateName(""); setSaveTemplateCategory(""); }} disabled={saveAsTemplateMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => { if (saveTemplateName.trim()) saveAsTemplateMutation.mutate({ name: saveTemplateName.trim(), category: saveTemplateCategory.trim() || undefined }); }}
              disabled={saveAsTemplateMutation.isPending || !saveTemplateName.trim()}
              data-testid="button-confirm-save-template"
            >
              {saveAsTemplateMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : <><BookCopy className="w-3.5 h-3.5 mr-1.5" />Save Template</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>{/* end main flex-col */}

      {/* Template Panel */}
      {showTemplatePanel && (
        <div className="w-80 border-l bg-background flex flex-col overflow-hidden shrink-0" data-testid="panel-templates">
          {/* Panel header */}
          <div className="h-9 flex items-center justify-between px-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">Templates</span>
              <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">{selectionTemplates.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplatePanel(false)}
              className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate text-muted-foreground"
              data-testid="button-close-template-panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Panel search */}
          <div className="px-2 py-1.5 border-b border-border flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search templates…"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-7 h-7 text-xs"
                data-testid="input-template-search"
              />
              {templateSearch && (
                <button
                  type="button"
                  onClick={() => setTemplateSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded hover-elevate text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {selectionTemplates.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <LayoutTemplate className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No templates yet
              </div>
            ) : (() => {
              const visibleTemplates = templateSearch
                ? selectionTemplates.filter((t) =>
                    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                    (t.category?.toLowerCase().includes(templateSearch.toLowerCase()))
                  )
                : selectionTemplates;
              if (visibleTemplates.length === 0) return (
                <div className="text-center py-8 text-xs text-muted-foreground">No templates match your search</div>
              );
              return visibleTemplates.map((tmpl) => {
                const tmplItems: any[] = (tmpl.templateData as any[]) || [];
                const isExpanded = expandedTemplateIds.has(tmpl.id);
                return (
                  <div key={tmpl.id} className="border rounded-md overflow-hidden">
                    {/* Template header row */}
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
                      <button
                        type="button"
                        onClick={() => setExpandedTemplateIds((prev) => { const n = new Set(prev); if (n.has(tmpl.id)) n.delete(tmpl.id); else n.add(tmpl.id); return n; })}
                        className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <span className="text-xs font-medium truncate">{tmpl.name}</span>
                        {tmpl.category && <span className="text-[10px] text-muted-foreground border rounded px-1 py-0 shrink-0">{tmpl.category}</span>}
                        <span className="text-[10px] text-muted-foreground shrink-0">{tmplItems.length}</span>
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={!projectId || applyTemplateMutation.isPending}
                            onClick={() => projectId && applyTemplateMutation.mutate({ templateId: tmpl.id })}
                            className="h-5 px-1.5 text-[10px] border border-primary/30 text-primary rounded hover-elevate active-elevate-2 disabled:opacity-40 shrink-0"
                            data-testid={`button-apply-template-${tmpl.id}`}
                          >
                            Apply all
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Apply all {tmplItems.length} items to this project</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && (
                      <div className="divide-y divide-border/50">
                        {tmplItems.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground px-3 py-2">No items in this template</p>
                        ) : (
                          tmplItems.map((item: any) => (
                            <div key={item.id} className="flex items-center gap-1.5 px-2 py-1.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{item.itemName}</p>
                                {(item.categoryName || item.room) && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {[item.categoryName, item.room].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                              {item.budgetAmount && (
                                <span className="text-[10px] text-muted-foreground shrink-0">${(item.budgetAmount / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}</span>
                              )}
                              <button
                                type="button"
                                disabled={!projectId || applyTemplateMutation.isPending}
                                onClick={() => projectId && applyTemplateMutation.mutate({ templateId: tmpl.id, itemIds: [item.id] })}
                                className="h-5 px-1.5 text-[10px] border rounded hover-elevate active-elevate-2 disabled:opacity-40 shrink-0 text-muted-foreground"
                                data-testid={`button-apply-item-${item.id}`}
                              >
                                Add
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Quick-view drawer */}
      <SelectionDrawer
        selection={selectionsWithOptions.find((s) => s.id === drawerId) ?? null}
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        onEdit={handleEdit}
        onSelectOption={(selectionId, optionId) => selectOptionMutation.mutate({ selectionId, optionId })}
        selectPending={selectOptionMutation.isPending}
        projectId={projectId ?? ""}
      />
    </div>
  );
}
