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
  closestCenter
} from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Defect } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pencil, Trash2, MapPin, Calendar, Image as ImageIcon, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { DefectFormDialog } from "./DefectFormDialog";
import { useDefectStatusOptions } from "@/hooks/useDefectStatusOptions";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { format } from "date-fns";

interface DefectBoardViewProps {
  defects: Defect[];
}

interface DefectCardProps {
  defect: Defect;
  onEdit: (defect: Defect) => void;
  onDelete: (defect: Defect) => void;
  priorityOptions: Array<{ key: string; name: string; color?: string | null }>;
  typeOptions: Array<{ key: string; name: string }>;
  isDragging?: boolean;
}

function DefectCard({ defect, onEdit, onDelete, priorityOptions, typeOptions, isDragging }: DefectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: defect.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const priorityOption = priorityOptions.find((o) => o.key === defect.priority);
  const typeOption = typeOptions.find((o) => o.key === defect.type);
  const attachments = (defect.attachments as Array<{ url: string; name: string }>) || [];

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-white";
      case "low": return "bg-green-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group ${isDragging ? 'z-50' : ''}`}
    >
      <Card 
        className={`p-3 bg-card border hover-elevate transition-all ${isSortableDragging ? 'shadow-lg ring-2 ring-[#bba7db]/50' : ''}`}
        data-testid={`card-defect-${defect.id}`}
      >
        {/* Header - Title and Menu */}
        <div className="flex items-start gap-2 mb-2">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 
              className="font-medium text-sm line-clamp-2 cursor-pointer hover:text-[#bba7db] transition-colors" 
              onClick={() => onEdit(defect)}
              data-testid={`text-title-${defect.id}`}
            >
              {defect.title}
            </h4>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-menu-${defect.id}`}
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onEdit(defect)}
                data-testid={`menu-item-edit-${defect.id}`}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(defect)}
                className="text-destructive"
                data-testid={`menu-item-delete-${defect.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Badges Row */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {/* Priority Badge - Color coded */}
          <Badge 
            className={`h-5 text-[10px] px-1.5 ${getPriorityColor(defect.priority)}`}
            data-testid={`badge-priority-${defect.id}`}
          >
            {priorityOption?.name || defect.priority}
          </Badge>
          
          {/* Type Badge */}
          <Badge 
            variant="secondary" 
            className="h-5 text-[10px] px-1.5"
            data-testid={`badge-type-${defect.id}`}
          >
            {typeOption?.name || defect.type}
          </Badge>
        </div>

        {/* Description */}
        {defect.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {defect.description}
          </p>
        )}

        {/* Metadata Row */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {defect.location && (
            <div className="flex items-center gap-1" data-testid={`text-location-${defect.id}`}>
              <MapPin className="h-3 w-3" />
              <span className="truncate max-w-[80px]">{defect.location}</span>
            </div>
          )}
          
          {defect.dateIdentified && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(defect.dateIdentified), "MMM d")}</span>
            </div>
          )}
          
          {attachments.length > 0 && (
            <div className="flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              <span>{attachments.length}</span>
            </div>
          )}
        </div>
      </Card>
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
      className={`flex-1 min-h-[200px] rounded-md transition-colors ${isOver ? 'bg-[#bba7db]/10' : ''}`}
    >
      {children}
    </div>
  );
}

