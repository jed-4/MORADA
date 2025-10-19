import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Defect } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
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

interface DefectBoardViewProps {
  defects: Defect[];
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
    const newStatus = over.id as string;

    const defect = defects.find((d) => d.id === defectId);
    if (!defect || defect.status === newStatus) return;

    updateDefectStatus.mutate({ id: defectId, status: newStatus });
  };

  const getPriorityBadge = (priority: string) => {
    const option = priorityOptions.find((o) => o.key === priority);
    if (!option) return <Badge variant="outline" className="text-xs">{priority}</Badge>;
    
    return (
      <Badge
        variant="outline"
        className="text-xs"
        style={{
          borderColor: `#${option.color || "6B7280"}`,
          color: `#${option.color || "6B7280"}`,
        }}
      >
        {option.name}
      </Badge>
    );
  };

  const getTypeLabel = (type: string) => {
    const option = typeOptions.find((o) => o.key === type);
    return option?.name || type;
  };

  const getDefectsByStatus = (status: string) => {
    return defects.filter((defect) => defect.status === status);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full overflow-x-auto">
          {statusOptions.map((status) => {
            const statusDefects = getDefectsByStatus(status.key);
            
            return (
              <div
                key={status.key}
                className="flex-shrink-0 w-80 flex flex-col"
                data-testid={`column-${status.key}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{status.name}</h3>
                    <Badge
                      variant="secondary"
                      className="rounded-full"
                      data-testid={`count-${status.key}`}
                    >
                      {statusDefects.length}
                    </Badge>
                  </div>
                </div>

                <SortableContext
                  id={status.key}
                  items={statusDefects.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    className="flex-1 space-y-2 overflow-y-auto"
                    style={{ minHeight: "200px" }}
                  >
                    {statusDefects.map((defect) => (
                      <Card
                        key={defect.id}
                        className="p-3 cursor-pointer hover-elevate"
                        data-testid={`card-defect-${defect.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm mb-1" data-testid={`text-title-${defect.id}`}>
                              {defect.title}
                            </h4>
                            <div className="flex items-center gap-2">
                              {getPriorityBadge(defect.priority)}
                              <span className="text-xs text-muted-foreground">
                                {getTypeLabel(defect.type)}
                              </span>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`button-menu-${defect.id}`}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setEditingDefect(defect)}
                                data-testid={`menu-item-edit-${defect.id}`}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingDefect(defect)}
                                className="text-destructive"
                                data-testid={`menu-item-delete-${defect.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {defect.location && (
                          <p className="text-xs text-muted-foreground mb-2" data-testid={`text-location-${defect.id}`}>
                            📍 {defect.location}
                          </p>
                        )}

                        {defect.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {defect.description}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {activeDefect && (
            <Card className="p-3 w-80 opacity-90">
              <h4 className="font-medium text-sm mb-1">{activeDefect.title}</h4>
              <div className="flex items-center gap-2">
                {getPriorityBadge(activeDefect.priority)}
                <span className="text-xs text-muted-foreground">
                  {getTypeLabel(activeDefect.type)}
                </span>
              </div>
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
