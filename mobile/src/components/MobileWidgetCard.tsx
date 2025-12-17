import { ReactNode } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface MobileWidgetCardProps {
  id: string;
  title: string;
  icon: ReactNode;
  summary?: string | number;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  isDragging?: boolean;
}

export function MobileWidgetCard({
  id,
  title,
  icon,
  summary,
  isExpanded,
  onToggle,
  children,
  isDragging = false,
}: MobileWidgetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card rounded-xl border overflow-hidden transition-shadow ${
        isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
      }`}
      data-testid={`widget-card-${id}`}
    >
      <div className="flex items-center">
        <button
          className="p-3 touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          data-testid={`widget-drag-handle-${id}`}
        >
          <GripVertical className="w-5 h-5" />
        </button>
        
        <button
          onClick={onToggle}
          className="flex-1 flex items-center justify-between py-3 pr-4 text-left"
          data-testid={`widget-toggle-${id}`}
        >
          <div className="flex items-center gap-3">
            <div className="text-primary">{icon}</div>
            <div>
              <div className="font-semibold text-sm">{title}</div>
              {!isExpanded && summary !== undefined && (
                <div className="text-xs text-muted-foreground">{summary}</div>
              )}
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
      
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 pt-1 border-t">
          {children}
        </div>
      </div>
    </div>
  );
}

export type WidgetConfig = {
  id: string;
  title: string;
  icon: ReactNode;
  getSummary: (data: any) => string | number;
  component: ReactNode;
};