export function DefectBoardView({ defects }: DefectBoardViewProps) {
  const { toast } = useToast();
  const [activeDefect, setActiveDefect] = useState<Defect | null>(null);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);
  const [deletingDefect, setDeletingDefect] = useState<Defect | null>(null);

  const { statusOptions } = useDefectStatusOptions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const updateDefectStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/defects/${id}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      toast({
        title: "Success",
        description: "Defect status updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update defect status",
        variant: "destructive",
      });
    },
  });

  const deleteDefect = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/defects/${id}`, "DELETE", null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      toast({
        title: "Success",
        description: "Defect deleted successfully",
      });
      setDeletingDefect(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete defect",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const defect = defects.find((d) => d.id === event.active.id);
    setActiveDefect(defect || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDefect(null);

    if (!over) return;

    const defectId = active.id as string;
    const overId = over.id as string;
    
    // Check if dropped on a column
    const isDroppedOnColumn = statusOptions.some(s => s.key === overId);
    const newStatus = isDroppedOnColumn ? overId : null;
    
    if (!newStatus) {
      // Dropped on another card - find its status
      const targetDefect = defects.find(d => d.id === overId);
      if (targetDefect) {
        const defect = defects.find((d) => d.id === defectId);
        if (defect && defect.status !== targetDefect.status) {
          updateDefectStatus.mutate({ id: defectId, status: targetDefect.status });
        }
      }
      return;
    }

    const defect = defects.find((d) => d.id === defectId);
    if (!defect || defect.status === newStatus) return;

    updateDefectStatus.mutate({ id: defectId, status: newStatus });
  };

  const getDefectsByStatus = (status: string) => {
    return defects.filter((defect) => defect.status === status);
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-white";
      case "low": return "bg-green-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full overflow-x-auto pb-4">
          {statusOptions.map((status) => {
            const statusDefects = getDefectsByStatus(status.key);
            
            return (
              <div
                key={status.key}
                className="flex-shrink-0 w-72 flex flex-col"
                data-testid={`column-${status.key}`}
              >
                {/* Column Header */}
                <div 
                  className="flex items-center justify-between px-3 py-2 bg-muted rounded-t-md border-b"
                  style={{ borderBottomColor: `#${status.color || '6B7280'}` }}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: `#${status.color || '6B7280'}` }}
                    />
                    <h3 className="font-medium text-sm" data-testid={`column-title-${status.key}`}>
                      {status.name}
                    </h3>
                  </div>
                  <Badge
                    variant="secondary"
                    className="h-5 min-w-[20px] px-1.5 text-[10px] rounded-full"
                    data-testid={`count-${status.key}`}
                  >
                    {statusDefects.length}
                  </Badge>
                </div>

                {/* Column Body */}
                <DroppableColumn id={status.key}>
                  <SortableContext
                    id={status.key}
                    items={statusDefects.map((d) => d.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-2 p-2 bg-muted/30 rounded-b-md min-h-[200px]">
                      {statusDefects.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-xs text-muted-foreground border-2 border-dashed border-muted rounded-md">
                          Drop defects here
                        </div>
                      ) : (
                        statusDefects.map((defect) => (
                          <DefectCard
                            key={defect.id}
                            defect={defect}
                            onEdit={setEditingDefect}
                            onDelete={setDeletingDefect}
                            priorityOptions={priorityOptions}
                            typeOptions={typeOptions}
                          />
                        ))
                      )}
                    </div>
                  </SortableContext>
                </DroppableColumn>
              </div>
            );
          })}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeDefect && (
            <Card className="p-3 w-72 shadow-xl ring-2 ring-[#bba7db] bg-card">
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm line-clamp-2">
                    {activeDefect.title}
                  </h4>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <Badge 
                  className={`h-5 text-[10px] px-1.5 ${getPriorityColor(activeDefect.priority)}`}
                >
                  {priorityOptions.find(o => o.key === activeDefect.priority)?.name || activeDefect.priority}
                </Badge>
                <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
                  {typeOptions.find(o => o.key === activeDefect.type)?.name || activeDefect.type}
                </Badge>
              </div>
              {activeDefect.location && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{activeDefect.location}</span>
                </div>
              )}
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      <DefectFormDialog
        open={!!editingDefect}
        onOpenChange={(open) => !open && setEditingDefect(null)}
        defect={editingDefect || undefined}
      />

      <AlertDialog
        open={!!deletingDefect}
        onOpenChange={(open) => !open && setDeletingDefect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Defect</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDefect?.title}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDefect && deleteDefect.mutate(deletingDefect.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
