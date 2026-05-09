import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Pin,
  PinOff,
  Plus,
  MoreHorizontal,
  GripVertical,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  Folder,
  GitBranch,
  Receipt,
  CheckSquare,
  AlertCircle,
  BookOpen,
  StickyNote,
  File as FileIcon,
  Search,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type PinnedItemType =
  | "document"
  | "link"
  | "folder"
  | "variation"
  | "bill"
  | "checklist"
  | "defect"
  | "diary"
  | "note"
  | "page"
  | "project"
  | "contact";

interface PinnedItemRow {
  id: string;
  userId: string;
  companyId: string;
  projectId: string | null;
  itemType: PinnedItemType | string;
  itemId: string;
  itemName: string;
  itemIcon: string | null;
  category: string | null;
  sortOrder: number;
  createdAt: string;
}

interface PinnedConfig {
  sortOrder: "manual" | "newest" | "oldest" | "az" | "byType";
  groupByCategory: boolean;
  showTypeLabel: boolean;
  showDatePinned: boolean;
  compactMode: boolean;
  maxVisible: 5 | 10 | 0;
}

const DEFAULT_CONFIG: PinnedConfig = {
  sortOrder: "manual",
  groupByCategory: false,
  showTypeLabel: true,
  showDatePinned: false,
  compactMode: false,
  maxVisible: 10,
};

const TYPE_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  document: { color: "hsl(var(--bp-coral))", icon: FileText, label: "Document" },
  link: { color: "hsl(var(--bp-teal))", icon: LinkIcon, label: "Link" },
  folder: { color: "hsl(var(--bp-amber))", icon: Folder, label: "Folder" },
  variation: { color: "hsl(var(--bp-purple))", icon: GitBranch, label: "Variation" },
  bill: { color: "hsl(var(--bp-green))", icon: Receipt, label: "Bill" },
  checklist: { color: "#4a90d4", icon: CheckSquare, label: "Checklist" },
  defect: { color: "hsl(var(--bp-coral))", icon: AlertCircle, label: "Defect" },
  diary: { color: "hsl(var(--bp-muted))", icon: BookOpen, label: "Site Diary" },
  note: { color: "hsl(var(--bp-amber))", icon: StickyNote, label: "Note" },
  page: { color: "hsl(var(--bp-muted))", icon: FileIcon, label: "Page" },
  project: { color: "hsl(var(--bp-purple))", icon: FileIcon, label: "Project" },
  contact: { color: "hsl(var(--bp-teal))", icon: FileIcon, label: "Contact" },
};

function getTypeMeta(t: string) {
  return TYPE_CONFIG[t] || { color: "hsl(var(--bp-muted))", icon: FileIcon, label: t };
}

function urlForItem(projectId: string, item: PinnedItemRow): string {
  switch (item.itemType) {
    case "link":
      return item.itemId; // itemId is the URL
    case "page":
      return item.itemId; // itemId is the path
    case "bill":
      return `/bills/${item.itemId}`;
    case "variation":
      return `/variations/${item.itemId}`;
    case "defect":
      return `/projects/${projectId}/defects`;
    case "checklist":
      return `/projects/${projectId}/checklists`;
    case "diary":
      return `/projects/${projectId}/site-diary`;
    case "note":
      return `/notes`;
    case "document":
    case "folder":
      return `/projects/${projectId}/documents`;
    default:
      return `/projects/${projectId}`;
  }
}

