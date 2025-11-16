import { useState, useRef, useEffect } from "react";
import { X, Check } from "lucide-react";

export interface CasvaTaskCreateRowProps {
  onSave: (title: string) => void;
  onCancel?: () => void;
  showCheckbox?: boolean;
}

export function CasvaTaskCreateRow({ 
  onSave, 
  onCancel,
  showCheckbox = false
}: CasvaTaskCreateRowProps) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && title.trim()) {
      onSave(title.trim());
      setTitle("");
    } else if (e.key === "Escape") {
      onCancel?.();
    }
  };

  const handleSave = () => {
    if (title.trim()) {
      onSave(title.trim());
      setTitle("");
    }
  };

  return (
    <div 
      className="flex items-center gap-3 h-9 px-2 border-t border-border bg-white"
      data-testid="task-create-row"
    >
      {/* Drag Handle Placeholder */}
      <div className="w-4 flex-shrink-0"></div>

      {/* Checkbox Placeholder */}
      {showCheckbox && <div className="w-5 flex-shrink-0"></div>}

      {/* Title Input - Flex grow to take remaining space */}
      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Task name"
          className="w-full text-sm font-semibold bg-transparent border-none outline-none focus:ring-0 p-0"
          data-testid="input-task-title"
        />
      </div>

      {/* Assignee Placeholder */}
      <div className="flex-shrink-0 w-32"></div>

      {/* Due Date Placeholder */}
      <div className="flex-shrink-0 w-28"></div>

      {/* Status Placeholder */}
      <div className="flex-shrink-0 w-20"></div>

      {/* Priority Placeholder */}
      <div className="flex-shrink-0 w-20"></div>

      {/* Action Buttons */}
      <div className="flex-shrink-0 flex items-center gap-1">
        <button
          onClick={handleSave}
          disabled={!title.trim()}
          className="h-6 w-6 rounded-md border border-border hover-elevate active-elevate-2 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-save-task"
        >
          <Check className="h-4 w-4 text-green-600" />
        </button>
        <button
          onClick={onCancel}
          className="h-6 w-6 rounded-md border border-border hover-elevate active-elevate-2 flex items-center justify-center"
          data-testid="button-cancel-task"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}
