import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronLast,
  MoreVertical,
  GripVertical,
  BookmarkPlus,
  FolderDown,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TakeoffMeasurement, TakeoffCategory, TakeoffPlan } from "@shared/schema";
import TakeoffColorPicker from "./TakeoffColorPicker";
import { normalizeEntries } from "./useTakeoffGeometry";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  projectId: string;
  plan: TakeoffPlan;
  /** Every item on the plan — one list, however many pages it is drawn across. */
  measurements: TakeoffMeasurement[];
  /** The page on screen, so rows can say whether they are marked up here. */
  currentPageId?: string | null;
  /** Page id → page number, for the "pages 1, 3" note on a row. */
  pageNumberById?: Map<string, number>;
  /** The one mark being pointed at on the plan, if any. */
  highlightedShape?: { measurementId: string; index: number } | null;
  onHighlightShape?: (shape: { measurementId: string; index: number } | null) => void;
  /** Open the page a mark is on and point at it. */
  onShowShape?: (m: TakeoffMeasurement, index: number) => void;
  /** Remove one mark, leaving the rest of the item alone. */
  onDeleteShape?: (m: TakeoffMeasurement, index: number) => void;
  categories: TakeoffCategory[];
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
  onAddClick: () => void;
  onEditClick?: (m: TakeoffMeasurement) => void;
  activeDrawingId?: string | null;
  onActivateDrawing?: (m: TakeoffMeasurement) => void;
  onCollapse?: () => void;
  onLoadTemplate?: () => void;
  onSaveTemplate?: () => void;
}

const UNCAT = "__uncat__";

