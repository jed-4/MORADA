import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
} from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Defect } from "@shared/schema";
import { MapPin, Image as ImageIcon, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDefectStatusOptions } from "@/hooks/useDefectStatusOptions";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import {
  statusBadgeClass,
  statusAccentBg,
  priorityBadgeClass,
  priorityAccentBg,
  typeBadgeClass,
  priorityLabel,
  typeLabel,
  statusLabel,
  ageInDays,
  getInitials,
} from "./defectStyles";

interface DefectBoardViewProps {
  defects: Defect[];
  onOpen: (defect: Defect) => void;
  onAddDefect?: (statusKey: string) => void;
}

interface DefectCardProps {
  defect: Defect;
  onOpen: (defect: Defect) => void;
  priorityOptions: Array<{ key: string; name: string }>;
  typeOptions: Array<{ key: string; name: string }>;
}

function DefectCard({ defect, onOpen, priorityOptions, typeOptions }: DefectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: defect.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const attachments =
    (defect.attachments as Array<{ url: string; name: string }> | undefined) || [];
  const age = ageInDays(defect.dateIdentified);
  const isOpenStatus = defect.status === "open" || defect.status === "in_progress";
  const ageStale = isOpenStatus && age > 30;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="mx-2.5 mb-2.5"
      data-testid={`card-defect-${defect.id}`}
    >
      <div
        onClick={() => onOpen(defect)}
        className="rounded-lg bg-card border border-border/60 shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:border-border transition-all flex"
      >
        {/* Priority accent bar */}
        <div className={`w-[3px] flex-shrink-0 ${priorityAccentBg(defect.priority)}`} />

        <div className="flex-1 min-w-0 pl-4 pr-3 pt-3 pb-2.5">
          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${priorityBadgeClass(
                defect.priority,
              )}`}
            >
              {priorityLabel(defect.priority, priorityOptions)}
            </span>
            <span
              className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${typeBadgeClass(
                defect.type,
              )}`}
            >
              {typeLabel(defect.type, typeOptions)}
            </span>
          </div>

          {/* Title */}
          <h4 className="text-[12px] font-semibold text-foreground mt-2 line-clamp-2">
            {defect.title}
          </h4>

          {/* Description */}
          {defect.description && (
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
              {defect.description}
            </p>
          )}

          {/* Divider */}
          <div className="border-t border-border/60 mt-2.5 mb-2" />

          {/* Footer */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              {defect.location && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{defect.location}</span>
                </div>
              )}
              {isOpenStatus && (
                <span
                  className={`text-[10px] ${
                    ageStale
                      ? "text-[hsl(var(--coral))] font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  {age}d open
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {attachments.length > 0 && (
                <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <ImageIcon className="h-3 w-3" />
                  <span>{attachments.length}</span>
                </div>
              )}
              {defect.assignedContactName && (
                <div
                  className="w-[22px] h-[22px] rounded-full bg-primary text-white text-[8px] font-bold flex items-center justify-center"
                  title={defect.assignedContactName}
                >
                  {getInitials(defect.assignedContactName)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DroppableColumnProps {
  id: string;
  children: React.ReactNode;
}

function DroppableColumn({ id, children }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-[120px] rounded-md transition-colors ${
        isOver ? "ring-2 ring-primary/40 ring-inset bg-primary/5" : ""
      }`}
    >
      {children}
    </div>
  );
}

const COLUMN_KEYS = ["open", "in_progress", "resolved", "closed"] as const;

export function DefectBoardView({ defects, onOpen, onAddDefect }: DefectBoardViewProps) {
  const { toast } = useToast();
  const [activeDefect, setActiveDefect] = useState<Defect | null>(null);

  const { statusOptions } = useDefectStatusOptions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/defects/${id}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to move defect",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDefect(defects.find((d) => d.id === event.active.id) || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDefect(null);
    if (!over) return;

    const defectId = active.id as string;
    const overId = over.id as string;

    let newStatus: string | null = null;
    if (COLUMN_KEYS.includes(overId as (typeof COLUMN_KEYS)[number])) {
      newStatus = overId;
    } else {
      const target = defects.find((d) => d.id === overId);
      newStatus = target?.status ?? null;
    }

    if (!newStatus) return;
    const moving = defects.find((d) => d.id === defectId);
    if (!moving || moving.status === newStatus) return;
    updateStatus.mutate({ id: defectId, status: newStatus });
  };

  // Order columns: spec wants Open / In Progress / Resolved / Closed
  const orderedColumns = COLUMN_KEYS.map((key) => {
    const opt = statusOptions.find((s) => s.key === key);
    return {
      key,
      name: opt?.name ?? statusLabel(key, []),
    };
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 h-full overflow-x-auto px-6 pb-2">
        {orderedColumns.map((col) => {
          const colDefects = defects.filter((d) => d.status === col.key);
          return (
            <div
              key={col.key}
              className="flex flex-col rounded-xl bg-muted/20 overflow-hidden flex-1 min-w-[280px] max-w-[340px]"
              data-testid={`column-${col.key}`}
            >
              {/* Top accent strip */}
              <div className={`h-1 ${statusAccentBg(col.key)}`} />

              {/* Header */}
              <div className="h-11 flex items-center justify-between px-3 border-b border-border">
                <h3
                  className="text-[13px] font-semibold text-foreground"
                  data-testid={`column-title-${col.key}`}
                >
                  {col.name}
                </h3>
                <span
                  className={`inline-flex items-center justify-center min-w-[22px] h-[20px] rounded-full text-[10px] font-semibold px-1.5 ${statusBadgeClass(
                    col.key,
                  )}`}
                  data-testid={`count-${col.key}`}
                >
                  {colDefects.length}
                </span>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto py-2.5">
                <DroppableColumn id={col.key}>
                  <SortableContext
                    id={col.key}
                    items={colDefects.map((d) => d.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {colDefects.map((defect) => (
                      <DefectCard
                        key={defect.id}
                        defect={defect}
                        onOpen={onOpen}
                        priorityOptions={priorityOptions}
                        typeOptions={typeOptions}
                      />
                    ))}
                  </SortableContext>

                  {/* Ghost add card (inside droppable so empty columns still accept drops) */}
                  {onAddDefect && (
                    <button
                      type="button"
                      onClick={() => onAddDefect(col.key)}
                      className="mx-2.5 mb-2.5 w-[calc(100%-1.25rem)] rounded-lg border border-dashed border-border/60 h-10 flex items-center justify-center text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:border-border cursor-pointer transition-colors"
                      data-testid={`add-defect-${col.key}`}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add defect
                    </button>
                  )}
                </DroppableColumn>
              </div>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeDefect && (
          <div className="rounded-lg bg-card border border-border shadow-xl ring-2 ring-primary/40 w-[280px] flex">
            <div className={`w-[3px] ${priorityAccentBg(activeDefect.priority)}`} />
            <div className="pl-4 pr-3 pt-3 pb-2.5 flex-1">
              <h4 className="text-[12px] font-semibold text-foreground line-clamp-2">
                {activeDefect.title}
              </h4>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
