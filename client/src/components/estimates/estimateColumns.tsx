/**
 * Columns for an estimate grid: the list, the picker, and resizing.
 *
 * One definition for the estimate page AND the estimate-template page. They
 * used to keep their own lists, which drifted: different order (Description
 * second on a template, fourth on an estimate), different names ("Client (ex)"
 * vs "Amount"), different defaults, and a different way to reorder (drag the
 * heading vs drag in the picker). A template is the estimate it produces, so
 * it should look and work like one.
 */
import React, { useCallback, useEffect, useState } from "react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Columns3, GripVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ColumnConfig } from "@/components/estimates/estimateGridRow";

export {
  ESTIMATE_DEFAULT_COLUMNS,
  TEMPLATE_DEFAULT_COLUMNS,
  mergeSavedColumns,
  gridLayout,
} from "@/components/estimates/estimateColumnModel";

function columnLimits(columnId: string) {
  return columnId === "description" || columnId === "item" ? { min: 80, max: 600 } : { min: 40, max: 400 };
}

/**
 * Drag a column's right edge to resize it. `onEnd` runs once when the drag
 * finishes — the estimate page saves its layout then.
 */
export function useColumnResize(
  setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>>,
  onEnd?: () => void,
) {
  const [drag, setDrag] = useState<{ id: string; startX: number; startWidth: number } | null>(null);

  const startResize = useCallback((columnId: string, e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault();
    setDrag({ id: columnId, startX: e.clientX, startWidth: currentWidth });
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, []);

  useEffect(() => {
    if (!drag) return;
    const { min, max } = columnLimits(drag.id);
    const onMove = (e: MouseEvent) => {
      const width = Math.min(max, Math.max(min, drag.startWidth + (e.clientX - drag.startX)));
      setColumns((prev) => prev.map((c) => (c.id === drag.id ? { ...c, widthPx: width } : c)));
    };
    const onUp = () => {
      setDrag(null);
      onEnd?.();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [drag, setColumns, onEnd]);

  return { resizingColumn: drag?.id ?? null, startResize };
}

// Draggable row in the column visibility/order picker popover.
function ColumnReorderItem({ column, onToggle }: { column: ColumnConfig; onToggle: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-muted"
      data-testid={`column-reorder-${column.id}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
        aria-label={`Reorder ${column.label} column`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        checked={column.visible}
        onCheckedChange={() => onToggle(column.id)}
        className="flex-shrink-0"
      />
      <span className="truncate text-sm flex-1">{column.label}</span>
    </div>
  );
}

/** The Columns button and its popover: drag to reorder, tick to show/hide. */
export function EstimateColumnsPicker({
  columns,
  onChange,
}: {
  columns: ColumnConfig[];
  /** The whole new list — reordered or with one column toggled. */
  onChange: (next: ColumnConfig[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = columns.findIndex((c) => c.id === active.id);
    const to = columns.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(columns, from, to));
  };
  const onToggle = (id: string) =>
    onChange(columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
          data-testid="button-column-visibility"
          title="Columns"
          aria-label="Columns"
        >
          <Columns3 className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2" data-testid="popover-columns">
        <div className="px-1.5 pt-1 text-sm font-semibold">Columns</div>
        <p className="px-1.5 pb-2 text-xs text-muted-foreground">Drag to reorder · toggle to show/hide.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="max-h-80 overflow-y-auto space-y-0.5 pr-0.5">
              {columns.map((column) => (
                <ColumnReorderItem key={column.id} column={column} onToggle={onToggle} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </PopoverContent>
    </Popover>
  );
}
