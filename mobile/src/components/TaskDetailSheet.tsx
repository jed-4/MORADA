import { BottomSheet } from "./BottomSheet";
import { MobileInput } from "./ui/MobileInput";
import { MobileTextarea } from "./ui/MobileTextarea";
import { MobileButton } from "./ui/MobileButton";
import { X, Calendar, User } from "lucide-react";
import type { Task } from "@shared/schema";
import { useState, useEffect } from "react";

interface TaskDetailSheetProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
}

export function TaskDetailSheet({ task, isOpen, onClose, onSave }: TaskDetailSheetProps) {
  const [title, setTitle] = useState(task?.title || "");
  const [content, setContent] = useState(task?.content || "");
  const [status, setStatus] = useState(task?.status || "todo");
  const [priority, setPriority] = useState(task?.priority || "medium");

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setContent(task.content || "");
      setStatus(task.status);
      setPriority(task.priority || "medium");
    }
  }, [task]);

  const handleSave = () => {
    onSave({
      ...task,
      title,
      content,
      status,
      priority,
    });
    onClose();
  };

  if (!task) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Task Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-close-task-detail"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <MobileInput
            label="Task Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter task title"
            data-testid="input-task-title"
          />

          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <div className="flex gap-2">
              {[
                { value: "todo", label: "To Do" },
                { value: "in-progress", label: "In Progress" },
                { value: "done", label: "Done" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={`flex-1 h-9 rounded-md text-sm font-medium ${
                    status === s.value
                      ? "bg-[#bba7db] text-white"
                      : "border hover-elevate"
                  }`}
                  data-testid={`button-status-${s.value}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Priority</label>
            <div className="flex gap-2">
              {[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 h-9 rounded-md text-sm font-medium ${
                    priority === p.value
                      ? p.value === "high" ? "bg-destructive text-destructive-foreground" :
                        p.value === "medium" ? "bg-primary text-primary-foreground" :
                        "bg-muted text-muted-foreground"
                      : "border hover-elevate"
                  }`}
                  data-testid={`button-priority-${p.value}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <MobileTextarea
            label="Description"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add task description..."
            rows={4}
            data-testid="textarea-task-content"
          />

          <div className="border-t pt-4 mt-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <span className="text-muted-foreground">Due Date:</span>
                <span className="font-medium">
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "Not set"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <User className="w-5 h-5 text-muted-foreground" />
                <span className="text-muted-foreground">Assigned to:</span>
                <span className="font-medium">{task.assigneeName || "Unassigned"}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <MobileButton
              variant="outline"
              onClick={onClose}
              className="flex-1"
              data-testid="button-cancel"
            >
              Cancel
            </MobileButton>
            <MobileButton
              onClick={handleSave}
              className="flex-1"
              data-testid="button-save-task"
            >
              Save Changes
            </MobileButton>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
