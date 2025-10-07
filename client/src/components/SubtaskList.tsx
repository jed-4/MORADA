import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask } from "@/hooks/useSubtasks";
import { Task, InsertTask } from "@shared/schema";

interface SubtaskListProps {
  parentTask: Task;
  compact?: boolean; // For use in TaskCard vs expanded view
}

export default function SubtaskList({ parentTask, compact = false }: SubtaskListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const { toast } = useToast();

  const { data: subtasks = [], isLoading } = useSubtasks(parentTask.id);
  const createSubtaskMutation = useCreateSubtask();
  const updateSubtaskMutation = useUpdateSubtask();
  const deleteSubtaskMutation = useDeleteSubtask();

  const completedCount = subtasks.filter(subtask => subtask.status === "done").length;
  const totalCount = subtasks.length;

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;

    const newSubtask: InsertTask = {
      title: newSubtaskTitle.trim(),
      content: "",
      type: "task" as const,
      status: "todo" as const,
      projectId: parentTask.projectId || "default", // Inherit parent's project or use default
      priority: "medium" as const,
      tags: [],
    };

    try {
      await createSubtaskMutation.mutateAsync({
        parentTaskId: parentTask.id,
        subtask: newSubtask,
      });

      setNewSubtaskTitle("");
      setIsAdding(false);
      toast({ title: "Subtask created successfully" });
    } catch (error) {
      toast({
        title: "Failed to create subtask",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleToggleSubtask = async (subtask: Task) => {
    const newStatus = subtask.status === "done" ? "todo" : "done";
    
    try {
      await updateSubtaskMutation.mutateAsync({
        taskId: subtask.id,
        updates: { status: newStatus },
      });
    } catch (error) {
      toast({
        title: "Failed to update subtask",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSubtask = async (subtask: Task) => {
    try {
      await deleteSubtaskMutation.mutateAsync({ 
        taskId: subtask.id, 
        parentTaskId: parentTask.id,
        task: subtask
      });
      toast({ title: "Subtask deleted successfully" });
    } catch (error) {
      toast({
        title: "Failed to delete subtask",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Always show the subtask interface, even in compact mode when there are no subtasks
  // This allows users to add their first subtask

  return (
    <div className="space-y-2" data-testid={`subtasks-${parentTask.id}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 p-0 flex items-center gap-1 text-muted-foreground hover:text-foreground"
              data-testid={`button-toggle-subtasks-${parentTask.id}`}
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span className="text-xs">
                Subtasks {totalCount > 0 && `(${completedCount}/${totalCount})`}
              </span>
              {totalCount > 0 && (
                <Badge variant="secondary" className="text-xs h-4 px-1">
                  {completedCount}/{totalCount}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="h-6 w-6 p-0"
            data-testid={`button-add-subtask-${parentTask.id}`}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        <CollapsibleContent className="space-y-1">
          {isLoading && (
            <div className="text-xs text-muted-foreground pl-4">Loading subtasks...</div>
          )}

          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="flex items-center gap-2 pl-4 py-1 group"
              data-testid={`subtask-${subtask.id}`}
            >
              <Checkbox
                checked={subtask.status === "done"}
                onCheckedChange={() => handleToggleSubtask(subtask)}
                data-testid={`checkbox-subtask-${subtask.id}`}
              />
              <span
                className={`flex-1 text-xs ${
                  subtask.status === "done"
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {subtask.title}
              </span>
              
              {!compact && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-subtask-menu-${subtask.id}`}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleDeleteSubtask(subtask)}
                      className="text-destructive"
                      data-testid={`button-delete-subtask-${subtask.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}

          {isAdding && (
            <div className="flex items-center gap-2 pl-4 py-1">
              <Input
                placeholder="Enter subtask title..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddSubtask();
                  } else if (e.key === "Escape") {
                    setIsAdding(false);
                    setNewSubtaskTitle("");
                  }
                }}
                className="h-6 text-xs"
                autoFocus
                data-testid={`input-new-subtask-${parentTask.id}`}
              />
              <Button
                size="sm"
                onClick={handleAddSubtask}
                disabled={!newSubtaskTitle.trim() || createSubtaskMutation.isPending}
                className="h-6 px-2 text-xs"
                data-testid={`button-save-subtask-${parentTask.id}`}
              >
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setNewSubtaskTitle("");
                }}
                className="h-6 px-2 text-xs"
                data-testid={`button-cancel-subtask-${parentTask.id}`}
              >
                Cancel
              </Button>
            </div>
          )}

          {!isAdding && totalCount === 0 && (
            <div className="pl-4 py-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(true)}
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                data-testid={`button-add-first-subtask-${parentTask.id}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add first subtask
              </Button>
            </div>
          )}

          {/* Allow adding additional subtasks in compact mode */}
          {!isAdding && compact && totalCount > 0 && (
            <div className="pl-4 py-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(true)}
                className="h-5 text-xs text-muted-foreground hover:text-foreground"
                data-testid={`button-add-subtask-compact-${parentTask.id}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}