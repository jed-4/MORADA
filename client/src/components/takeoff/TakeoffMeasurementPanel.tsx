import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
  MoreVertical,
  GripVertical,
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

interface Props {
  projectId: string;
  plan: TakeoffPlan;
  measurements: TakeoffMeasurement[];
  categories: TakeoffCategory[];
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
  onAddClick: () => void;
  onEditClick?: (m: TakeoffMeasurement) => void;
  activeDrawingId?: string | null;
  onActivateDrawing?: (m: TakeoffMeasurement) => void;
}

const UNCAT = "__uncat__";

export default function TakeoffMeasurementPanel({
  projectId,
  plan,
  measurements,
  categories,
  highlightedId,
  onHighlight,
  onAddClick,
  onEditClick,
  activeDrawingId = null,
  onActivateDrawing,
}: Props) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">This plan</div>
        <div className="text-sm font-medium truncate" title={plan.name}>{plan.name}</div>
      </div>

      <div className="px-3 py-2 border-b border-border flex items-center text-xs font-medium text-muted-foreground">
        <span className="flex-1">Name</span>
        <span className="w-20 text-right">Qty</span>
        <span className="w-8" />
      </div>

      <div className="flex-1 overflow-auto">
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
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <Button onClick={onAddClick} className="w-full" data-testid="button-add-measurement">
          <Plus className="h-4 w-4 mr-2" /> Add measurement
        </Button>
      </div>
    </div>
  );
}

function SortableGroup({
  group,
  isCollapsed,
  onToggle,
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
}: {
  group: { id: string; name: string; rows: TakeoffMeasurement[] };
  isCollapsed: boolean;
  onToggle: () => void;
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
}) {
  const sortable = useSortable({ id: group.id, disabled: !draggable });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
  };

  return (
    <div ref={sortable.setNodeRef} style={style} data-testid={`group-${group.id}`}>
      <div className="w-full px-3 py-1.5 bg-primary/5 flex items-center gap-2 sticky top-0 z-10">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 hover-elevate text-left -mx-1 px-1 py-0.5 rounded-sm"
          data-testid={`button-toggle-group-${group.id}`}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span className="text-xs font-medium truncate">{group.name}</span>
        </button>
        {draggable && (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            className={`p-1 rounded-sm text-muted-foreground touch-none ${sortable.isDragging ? "cursor-grabbing" : "cursor-grab"} hover-elevate`}
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
                onDelete={() => onDeleteMeasurement(m.id)}
                onEdit={onEditClick ? () => onEditClick(m) : undefined}
                active={m.id === activeDrawingId}
                onActivate={onActivateDrawing ? () => onActivateDrawing(m) : undefined}
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
  active, onActivate,
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
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const handleRowClick = (e: React.MouseEvent) => {
    if (!onActivate) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, [role='button'], [role='menuitem']")) return;
    onActivate();
  };
  const canDraw = m.measurementType !== "manual";
  return (
    <div
      ref={setNodeRef}
      style={style}
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
      <TakeoffColorPicker color={m.color} onChange={onColor} testId={`color-${m.id}`} />
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
            title="Double-click to rename"
            onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}
          >
            {active && <Pencil className="h-3 w-3 text-primary flex-shrink-0" />}
            <span className="truncate">{m.name}</span>
          </div>
        )}
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {m.measurementType}
        </div>
      </div>
      <div className="text-sm tabular-nums w-20 text-right">
        {Math.round((m.quantity ?? 0) * 100) / 100}
        <span className="text-xs text-muted-foreground ml-1">{m.unit}</span>
      </div>
      <Button
        size="icon"
        variant="ghost"
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
  );
}
