import { useState } from "react";
import { Plus, X, ClipboardList, StickyNote, CheckSquare, FileText } from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

interface MobileFABProps {
  actions: QuickAction[];
}

export function MobileFAB({ actions }: MobileFABProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
          data-testid="fab-backdrop"
        />
      )}

      {/* Quick Action Menu */}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-2">
        {isOpen && actions.map((action, index) => (
          <button
            key={action.id}
            onClick={() => {
              action.onClick();
              setIsOpen(false);
            }}
            className="flex items-center gap-3 bg-card border shadow-lg rounded-full pr-4 pl-3 py-2 animate-in slide-in-from-bottom-2 fade-in duration-150"
            style={{ animationDelay: `${index * 50}ms` }}
            data-testid={`fab-action-${action.id}`}
          >
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <action.icon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium whitespace-nowrap">{action.label}</span>
          </button>
        ))}

        {/* Main FAB Button */}
        <button
          onClick={toggleOpen}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
            isOpen
              ? "bg-muted-foreground rotate-45"
              : "bg-primary"
          }`}
          data-testid="fab-main-button"
        >
          {isOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <Plus className="w-6 h-6 text-primary-foreground" />
          )}
        </button>
      </div>
    </>
  );
}

// Default quick actions factory for common use cases
export function useDefaultQuickActions(callbacks: {
  onCreateTask?: () => void;
  onCreateSiteDiary?: () => void;
  onCreateNote?: () => void;
  onCreateMemo?: () => void;
}): QuickAction[] {
  const actions: QuickAction[] = [];

  if (callbacks.onCreateTask) {
    actions.push({
      id: "task",
      label: "New Task",
      icon: CheckSquare,
      onClick: callbacks.onCreateTask,
    });
  }

  if (callbacks.onCreateSiteDiary) {
    actions.push({
      id: "site-diary",
      label: "Site Diary Entry",
      icon: ClipboardList,
      onClick: callbacks.onCreateSiteDiary,
    });
  }

  if (callbacks.onCreateNote) {
    actions.push({
      id: "note",
      label: "New Note",
      icon: FileText,
      onClick: callbacks.onCreateNote,
    });
  }

  if (callbacks.onCreateMemo) {
    actions.push({
      id: "memo",
      label: "Quick Memo",
      icon: StickyNote,
      onClick: callbacks.onCreateMemo,
    });
  }

  return actions;
}
