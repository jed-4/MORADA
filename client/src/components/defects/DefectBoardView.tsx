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
import { DEFECT_STAGE_LABELS, checkDefectTransition, type DefectStage, type DefectView } from "@shared/defects";
import { MapPin, Image as ImageIcon, Plus, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useDefectPermissions } from "./defectHooks";
import {
  stageBadgeClass,
  stageAccentBg,
  STAGE_ORDER,
  invalidateDefectQueries,
  priorityBadgeClass,
  priorityAccentBg,
  typeBadgeClass,
  priorityLabel,
  typeLabel,
  ageInDays,
  getInitials,
} from "./defectStyles";

interface DefectBoardViewProps {
  defects: DefectView[];
  onOpen: (defect: DefectView) => void;
  onAddDefect?: (statusKey: string) => void;
}

interface DefectCardProps {
  defect: DefectView;
  onOpen: (defect: DefectView) => void;
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

  const attachments = defect.attachments || [];
  const age = ageInDays(defect.dateIdentified);
  const isOpenStatus = defect.stage !== "fixed" && defect.stage !== "closed";
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
            <span className="text-muted-foreground font-medium mr-1">{defect.ref}</span>
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
              {defect.overdue && (
                <span className="flex items-center gap-0.5 text-[10px] text-[hsl(var(--coral))] font-semibold">
                  <AlertTriangle className="h-3 w-3" /> Overdue
                </span>
              )}
              {isOpenStatus && !defect.overdue && (
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
              {(defect.ownerName || defect.assignedContactName) && (
                <div
                  className="w-[22px] h-[22px] rounded-full bg-primary text-white text-[8px] font-bold flex items-center justify-center"
                  title={defect.ownerName ? `Owner: ${defect.ownerName}` : defect.assignedContactName ?? ""}
                >
                  {getInitials(defect.ownerName || defect.assignedContactName)}
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

const COLUMN_KEYS = STAGE_ORDER;

export function DefectBoardView({ defects, onOpen, onAddDefect }: DefectBoardViewProps) {
  const { toast } = useToast();
  const perms = useDefectPermissions();
  const [activeDefect, setActiveDefect] = useState<DefectView | null>(null);

  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const moveStage = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: DefectStage }) =>
      apiRequest(`/api/defects/${id}/transition`, "POST", { to }),
    onSuccess: () => invalidateDefectQueries(queryClient),
    onError: (e: any) => {
      toast({
        title: "Couldn't move the defect",
        description: e?.payload?.error || e?.message,
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

    let to: DefectStage | null = null;
    if ((COLUMN_KEYS as readonly string[]).includes(overId)) {
      to = overId as DefectStage;
    } else {
      to = defects.find((d) => d.id === overId)?.stage ?? null;
    }

    if (!to) return;
    const moving = defects.find((d) => d.id === defectId);
    if (!moving || moving.stage === to) return;
    // Rejecting needs a note — open the defect so it can be written.
    if (moving.stage === "fixed" && to === "rejected") {
      toast({ title: "Say why it was rejected", description: "Add the note in the defect, then reject." });
      onOpen(moving);
      return;
    }
    const check = checkDefectTransition(moving.stage, to, { canEdit: perms.edit, canClose: perms.close, note: "x" });
    if (!check.ok) {
      toast({ title: "Can't move it there", description: check.error, variant: "destructive" });
      return;
    }
    moveStage.mutate({ id: defectId, to });
  };

  const orderedColumns = COLUMN_KEYS.map((key) => ({ key, name: DEFECT_STAGE_LABELS[key] }));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 h-full overflow-x-auto px-6 pb-2">
        {orderedColumns.map((col) => {
          const colDefects = defects.filter((d) => d.stage === col.key);
          return (
            <div
              key={col.key}
              className="flex flex-col rounded-xl bg-muted/20 overflow-hidden flex-1 min-w-[250px] max-w-[320px]"
              data-testid={`column-${col.key}`}
            >
              {/* Top accent strip */}
              <div className={`h-1 ${stageAccentBg(col.key)}`} />

              {/* Header */}
              <div className="h-11 flex items-center justify-between px-3 border-b border-border">
                <h3
                  className="text-[13px] font-semibold text-foreground"
                  data-testid={`column-title-${col.key}`}
                >
                  {col.name}
                </h3>
                <span
                  className={`inline-flex items-center justify-center min-w-[22px] h-[20px] rounded-full text-[10px] font-semibold px-1.5 ${stageBadgeClass(col.key)}`}
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
                  {onAddDefect && col.key === "open" && (
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
