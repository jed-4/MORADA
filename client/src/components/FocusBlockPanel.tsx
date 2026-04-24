import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateNotionColors } from "@/lib/taskColors";
import { X, Edit2, Trash2, Clock, CalendarDays, Pin, PinOff, Plus, Search } from "lucide-react";
import type { FocusBlock, Task } from "@shared/schema";
import { FocusBlockCreator } from "./FocusBlockCreator";

interface FocusBlockPanelProps {
  block: FocusBlock;
  onClose: () => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#22c55e",
};

function getPriorityLabel(priority: string | null | undefined): string {
  if (!priority) return "—";
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function FocusBlockPanel({ block, onClose }: FocusBlockPanelProps) {
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [showTaskSearch, setShowTaskSearch] = useState(false);

  // Fetch the live block data so pinnedTaskIds stays fresh after mutations
  const { data: liveBlock } = useQuery<FocusBlock>({
    queryKey: ["/api/focus-blocks", block.id],
    queryFn: () => apiRequest(`/api/focus-blocks/${block.id}`, "GET"),
    staleTime: 0,
  });
  const currentBlock = liveBlock || block;

  const colors = generateNotionColors(currentBlock.color);

  const { data: blockTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/focus-blocks", block.id, "tasks"],
    queryFn: () => apiRequest(`/api/focus-blocks/${block.id}/tasks?limit=50`, "GET"),
  });

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    staleTime: 30 * 1000,
    enabled: showTaskSearch,
  });

  const pinnedTaskIds = new Set((currentBlock.pinnedTaskIds as string[]) || []);

  const filteredSearchTasks = taskSearch.trim().length > 0
    ? allTasks.filter(t =>
        t.title.toLowerCase().includes(taskSearch.toLowerCase()) &&
        !pinnedTaskIds.has(t.id)
      ).slice(0, 8)
    : [];

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/api/focus-blocks/${block.id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks"] });
      toast({ title: "Focus block deleted" });
      onClose();
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const updatePinnedMutation = useMutation({
    mutationFn: (newPinned: string[]) =>
      apiRequest(`/api/focus-blocks/${block.id}`, "PATCH", { pinnedTaskIds: newPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks", block.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks", block.id, "tasks"] });
    },
  });

  const togglePin = (taskId: string) => {
    const current = (currentBlock.pinnedTaskIds as string[]) || [];
    const newPinned = current.includes(taskId)
      ? current.filter(id => id !== taskId)
      : [...current, taskId];
    updatePinnedMutation.mutate(newPinned);
  };

  const addTask = (taskId: string) => {
    const current = (currentBlock.pinnedTaskIds as string[]) || [];
    if (!current.includes(taskId)) {
      updatePinnedMutation.mutate([...current, taskId]);
    }
    setTaskSearch("");
  };

  const recurrenceLabel = currentBlock.isRecurring
    ? `Every ${((currentBlock.daysOfWeek as number[]) || []).sort().map(d => DAY_LABELS[d]).join(", ")}`
    : currentBlock.specificDate
    ? new Date(currentBlock.specificDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "One-off";

  return (
    <>
      <div className="flex flex-col h-full">
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderLeftColor: currentBlock.color, borderLeftWidth: 4 }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: currentBlock.color }}
            />
            <h2 className="text-sm font-semibold truncate">{currentBlock.title}</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setShowEdit(true)}>
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{currentBlock.startTime} – {currentBlock.endTime}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{recurrenceLabel}</span>
            </div>
            {currentBlock.categoryType === "project" && (
              <div className="text-xs text-muted-foreground">
                Linked to project
              </div>
            )}
            {currentBlock.categoryType === "business" && (
              <div className="text-xs text-muted-foreground">
                Business tasks
              </div>
            )}
            {currentBlock.categoryType === "tag" && currentBlock.categoryId && (
              <div className="text-xs text-muted-foreground">
                Tag: {currentBlock.categoryId}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                Tasks
              </h3>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5"
                title="Add task manually"
                onClick={() => setShowTaskSearch(s => !s)}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            {showTaskSearch && (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                <Input
                  autoFocus
                  className="pl-6 h-7 text-xs"
                  placeholder="Search tasks to add..."
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                />
                {filteredSearchTasks.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-md overflow-hidden">
                    {filteredSearchTasks.map(t => (
                      <button
                        key={t.id}
                        className="w-full text-left px-2 py-1.5 text-xs hover-elevate truncate"
                        onClick={() => { addTask(t.id); setShowTaskSearch(false); }}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tasksLoading ? (
              <div className="text-xs text-muted-foreground">Loading tasks...</div>
            ) : blockTasks.length === 0 ? (
              <div className="text-xs text-muted-foreground">No matching unscheduled tasks. Add tasks manually using the + button above.</div>
            ) : (
              <div className="space-y-1">
                {blockTasks.map((task) => {
                  const taskColors = generateNotionColors(task.color || "#6366f1");
                  const isPinned = pinnedTaskIds.has(task.id);
                  const priorityColor = PRIORITY_COLORS[task.priority || ""] || "#6b7280";
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md border"
                      style={{ backgroundColor: taskColors.pastelBg }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: priorityColor }}
                        title={getPriorityLabel(task.priority)}
                      />
                      <span
                        className="text-xs flex-1 truncate font-medium"
                        style={{ color: taskColors.darkText }}
                      >
                        {task.title}
                      </span>
                      {isPinned && (
                        <span className="text-label text-muted-foreground">pinned</span>
                      )}
                      <button
                        onClick={() => togglePin(task.id)}
                        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                        title={isPinned ? "Remove from block (unpin)" : "Pin to always include in this block"}
                      >
                        {isPinned ? (
                          <PinOff className="w-3 h-3" style={{ color: taskColors.darkText }} />
                        ) : (
                          <Pin className="w-3 h-3" style={{ color: taskColors.darkText }} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <FocusBlockCreator
        open={showEdit}
        onOpenChange={setShowEdit}
        editBlock={currentBlock}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/focus-blocks", block.id] });
        }}
      />
    </>
  );
}