function formatDatePinned(d: string): string {
  try {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
}

interface SortableRowProps {
  item: PinnedItemRow;
  index: number;
  projectId: string;
  config: PinnedConfig;
  onUnpin: (id: string) => void;
  onNavigate: (path: string) => void;
  draggable: boolean;
}

function SortableRow({ item, index, projectId, config, onUnpin, onNavigate, draggable }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !draggable,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const meta = getTypeMeta(item.itemType);
  const Icon = meta.icon;
  const rowHeight = config.compactMode ? "min-h-[34px]" : "min-h-[44px]";
  const iconBoxSize = config.compactMode ? "h-6 w-6" : "h-7 w-7";
  const iconSize = config.compactMode ? "h-3.5 w-3.5" : "h-4 w-4";
  const isEven = index % 2 === 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 px-2 rounded-sm cursor-pointer hover-elevate",
        rowHeight,
        isEven && "bg-[hsl(var(--bp-subtle))]",
      )}
      onClick={() => {
        const url = urlForItem(projectId, item);
        if (url.startsWith("http")) {
          window.open(url, "_blank", "noopener,noreferrer");
        } else {
          onNavigate(url);
        }
      }}
      data-testid={`pinned-row-${item.id}`}
      {...attributes}
    >
      <div
        className={cn("flex items-center justify-center rounded-md shrink-0", iconBoxSize)}
        style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 15%, transparent)` }}
      >
        <Icon className={iconSize} style={{ color: meta.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-medium text-[hsl(var(--bp-card-foreground))] truncate"
          data-testid={`pinned-name-${item.id}`}
        >
          {item.itemName}
        </p>
        {!config.compactMode && (config.showTypeLabel || config.showDatePinned) ? (
          <p className="text-xs text-[hsl(var(--bp-muted))] truncate">
            {config.showTypeLabel ? meta.label : ""}
            {config.showTypeLabel && config.showDatePinned ? " · " : ""}
            {config.showDatePinned ? formatDatePinned(item.createdAt) : ""}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {draggable ? (
          <button
            type="button"
            className="p-1 rounded text-[hsl(var(--bp-muted))] cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
            data-testid={`pinned-drag-${item.id}`}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          className="p-1 rounded hover:bg-[hsl(var(--bp-subtle))] text-[hsl(var(--bp-muted))]"
          onClick={(e) => {
            e.stopPropagation();
            onUnpin(item.id);
          }}
          title="Unpin"
          data-testid={`pinned-unpin-${item.id}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function PinnedItemsWidget({ widget, onUpdate }: WidgetProps) {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const projectId = currentProject?.id;

  const config: PinnedConfig = {
    ...DEFAULT_CONFIG,
    ...((widget.config as Partial<PinnedConfig>) || {}),
  };

  const updateConfig = (patch: Partial<PinnedConfig>) => {
    if (!onUpdate) return;
    onUpdate({ ...widget, config: { ...config, ...patch } });
  };

  const [showPinModal, setShowPinModal] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const queryKey = ["/api/projects", projectId, "pinned-items"] as const;

  const itemsQ = useQuery<PinnedItemRow[]>({
    queryKey,
    queryFn: async () => {
      if (!projectId) return [];
      return apiRequest(`/api/projects/${projectId}/pinned-items`, "GET");
    },
    enabled: !!projectId,
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiRequest(`/api/projects/${projectId}/pinned-items/reorder`, "POST", { orderedIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: any) =>
      toast({ title: "Couldn't reorder", description: e.message, variant: "destructive" }),
  });

  const unpinMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/projects/${projectId}/pinned-items/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Unpinned" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't unpin", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; data: Partial<PinnedItemRow> }) =>
      apiRequest(
        `/api/projects/${projectId}/pinned-items/${vars.id}`,
        "PATCH",
        vars.data,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (e: any) =>
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedItems = useMemo(() => {
    const items = (itemsQ.data || []).slice();
    switch (config.sortOrder) {
      case "newest":
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "oldest":
        items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "az":
        items.sort((a, b) => a.itemName.localeCompare(b.itemName));
        break;
      case "byType":
        items.sort((a, b) => a.itemType.localeCompare(b.itemType) || a.itemName.localeCompare(b.itemName));
        break;
      default:
        items.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return items;
  }, [itemsQ.data, config.sortOrder]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sortedItems.map((i) => i.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(ids, oldIndex, newIndex);
    reorderMutation.mutate(newOrder);
  };

  const headerRight = (
    <>
      <Button
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setShowPinModal(true)}
        data-testid="button-pinned-add"
      >
        <Plus className="h-3 w-3 mr-1" />
        Pin
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            data-testid="button-pinned-menu"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Display</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={config.sortOrder}
                  onValueChange={(v) => updateConfig({ sortOrder: v as PinnedConfig["sortOrder"] })}
                >
                  <DropdownMenuRadioItem value="manual">Manual order</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="az">A–Z</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="byType">By type</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={config.groupByCategory}
            onCheckedChange={(v) => updateConfig({ groupByCategory: !!v })}
          >
            Group by category
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={config.showTypeLabel}
            onCheckedChange={(v) => updateConfig({ showTypeLabel: !!v })}
          >
            Show type label
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={config.showDatePinned}
            onCheckedChange={(v) => updateConfig({ showDatePinned: !!v })}
          >
            Show date pinned
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={config.compactMode}
            onCheckedChange={(v) => updateConfig({ compactMode: !!v })}
          >
            Compact mode
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Max visible</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={String(config.maxVisible)}
                  onValueChange={(v) =>
                    updateConfig({ maxVisible: Number(v) as PinnedConfig["maxVisible"] })
                  }
                >
                  <DropdownMenuRadioItem value="5">5</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="10">10</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="0">All</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const draggable = config.sortOrder === "manual" && !config.groupByCategory;
  const limit = config.maxVisible;
  const showLimitToggle = limit > 0 && sortedItems.length > limit;
  const visibleItems =
    showLimitToggle && !showAll ? sortedItems.slice(0, limit) : sortedItems;

  // Group by category if enabled (must run before any early return to keep hook order stable)
  const grouped = useMemo(() => {
    if (!config.groupByCategory) return null;
    const map = new Map<string, PinnedItemRow[]>();
    for (const item of visibleItems) {
      const key = item.category?.trim() || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [visibleItems, config.groupByCategory]);

  if (!currentProject) {
    return (
      <div className="p-4">
        <WidgetEmpty message="Select a project to see pinned items" />
      </div>
    );
  }

  if (itemsQ.isLoading) return <WidgetSkeleton />;
  if (itemsQ.isError) return <WidgetError onRetry={() => itemsQ.refetch()} />;

  return (
    <div className="flex flex-col h-full" data-testid="widget-pinned-items">
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[hsl(var(--bp-card-foreground))] truncate">
            Pinned Items
          </h3>
          <p className="text-xs text-[hsl(var(--bp-muted))] truncate">
            Quick access to saved items
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">{headerRight}</div>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2">
        {sortedItems.length === 0 ? (
          <WidgetEmpty message="No pinned items yet — use the pin icon on any item to pin it here." />
        ) : grouped ? (
          <div className="space-y-2">
            {grouped.map(([category, items]) => {
              const collapsed = collapsedGroups.has(category);
              return (
                <div key={category}>
                  <button
                    type="button"
                    className="flex items-center gap-1 w-full px-1 py-1 text-xs uppercase tracking-wide text-[hsl(var(--bp-muted))] hover-elevate rounded-sm"
                    onClick={() => {
                      const next = new Set(collapsedGroups);
                      if (collapsed) next.delete(category);
                      else next.add(category);
                      setCollapsedGroups(next);
                    }}
                    data-testid={`pinned-group-${category}`}
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    <span className="font-semibold">{category}</span>
                    {collapsed ? (
                      <span className="ml-auto text-[hsl(var(--bp-muted))] normal-case tracking-normal">
                        {items.length}
                      </span>
                    ) : null}
                  </button>
                  {!collapsed ? (
                    <div className="space-y-px">
                      {items.map((item, idx) => (
                        <SortableRow
                          key={item.id}
                          item={item}
                          index={idx}
                          projectId={projectId!}
                          config={config}
                          onUnpin={(id) => unpinMutation.mutate(id)}
                          onNavigate={setLocation}
                          draggable={false}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-px">
                {visibleItems.map((item, idx) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    index={idx}
                    projectId={projectId!}
                    config={config}
                    onUnpin={(id) => unpinMutation.mutate(id)}
                    onNavigate={setLocation}
                    draggable={draggable}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {showLimitToggle ? (
          <div className="pt-2">
            <button
              type="button"
              className="text-xs text-[hsl(var(--bp-purple))] hover:underline px-2"
              onClick={() => setShowAll((v) => !v)}
              data-testid="button-pinned-show-all"
            >
              {showAll
                ? "Show less"
                : `Show ${sortedItems.length - limit} more…`}
            </button>
          </div>
        ) : null}
      </div>

      <PinModal
        open={showPinModal}
        onOpenChange={setShowPinModal}
        projectId={projectId!}
        existingItems={itemsQ.data || []}
        onPinned={() => queryClient.invalidateQueries({ queryKey })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pin Modal — search across project items + URL paste
// ---------------------------------------------------------------------------

interface PinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existingItems: PinnedItemRow[];
  onPinned: () => void;
}

interface SearchResult {
  type: PinnedItemType;
  id: string;
  name: string;
}

function PinModal({ open, onOpenChange, projectId, existingItems, onPinned }: PinModalProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // Pull source data for search; only fetch when modal open
  const billsQ = useQuery<any[]>({
    queryKey: ["/api/bills", { projectId }],
    queryFn: () => apiRequest(`/api/bills?projectId=${projectId}`, "GET"),
    enabled: open,
  });
  const variationsQ = useQuery<any[]>({
    queryKey: ["/api/variations", { projectId }],
    queryFn: () => apiRequest(`/api/variations?projectId=${projectId}`, "GET"),
    enabled: open,
  });
  const defectsQ = useQuery<any[]>({
    queryKey: ["/api/defects", { projectId }],
    queryFn: () => apiRequest(`/api/defects?projectId=${projectId}`, "GET"),
    enabled: open,
  });
  const checklistsQ = useQuery<any[]>({
    queryKey: ["/api/checklist-instances", { projectId }],
    queryFn: () => apiRequest(`/api/checklist-instances?projectId=${projectId}`, "GET"),
    enabled: open,
  });
  const diaryQ = useQuery<any[]>({
    queryKey: ["/api/site-diary-entries", { projectId }],
    queryFn: () => apiRequest(`/api/site-diary-entries?projectId=${projectId}`, "GET"),
    enabled: open,
  });
  const notesQ = useQuery<any[]>({
    queryKey: ["/api/notes", { projectId, modal: true }],
    queryFn: () => apiRequest(`/api/notes?projectId=${projectId}`, "GET"),
    enabled: open,
  });

  const pinMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/projects/${projectId}/pinned-items`, "POST", data),
    onSuccess: () => {
      onPinned();
      toast({ title: "Pinned" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't pin", description: e.message, variant: "destructive" }),
  });

  const pinnedKey = useMemo(() => {
    const set = new Set<string>();
    for (const it of existingItems) set.add(`${it.itemType}:${it.itemId}`);
    return set;
  }, [existingItems]);

  const allResults: SearchResult[] = useMemo(() => {
    const arr: SearchResult[] = [];
    (billsQ.data || []).forEach((b: any) =>
      arr.push({ type: "bill", id: String(b.id), name: b.billNumber || b.billReference || "Bill" }),
    );
    (variationsQ.data || []).forEach((v: any) =>
      arr.push({ type: "variation", id: String(v.id), name: v.name || v.variationNumber || "Variation" }),
    );
    (defectsQ.data || []).forEach((d: any) =>
      arr.push({ type: "defect", id: String(d.id), name: d.title || "Defect" }),
    );
    (checklistsQ.data || []).forEach((c: any) =>
      arr.push({ type: "checklist", id: String(c.id), name: c.name || "Checklist" }),
    );
    (diaryQ.data || []).forEach((d: any) =>
      arr.push({ type: "diary", id: String(d.id), name: d.title || "Site diary entry" }),
    );
    (notesQ.data || []).forEach((n: any) =>
      arr.push({ type: "note", id: String(n.id), name: n.title || "Note" }),
    );
    return arr;
  }, [billsQ.data, variationsQ.data, defectsQ.data, checklistsQ.data, diaryQ.data, notesQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allResults.slice(0, 30);
    return allResults.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 30);
  }, [allResults, query]);

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of existingItems) {
      if (it.category) set.add(it.category);
    }
    return Array.from(set);
  }, [existingItems]);

  const reset = () => {
    setQuery("");
    setCategory("");
    setLinkLabel("");
    setLinkUrl("");
  };

  const submitLink = () => {
    if (!linkUrl.trim()) {
      toast({ title: "Enter a URL", variant: "destructive" });
      return;
    }
    pinMutation.mutate(
      {
        itemType: "link",
        itemId: linkUrl.trim(),
        itemName: linkLabel.trim() || linkUrl.trim(),
        category: category.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  const pinResult = (r: SearchResult) => {
    pinMutation.mutate(
      {
        itemType: r.type,
        itemId: r.id,
        itemName: r.name,
        category: category.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pin an item</DialogTitle>
          <DialogDescription>
            Search project items or paste a URL to pin to this dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pin-search" className="text-xs">Search project items</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-[hsl(var(--bp-muted))]" />
              <Input
                id="pin-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bills, variations, defects, checklists, diary, notes…"
                className="h-9 pl-7 text-sm"
                data-testid="input-pin-search"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-56 overflow-auto border border-bp-border rounded-md">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-[hsl(var(--bp-muted))] text-center">
                No matching items
              </div>
            ) : (
              filtered.map((r) => {
                const meta = getTypeMeta(r.type);
                const Icon = meta.icon;
                const already = pinnedKey.has(`${r.type}:${r.id}`);
                return (
                  <button
                    key={`${r.type}:${r.id}`}
                    type="button"
                    disabled={already || pinMutation.isPending}
                    onClick={() => pinResult(r)}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-2 text-left text-sm hover-elevate",
                      already && "opacity-50",
                    )}
                    data-testid={`pin-result-${r.type}-${r.id}`}
                  >
                    <div
                      className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 15%, transparent)` }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                    </div>
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="text-xs text-[hsl(var(--bp-muted))] capitalize">{meta.label}</span>
                    {already ? (
                      <span className="text-xs text-[hsl(var(--bp-purple))]">pinned</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-bp-border pt-3 space-y-2">
            <Label className="text-xs">Or paste a URL</Label>
            <Input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Label (optional)"
              className="h-8 text-sm"
              data-testid="input-pin-link-label"
            />
            <div className="flex items-center gap-2">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="h-8 text-sm flex-1"
                data-testid="input-pin-link-url"
              />
              <Button
                size="sm"
                onClick={submitLink}
                disabled={!linkUrl.trim() || pinMutation.isPending}
                data-testid="button-pin-link"
              >
                Pin link
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pin-category" className="text-xs">Category (optional)</Label>
            <Input
              id="pin-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={
                existingCategories.length
                  ? `e.g. ${existingCategories.slice(0, 3).join(", ")}`
                  : "New category…"
              }
              list="pin-category-options"
              className="h-8 text-sm"
              data-testid="input-pin-category"
            />
            {existingCategories.length ? (
              <datalist id="pin-category-options">
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-pin-cancel">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
