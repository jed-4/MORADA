import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreVertical, X, Settings, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Widget, WidgetProps } from "@/types/widgets";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface WidgetContainerProps {
  widget: Widget;
  children: React.ReactNode;
  onUpdate?: (widget: Widget) => void;
  onRemove?: (widgetId: string) => void;
  onConfigure?: (widgetId: string) => void;
  isConfiguring?: boolean;
}

export default function WidgetContainer({
  widget,
  children,
  onUpdate,
  onRemove,
  onConfigure,
  isConfiguring = false,
}: WidgetContainerProps) {
  const sizeClasses = {
    sm: "col-span-1",
    md: "col-span-2", 
    lg: "col-span-3",
    xl: "col-span-4",
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      className={`${sizeClasses[widget.size]} ${isConfiguring ? 'ring-2 ring-primary' : ''} ${
        isDragging ? 'opacity-50 z-50' : ''
      }`}
      data-testid={`widget-${widget.type}-${widget.id}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 cursor-grab active:cursor-grabbing"
            aria-label="Reorder widget"
            data-testid={`button-drag-handle-${widget.id}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
          <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onConfigure && (
              <DropdownMenuItem onClick={() => onConfigure(widget.id)}>
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </DropdownMenuItem>
            )}
            {onConfigure && onRemove && <DropdownMenuSeparator />}
            {onRemove && (
              <DropdownMenuItem 
                onClick={() => onRemove(widget.id)}
                className="text-destructive"
              >
                <X className="h-4 w-4 mr-2" />
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}