export default function TakeoffMeasurementPanel({
  projectId,
  plan,
  measurements,
  currentPageId = null,
  pageNumberById,
  highlightedShape = null,
  onHighlightShape,
  onShowShape,
  onDeleteShape,
  categories,
  highlightedId,
  onHighlight,
  onAddClick,
  onEditClick,
  activeDrawingId = null,
  onActivateDrawing,
  onCollapse,
  onLoadTemplate,
  onSaveTemplate,
}: Props) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TakeoffMeasurement | null>(null);
  /* Which items are showing their marks. Checking a take-off means reading the
     three squares you drew against the three on the plan, one at a time. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  /* Estimate lines can be built on a measurement, so deleting one is not a
     private act. This is what the row's "used by" note and the delete warning
     are made of. */
  const usageKey = ["/api/projects", projectId, "takeoff/measurement-usage"];
  const { data: usage = [] } = useQuery<
    Array<{ measurementId: string; items: Array<{ itemId: string; itemName: string; estimateName: string }> }>
  >({
    queryKey: usageKey,
    enabled: !!projectId,
  });
  const usageById = useMemo(
    () => new Map(usage.map((u) => [u.measurementId, u.items] as const)),
    [usage],
  );

  const measurementsKey = ["/api/projects", projectId, "takeoff/measurements"];
  const pageMeasurementsKeyPrefix = ["/api/projects", projectId, "takeoff/pages"];
  const categoriesKey = ["/api/projects", projectId, "takeoff/categories"];

  // distance:5 lets a plain click through; only a real drag activates sortable.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const updateMeasurement = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TakeoffMeasurement> }) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/measurements/${id}`,
        "PATCH",
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementsKey });
      queryClient.invalidateQueries({ queryKey: pageMeasurementsKeyPrefix });
    },
    onError: (err: any) => {
      // Roll back any optimistic state by refetching truth.
      queryClient.invalidateQueries({ queryKey: measurementsKey });
      queryClient.invalidateQueries({ queryKey: pageMeasurementsKeyPrefix });
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TakeoffCategory> }) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/categories/${id}`,
        "PATCH",
        data,
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey }),
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: categoriesKey });
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  const deleteMeasurement = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        `/api/projects/${projectId}/takeoff/measurements/${id}`,
        "DELETE",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementsKey });
      queryClient.invalidateQueries({ queryKey: pageMeasurementsKeyPrefix });
      // The estimate lines that used it are now showing a broken reference.
      queryClient.invalidateQueries({ queryKey: usageKey });
      queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "/api/estimates"
          && (q.queryKey[2] === "items" || q.queryKey[2] === "summary"),
      });
      toast({ title: "Deleted" });
    },
  });

  // Build the ordered list of (categoryId, rows). Categories use their
  // server `order` field then createdAt; uncategorised pinned to the end.
  const ordered = useMemo(() => {
    const byCat = new Map<string, TakeoffMeasurement[]>();
    for (const m of measurements) {
      const k = m.categoryId ?? UNCAT;
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(m);
    }
    // Sort rows within each group by their `order` field (stable for equal orders).
    byCat.forEach((rows) => rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

    const sortedCats = [...categories].sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        a.name.localeCompare(b.name),
    );
    const result: { id: string; name: string; rows: TakeoffMeasurement[] }[] = [];
    for (const c of sortedCats) {
      const rows = byCat.get(c.id);
      if (rows && rows.length) result.push({ id: c.id, name: c.name, rows });
    }
    const uncat = byCat.get(UNCAT);
    if (uncat && uncat.length) {
      result.push({ id: UNCAT, name: "Uncategorised", rows: uncat });
    }
    return result;
  }, [measurements, categories]);

  // Optimistic helper — patch measurements caches in place so reorder is instant.
  const patchMeasurementsCache = (mutator: (rows: TakeoffMeasurement[]) => TakeoffMeasurement[]) => {
    queryClient.setQueriesData<TakeoffMeasurement[]>({ queryKey: measurementsKey }, (old) =>
      old ? mutator(old) : old,
    );
    queryClient.setQueriesData<TakeoffMeasurement[]>({ queryKey: pageMeasurementsKeyPrefix }, (old) =>
      old ? mutator(old) : old,
    );
  };

  const handleRowDragEnd = (catId: string) => async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const group = ordered.find((g) => g.id === catId);
    if (!group) return;
    const oldIndex = group.rows.findIndex((r) => r.id === active.id);
    const newIndex = group.rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(group.rows, oldIndex, newIndex);
    const updates = reordered
      .map((r, idx) => ({ id: r.id, newOrder: idx, prevOrder: r.order ?? 0 }))
      .filter((u) => u.newOrder !== u.prevOrder);

    // Optimistically update cache so the UI moves instantly and groups stay put.
    patchMeasurementsCache((rows) =>
      rows.map((r) => {
        const u = updates.find((x) => x.id === r.id);
        return u ? ({ ...r, order: u.newOrder } as TakeoffMeasurement) : r;
      }),
    );
    // Fire mutations in parallel; cache already reflects the desired state.
    void Promise.all(
      updates.map((u) =>
        updateMeasurement.mutateAsync({ id: u.id, data: { order: u.newOrder } as any }),
      ),
    );
  };

  const handleCategoryDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Only real categories are sortable; skip uncategorised.
    const ids = ordered.map((g) => g.id).filter((id) => id !== UNCAT);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(ids, oldIndex, newIndex);
    const idToCat = new Map(categories.map((c) => [c.id, c] as const));
    const updates = reordered
      .map((id, idx) => ({ id, newOrder: idx, prevOrder: idToCat.get(id)?.order ?? 0 }))
      .filter((u) => u.newOrder !== u.prevOrder);

    queryClient.setQueriesData<TakeoffCategory[]>({ queryKey: categoriesKey }, (old) =>
      old
        ? old.map((c) => {
            const u = updates.find((x) => x.id === c.id);
            return u ? { ...c, order: u.newOrder } : c;
          })
        : old,
    );
    void Promise.all(
      updates.map((u) =>
        updateCategory.mutateAsync({ id: u.id, data: { order: u.newOrder } as any }),
      ),
    );
  };

  const toggleGroup = (catId: string) =>
    setCollapsed((prev) => ({ ...prev, [catId]: !prev[catId] }));

  /* Collapse / expand every category at once — the same control the take-off
     TEMPLATE editor has, so the two lists behave alike. Derived from the groups
     rather than kept as its own flag: collapsing the last open category on its
     own must leave the button offering "expand", and a stored boolean drifts
     out of step with the rows the moment one is toggled by hand. */
  const allCollapsed = ordered.length > 0 && ordered.every((g) => collapsed[g.id]);
  const toggleAllGroups = () =>
    setCollapsed(allCollapsed ? {} : Object.fromEntries(ordered.map((g) => [g.id, true])));

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* One row, not two. The plan's name was repeated here from the viewer's
          own title bar directly above, and the two-line block cost the list
          another 48px for nothing. */}
      <div className="h-9 px-3 border-b border-border flex items-center gap-1 flex-shrink-0">
        {/* "All pages", not "Measurements": the column header below already
            says what the list is, and the one thing that is NOT obvious is
            that it shows the whole plan rather than the page on screen. At the
            default panel width a longer label simply truncates to nothing. */}
        <div className="flex-1 min-w-0 text-xs uppercase tracking-wide text-muted-foreground truncate" title="Every measurement on this plan, not just the page on screen">
          All pages
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onAddClick} data-testid="button-add-measurement-header">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
        {/* Icon-only, and it says which way it goes — same control and same
            wording as the take-off template editor. */}
        {ordered.length > 1 && (
          <button
            className="h-6 w-6 flex items-center justify-center border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2 flex-shrink-0"
            onClick={toggleAllGroups}
            title={allCollapsed ? "Expand all categories" : "Collapse all categories"}
            aria-label={allCollapsed ? "Expand all categories" : "Collapse all categories"}
            data-testid="button-toggle-all-groups"
          >
            {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
          </button>
        )}
        {onCollapse && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 flex-shrink-0"
            onClick={onCollapse}
            title="Hide the measurements panel"
            data-testid="button-collapse-panel"
          >
            <ChevronLast className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="px-3 py-1 border-b border-border flex items-center text-xs font-medium text-muted-foreground flex-shrink-0">
        <span className="flex-1">Name</span>
        <span className="w-20 text-right">Qty</span>
        <span className="w-8" />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {ordered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No measurements on this plan yet.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => { void handleCategoryDragEnd(e); }}
          >
            <SortableContext
              items={ordered.filter((g) => g.id !== UNCAT).map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              {ordered.map((group) => (
                <SortableGroup
                  key={group.id}
                  group={group}
                  isCollapsed={!!collapsed[group.id]}
                  onToggle={() => toggleGroup(group.id)}
                  rowSensors={sensors}
                  onRowDragEnd={handleRowDragEnd(group.id)}
                  draggable={group.id !== UNCAT}
                  // Uncategorised is a placeholder, not a row in
                  // takeoff_categories, so there is nothing to rename.
                  onRename={
                    group.id === UNCAT
                      ? undefined
                      : (name: string) => updateCategory.mutate({ id: group.id, data: { name } })
                  }
                  onToggleGroupVisible={(visible: boolean) => {
                    // Only the ones that need changing — a category of thirty
                    // with two hidden should write two rows, not thirty.
                    for (const m of group.rows) {
                      if ((m.isVisible !== false) !== visible) {
                        updateMeasurement.mutate({ id: m.id, data: { isVisible: visible } as any });
                      }
                    }
                  }}
                  // row props
                  editingId={editingId}
                  editName={editName}
                  setEditName={setEditName}
                  setEditingId={setEditingId}
                  highlightedId={highlightedId}
                  onHighlight={onHighlight}
                  activeDrawingId={activeDrawingId}
                  onActivateDrawing={onActivateDrawing}
                  onEditClick={onEditClick}
                  onUpdateMeasurement={(id, data) => updateMeasurement.mutate({ id, data })}
                  onDeleteMeasurement={(id) => deleteMeasurement.mutate(id)}
                  currentPageId={currentPageId}
                  pageNumberById={pageNumberById}
                  usageById={usageById}
                  expanded={expanded}
                  onToggleExpand={(id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))}
                  highlightedShape={highlightedShape}
                  onHighlightShape={onHighlightShape}
                  onShowShape={onShowShape}
                  onDeleteShape={onDeleteShape}
                  editingQtyId={editingQtyId}
                  editQty={editQty}
                  setEditQty={setEditQty}
                  setEditingQtyId={setEditingQtyId}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent data-testid="dialog-measurement-in-use">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.name} is used by {usageById.get(pendingDelete?.id ?? "")?.length ?? 0} estimate{" "}
              {(usageById.get(pendingDelete?.id ?? "")?.length ?? 0) === 1 ? "line" : "lines"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Those lines keep the figure they have now, and their quantity will show as
              a broken take-off reference until you edit it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-auto text-sm space-y-1">
            {(usageById.get(pendingDelete?.id ?? "") ?? []).map((u) => (
              <div key={u.itemId} className="flex justify-between gap-3">
                <span className="truncate">{u.itemName}</span>
                <span className="text-muted-foreground whitespace-nowrap">{u.estimateName}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-measurement">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteMeasurement.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              data-testid="button-confirm-delete-measurement"
            >
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="p-3 border-t border-border space-y-2">
        <Button onClick={onAddClick} className="w-full" data-testid="button-add-measurement">
          <Plus className="h-4 w-4 mr-2" /> Add measurement
        </Button>
        {(onLoadTemplate || onSaveTemplate) && (
          <div className="flex gap-2">
            {onLoadTemplate && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onLoadTemplate}
                data-testid="button-panel-load-template"
              >
                <FolderDown className="h-3.5 w-3.5 mr-1.5" /> Import template
              </Button>
            )}
            {onSaveTemplate && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onSaveTemplate}
                data-testid="button-panel-save-template"
              >
                <BookmarkPlus className="h-3.5 w-3.5 mr-1.5" /> Save template
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableGroup({
  group,
  isCollapsed,
  onToggle,
  onRename,
  onToggleGroupVisible,
  rowSensors,
  onRowDragEnd,
  draggable,
  editingId,
  editName,
  setEditName,
  setEditingId,
  highlightedId,
  onHighlight,
  activeDrawingId,
  onActivateDrawing,
  onEditClick,
  onUpdateMeasurement,
  onDeleteMeasurement,
  currentPageId,
  pageNumberById,
  usageById,
  expanded,
  onToggleExpand,
  highlightedShape,
  onHighlightShape,
  onShowShape,
  onDeleteShape,
  editingQtyId,
  editQty,
  setEditQty,
  setEditingQtyId,
  onRequestDelete,
}: {
  group: { id: string; name: string; rows: TakeoffMeasurement[] };
  isCollapsed: boolean;
  onToggle: () => void;
  /** Absent for Uncategorised, which is not a real category. */
  onRename?: (name: string) => void;
  /** Show or hide every measurement in this category on the plan at once. */
  onToggleGroupVisible: (visible: boolean) => void;
  rowSensors: ReturnType<typeof useSensors>;
  onRowDragEnd: (e: DragEndEvent) => void;
  draggable: boolean;
  editingId: string | null;
  editName: string;
  setEditName: (s: string) => void;
  setEditingId: (s: string | null) => void;
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
  activeDrawingId: string | null;
  onActivateDrawing?: (m: TakeoffMeasurement) => void;
  onEditClick?: (m: TakeoffMeasurement) => void;
  onUpdateMeasurement: (id: string, data: Partial<TakeoffMeasurement>) => void;
  onDeleteMeasurement: (id: string) => void;
  currentPageId: string | null;
  pageNumberById?: Map<string, number>;
  usageById: Map<string, Array<{ itemId: string; itemName: string; estimateName: string }>>;
  expanded: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  highlightedShape: { measurementId: string; index: number } | null;
  onHighlightShape?: (shape: { measurementId: string; index: number } | null) => void;
  onShowShape?: (m: TakeoffMeasurement, index: number) => void;
  onDeleteShape?: (m: TakeoffMeasurement, index: number) => void;
  editingQtyId: string | null;
  editQty: string;
  setEditQty: (v: string) => void;
  setEditingQtyId: (id: string | null) => void;
  onRequestDelete: (m: TakeoffMeasurement) => void;
}) {
  const sortable = useSortable({ id: group.id, disabled: !draggable });
  /* Renaming a category. The route and the mutation have always accepted a
     name; nothing ever sent one, so a category could be created and reordered
     but never corrected — a typo was permanent. */
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const commitRename = () => {
    const next = draftName.trim();
    setRenaming(false);
    // An empty name would leave a nameless band nobody can click back into.
    if (!next || next === group.name) { setDraftName(group.name); return; }
    onRename?.(next);
  };
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
  };

  return (
    <div ref={sortable.setNodeRef} style={style} data-testid={`group-${group.id}`}>
      <div className="group/cat w-full px-3 py-1.5 bg-primary/5 flex items-center gap-2 sticky top-0 z-10">
        {renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { e.preventDefault(); setDraftName(group.name); setRenaming(false); }
            }}
            className="flex-1 h-6 px-1 text-xs font-medium bg-background border border-border rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            aria-label={`Rename ${group.name}`}
            data-testid={`input-rename-group-${group.id}`}
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            // Double-click to rename, the way the schedule and estimate grids
            // already work, so there is no extra control sitting in the band.
            onDoubleClick={() => {
              if (!onRename) return;
              setDraftName(group.name);
              setRenaming(true);
            }}
            title={onRename ? "Double-click to rename" : undefined}
            className="flex-1 flex items-center gap-2 hover-elevate text-left -mx-1 px-1 py-0.5 rounded-sm"
            data-testid={`button-toggle-group-${group.id}`}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-xs font-medium truncate" title={group.name}>{group.name}</span>
          </button>
        )}
        {/* Hide the whole category's markup in one click. There was only a
            per-measurement eye, so clearing a category off the plan meant
            clicking every one of them — and a category is exactly the unit you
            want to switch off while marking up another trade. */}
        {(() => {
          const shown = group.rows.filter((m: any) => m.isVisible !== false).length;
          const allShown = shown === group.rows.length;
          const noneShown = shown === 0;
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleGroupVisible(!allShown); }}
              className="p-1 rounded-sm text-muted-foreground opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 transition-opacity hover-elevate data-[mixed=true]:opacity-100 data-[hidden=true]:opacity-100"
              // Kept visible when the category is hidden or partly hidden —
              // otherwise the only sign that markup is switched off is markup
              // that is not there, which looks like it was never drawn.
              data-hidden={noneShown}
              data-mixed={!allShown && !noneShown}
              title={
                allShown ? `Hide all ${group.rows.length} on the plan`
                : noneShown ? `Show all ${group.rows.length} on the plan`
                : `${shown} of ${group.rows.length} shown — click to show all`
              }
              aria-label={allShown ? `Hide ${group.name} on the plan` : `Show ${group.name} on the plan`}
              data-testid={`button-group-visibility-${group.id}`}
            >
              {noneShown
                ? <EyeOff className="h-3.5 w-3.5" />
                : <Eye className={`h-3.5 w-3.5 ${allShown ? "" : "opacity-50"}`} />}
            </button>
          );
        })()}
        {onRename && !renaming && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDraftName(group.name); setRenaming(true); }}
            className="p-1 rounded-sm text-muted-foreground opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 transition-opacity hover-elevate"
            aria-label={`Rename ${group.name}`}
            data-testid={`button-rename-group-${group.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {draggable && (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            className={`p-1 rounded-sm text-muted-foreground touch-none opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 transition-opacity ${sortable.isDragging ? "opacity-100 cursor-grabbing" : "cursor-grab"} hover-elevate`}
            aria-label={`Drag ${group.name}`}
            data-testid={`button-drag-group-${group.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      {!isCollapsed && (
        <DndContext
          sensors={rowSensors}
          collisionDetection={closestCenter}
          onDragEnd={onRowDragEnd}
        >
          <SortableContext items={group.rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {group.rows.map((m) => (
              <SortableRow
                key={m.id}
                m={m}
                editing={editingId === m.id}
                editName={editName}
                setEditName={setEditName}
                onStartEdit={() => { setEditingId(m.id); setEditName(m.name); }}
                onCommitName={() => {
                  if (editName.trim() && editName !== m.name) {
                    onUpdateMeasurement(m.id, { name: editName.trim() } as any);
                  }
                  setEditingId(null);
                }}
                highlighted={m.id === highlightedId}
                onHighlight={onHighlight}
                onColor={(color) => onUpdateMeasurement(m.id, { color } as any)}
                onToggleVisible={() => onUpdateMeasurement(m.id, { isVisible: !m.isVisible } as any)}
                onDelete={() => {
                  // A measurement an estimate is built on gets a question first.
                  if ((usageById.get(m.id)?.length ?? 0) > 0) onRequestDelete(m);
                  else onDeleteMeasurement(m.id);
                }}
                onEdit={onEditClick ? () => onEditClick(m) : undefined}
                active={m.id === activeDrawingId}
                onActivate={onActivateDrawing ? () => onActivateDrawing(m) : undefined}
                currentPageId={currentPageId}
                pageNumberById={pageNumberById}
                usedBy={usageById.get(m.id) ?? []}
                expanded={!!expanded[m.id]}
                onToggleExpand={() => onToggleExpand(m.id)}
                highlightedShape={highlightedShape}
                onHighlightShape={onHighlightShape}
                onShowShape={onShowShape ? (i) => onShowShape(m, i) : undefined}
                onDeleteShape={onDeleteShape ? (i) => onDeleteShape(m, i) : undefined}
                editingQty={editingQtyId === m.id}
                editQty={editQty}
                setEditQty={setEditQty}
                onStartQtyEdit={() => {
                  setEditingQtyId(m.id);
                  setEditQty(String(m.quantity ?? 0));
                }}
                onCommitQty={() => {
                  const next = parseFloat(editQty);
                  if (!Number.isNaN(next) && next !== m.quantity) {
                    onUpdateMeasurement(m.id, { quantity: next } as any);
                  }
                  setEditingQtyId(null);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableRow({
  m, editing, editName, setEditName, onStartEdit, onCommitName,
  highlighted, onHighlight, onColor, onToggleVisible, onDelete, onEdit,
  active, onActivate, currentPageId, pageNumberById,
  usedBy, editingQty, editQty, setEditQty, onStartQtyEdit, onCommitQty,
  expanded, onToggleExpand, highlightedShape, onHighlightShape, onShowShape, onDeleteShape,
}: {
  m: TakeoffMeasurement;
  editing: boolean;
  editName: string;
  setEditName: (s: string) => void;
  onStartEdit: () => void;
  onCommitName: () => void;
  highlighted: boolean;
  onHighlight: (id: string | null) => void;
  onColor: (c: string) => void;
  onToggleVisible: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  active: boolean;
  onActivate?: () => void;
  currentPageId: string | null;
  pageNumberById?: Map<string, number>;
  usedBy: Array<{ itemId: string; itemName: string; estimateName: string }>;
  expanded: boolean;
  onToggleExpand: () => void;
  highlightedShape: { measurementId: string; index: number } | null;
  onHighlightShape?: (shape: { measurementId: string; index: number } | null) => void;
  onShowShape?: (index: number) => void;
  onDeleteShape?: (index: number) => void;
  editingQty: boolean;
  editQty: string;
  setEditQty: (v: string) => void;
  onStartQtyEdit: () => void;
  onCommitQty: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id });
  /* Where this item has been marked up. The quantity on the row is the sum of
     all of them, so the row says which pages it came from — otherwise a total
     that includes pages you cannot see reads like a bug. */
  const entries = normalizeEntries(m.geometry, m.pageId);
  const pageNumbers = Array.from(
    new Set(
      entries
        .map((e) => (e.pageId ? pageNumberById?.get(e.pageId) : undefined))
        .filter((n): n is number => typeof n === "number"),
    ),
  ).sort((a, b) => a - b);
  const onThisPage = entries.some((e) => e.pageId === currentPageId);
  const heightMm = (m as { heightMm?: number | null }).heightMm ?? null;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const handleRowClick = (e: React.MouseEvent) => {
    if (!onActivate) return;
    // Clicks on the row's own controls (colour, eye, menu, the rename input)
    // are theirs, not "start drawing". The row must be excluded from that test
    // by hand: useSortable puts role="button" on it, so closest() matched the
    // ROW for every click and drawing could never be started from the list.
    const hit = (e.target as HTMLElement).closest(
      "button, input, [role='button'], [role='menuitem']",
    );
    if (hit && hit !== e.currentTarget) return;
    onActivate();
  };
  const canDraw = m.measurementType !== "manual";
  const marks = entries.map((e, index) => ({ ...e, index }));

  return (
    <div ref={setNodeRef} style={style}>
    <div
      {...attributes}
      {...listeners}
      onMouseEnter={() => onHighlight(m.id)}
      onMouseLeave={() => onHighlight(null)}
      onClick={handleRowClick}
      className={`flex items-center gap-1 px-2 py-2 border-b border-border touch-none ${
        active
          ? "bg-primary/15 ring-1 ring-inset ring-primary"
          : highlighted
            ? "bg-primary/5"
            : ""
      } ${isDragging ? "cursor-grabbing" : "cursor-grab"} ${canDraw && onActivate ? "hover-elevate" : ""}`}
      data-testid={`panel-row-${m.id}`}
      data-active={active ? "true" : "false"}
      title={canDraw && onActivate ? (active ? "Click to stop drawing — drag to reorder" : "Click to draw on plan — drag to reorder") : "Drag to reorder"}
    >
      {/* Open the item to check what was actually drawn for it. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={marks.length === 0}
        className={`p-0.5 rounded-sm ${marks.length === 0 ? "opacity-0 cursor-default" : "hover-elevate text-muted-foreground"}`}
        aria-expanded={expanded}
        title={expanded ? "Hide the marks" : `Show the ${marks.length} mark${marks.length === 1 ? "" : "s"} on the plan`}
        data-testid={`button-toggle-marks-${m.id}`}
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5" />
          : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      <span title={`${m.measurementType} measurement`} className="flex-shrink-0 flex items-center">
        <TakeoffColorPicker color={m.color} onChange={onColor} testId={`color-${m.id}`} />
      </span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={onCommitName}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitName();
              if (e.key === "Escape") onCommitName();
            }}
            className="h-7 text-sm"
          />
        ) : (
          <div
            className="text-sm truncate cursor-text flex items-center gap-1.5"
            // The NAME first. The title was the rename hint alone, so hovering
            // a truncated "Waterproofing — Bath 2 wa…" told you how to rename
            // it instead of what it was called — which is the one thing you
            // hover a cut-off name to find out.
            title={`${m.name}\nDouble-click to rename`}
            onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}
          >
            {active && <Pencil className="h-3 w-3 text-primary flex-shrink-0" />}
            <span className="truncate">{m.name}</span>
          </div>
        )}
        {/* The second line is for things you glance at, not read. It never
            wraps: it used to, and each extra line squeezed the name above it
            until "Bath 1 Floor Tiling" showed as "Bath 1 F...".
            The measurement type is gone from here — the unit beside the
            quantity already says m², lm or each, so printing AREA as well was
            saying it twice. It is on the colour swatch's tooltip instead.
            Pages are counted rather than listed for the same reason: the list
            grew without limit, and the marks it refers to are one click away
            on the expander, which names each page anyway. */}
        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
          {heightMm ? <span>{heightMm / 1000} m high</span> : null}
          {pageNumbers.length > 0 && (
            <span
              className={onThisPage ? "text-foreground/70" : ""}
              title={
                pageNumbers.length > 1
                  ? `Marked up on pages ${pageNumbers.join(", ")} — the quantity is all of them`
                  : `Marked up on page ${pageNumbers[0]}`
              }
              data-testid={`row-pages-${m.id}`}
            >
              {pageNumbers.length > 1
                ? `${pageNumbers.length} pages`
                : `p${pageNumbers[0]}`}
            </span>
          )}
          {usedBy.length > 0 && (
            <span
              className="text-primary truncate"
              title={`Used by ${usedBy.map((u) => `${u.itemName} — ${u.estimateName}`).join(", ")}`}
              data-testid={`row-used-by-${m.id}`}
            >
              {pageNumbers.length > 0 ? "· " : ""}used {usedBy.length}×
            </span>
          )}
        </div>
      </div>
      {/* A manual measurement has no shape to measure, so its quantity is
          typed here — the row used to say "edit the quantity on the row" with
          nowhere to do it. A drawn measurement's quantity is the drawing's. */}
      {m.measurementType === "manual" && editingQty ? (
        <Input
          autoFocus
          type="number"
          value={editQty}
          onChange={(e) => setEditQty(e.target.value)}
          onBlur={onCommitQty}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") onCommitQty();
          }}
          className="h-7 w-20 text-sm text-right"
          data-testid={`input-manual-qty-${m.id}`}
        />
      ) : (
        <div
          className={`text-sm tabular-nums w-16 text-right flex-shrink-0 ${
            m.measurementType === "manual" ? "cursor-text hover-elevate rounded-sm" : ""
          }`}
          title={m.measurementType === "manual" ? "Click to type the quantity" : undefined}
          onClick={(e) => {
            if (m.measurementType !== "manual") return;
            e.stopPropagation();
            onStartQtyEdit();
          }}
          data-testid={`qty-${m.id}`}
        >
          {Math.round((m.quantity ?? 0) * 100) / 100}
          <span className="text-xs text-muted-foreground ml-1">{m.unit}</span>
        </div>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 flex-shrink-0"
        onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
        data-testid={`button-toggle-visible-${m.id}`}
        title={m.isVisible ? "Hide on plan" : "Show on plan"}
      >
        {m.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label="Measurement options"
            data-testid={`button-row-menu-${m.id}`}
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {onEdit && (
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              data-testid={`menu-edit-${m.id}`}
            >
              <Pencil className="h-4 w-4 mr-2" /> Edit details
            </DropdownMenuItem>
          )}
          {onEdit && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-destructive"
            data-testid={`menu-delete-${m.id}`}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    {/* What was actually drawn for this item: one row per mark, in the order
        they were drawn, each with the page it is on and what it measured
        there. Hovering points at it on the plan; clicking opens its page. */}
    {expanded && marks.length > 0 && (
      <div className="bg-muted/30 border-b border-border" data-testid={`marks-${m.id}`}>
        {marks.map((mark) => {
          const page = mark.pageId ? pageNumberById?.get(mark.pageId) : undefined;
          const picked =
            highlightedShape?.measurementId === m.id && highlightedShape?.index === mark.index;
          const amount =
            m.measurementType === "count"
              ? `${mark.points.length} marker${mark.points.length === 1 ? "" : "s"}`
              : `${Math.round((mark.qty ?? 0) * 100) / 100} ${
                  m.measurementType === "linear" && heightMm ? "lm" : m.unit
                }`;
          return (
            <div
              key={mark.index}
              className={`flex items-center gap-2 pl-8 pr-2 py-1.5 text-xs ${picked ? "bg-primary/10" : ""} ${onShowShape ? "cursor-pointer hover-elevate" : ""}`}
              onMouseEnter={() => onHighlightShape?.({ measurementId: m.id, index: mark.index })}
              onMouseLeave={() => onHighlightShape?.(null)}
              onClick={(e) => { e.stopPropagation(); onShowShape?.(mark.index); }}
              onPointerDown={(e) => e.stopPropagation()}
              title={page ? `Mark ${mark.index + 1} on page ${page}` : `Mark ${mark.index + 1}`}
              data-testid={`mark-${m.id}-${mark.index}`}
            >
              <span className="text-muted-foreground w-12 flex-shrink-0">
                {page ? `Page ${page}` : "—"}
              </span>
              <span className="flex-1 tabular-nums">{amount}</span>
              {onDeleteShape && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteShape(mark.index); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded-sm text-muted-foreground hover-elevate"
                  title="Remove just this mark"
                  data-testid={`button-delete-mark-${m.id}-${mark.index}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {/* The item's own figure, so the marks can be checked against it. */}
        <div className="flex items-center gap-2 pl-8 pr-9 py-1.5 text-xs border-t border-border">
          <span className="flex-1 text-muted-foreground">
            {marks.length} mark{marks.length === 1 ? "" : "s"}
            {heightMm ? ` × ${heightMm / 1000} m high` : ""}
          </span>
          <span className="tabular-nums font-medium">
            {Math.round((m.quantity ?? 0) * 100) / 100} {m.unit}
          </span>
        </div>
      </div>
    )}
    </div>
  );
}
