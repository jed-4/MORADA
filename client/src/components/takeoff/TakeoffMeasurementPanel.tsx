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

  const grouped = useMemo(() => {
    const m = new Map<string, TakeoffMeasurement[]>();
    for (const meas of measurements) {
      const k = meas.categoryId ?? "__uncat__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(meas);
    }
    return m;
  }, [measurements]);

  const categoryName = (id: string) =>
    id === "__uncat__"
      ? "Uncategorised"
      : categories.find((c) => c.id === id)?.name ?? "Category";

  const handleDragEnd = (catId: string, rows: TakeoffMeasurement[]) => async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    await Promise.all(
      reordered.map((r, idx) =>
        r.order === idx
          ? Promise.resolve()
          : updateMeasurement.mutateAsync({ id: r.id, data: { order: idx } as any }),
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
        {grouped.size === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No measurements on this plan yet.
          </div>
        ) : (
          Array.from(grouped.entries()).map(([catId, rows]) => {
            const isCollapsed = !!collapsed[catId];
            return (
              <div key={catId}>
                <button
                  type="button"
                  onClick={() => toggleGroup(catId)}
                  className="w-full px-3 py-1.5 bg-primary/5 flex items-center gap-2 sticky top-0 z-10 hover-elevate text-left"
                  data-testid={`button-toggle-group-${catId}`}
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium truncate">{categoryName(catId)}</span>
                </button>
                {!isCollapsed && (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => { void handleDragEnd(catId, rows)(e); }}
                  >
                    <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                      {rows.map((m) => (
                        <SortableRow
                          key={m.id}
                          m={m}
                          editing={editingId === m.id}
                          editName={editName}
                          setEditName={setEditName}
                          onStartEdit={() => { setEditingId(m.id); setEditName(m.name); }}
                          onCommitName={() => {
                            if (editName.trim() && editName !== m.name) {
                              updateMeasurement.mutate({ id: m.id, data: { name: editName.trim() } as any });
                            }
                            setEditingId(null);
                          }}
                          highlighted={m.id === highlightedId}
                          onHighlight={onHighlight}
                          onColor={(color) => updateMeasurement.mutate({ id: m.id, data: { color } as any })}
                          onToggleVisible={() =>
                            updateMeasurement.mutate({ id: m.id, data: { isVisible: !m.isVisible } as any })
                          }
                          onDelete={() => deleteMeasurement.mutate(m.id)}
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
          })
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
    // Ignore clicks on inner controls (buttons, inputs, dropdown items, the
    // color swatch popover trigger, etc.) — those have their own handlers.
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
            // Stop pointer events from reaching the dnd-kit listeners on the
            // row, otherwise selecting text in the input would start a drag.
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
