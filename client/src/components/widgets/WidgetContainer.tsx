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
import { useState, useRef, useCallback, useEffect } from "react";

interface WidgetContainerProps {
  widget: Widget;
  children: React.ReactNode;
  onUpdate?: (widget: Widget) => void;
  onRemove?: (widgetId: string) => void;
  onConfigure?: (widgetId: string) => void;
  isConfiguring?: boolean;
}

// Resize handle component
function ResizeHandle({ 
  onResize, 
  onResizeStart, 
  onResizeEnd 
}: { 
  onResize: (width: number, height: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (width: number, height: number) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drag from starting
    e.preventDefault();
    
    const parentCard = (e.target as HTMLElement).closest('[data-testid^="widget-"]') as HTMLElement;
    if (!parentCard) return;

    const rect = parentCard.getBoundingClientRect();
    setIsResizing(true);
    onResizeStart();
    
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!startPosRef.current) return;
      
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      
      const newWidth = Math.max(200, startPosRef.current.width + deltaX);
      const newHeight = Math.max(150, startPosRef.current.height + deltaY);
      
      onResize(newWidth, newHeight);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsResizing(false);
      
      // Calculate final dimensions at mouseup to avoid stale closure
      if (startPosRef.current) {
        const parentCard = (e.target as HTMLElement).closest('[data-testid^="widget-"]') as HTMLElement;
        if (parentCard) {
          const rect = parentCard.getBoundingClientRect();
          console.log(`ResizeHandle mouseup - final dimensions: ${rect.width}x${rect.height}`);
          onResizeEnd(rect.width, rect.height);
        } else {
          console.log('ResizeHandle mouseup - no parent card found');
        }
      }
      
      startPosRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, onResizeStart, onResizeEnd]);

  return (
    <div
      ref={elementRef}
      className={`absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group ${
        isResizing ? 'bg-primary/20' : 'hover:bg-primary/10'
      }`}
      onMouseDown={handleMouseDown}
      data-testid="resize-handle"
    >
      <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground/50 group-hover:border-primary" />
    </div>
  );
}

export default function WidgetContainer({
  widget,
  children,
  onUpdate,
  onRemove,
  onConfigure,
  isConfiguring = false,
}: WidgetContainerProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [currentDimensions, setCurrentDimensions] = useState(widget.dimensions);

  // Sync internal state when widget dimensions prop changes
  useEffect(() => {
    setCurrentDimensions(widget.dimensions);
  }, [widget.dimensions]);

  const sizeClasses = {
    sm: "col-span-2",
    md: "col-span-4", 
    lg: "col-span-6",
    xl: "col-span-8",
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: widget.id,
    disabled: isResizing, // Disable drag while resizing
  });

  const handleResize = useCallback((width: number, height: number) => {
    setCurrentDimensions({ width, height });
  }, []);

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback((width: number, height: number) => {
    setIsResizing(false);
    console.log(`Widget ${widget.id} resize ended. Final dimensions:`, { width, height });
    if (width && height && onUpdate) {
      const finalDimensions = { width, height };
      setCurrentDimensions(finalDimensions);
      const updatedWidget = {
        ...widget,
        dimensions: finalDimensions,
      };
      console.log(`Calling onUpdate for widget ${widget.id} with dimensions:`, updatedWidget.dimensions);
      onUpdate(updatedWidget);
    } else {
      console.log(`No update - width: ${width}, height: ${height}, onUpdate: ${!!onUpdate}`);
    }
  }, [onUpdate, widget]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? 'none' : transition,
    width: currentDimensions?.width ? `${currentDimensions.width}px` : undefined,
    height: currentDimensions?.height ? `${currentDimensions.height}px` : undefined,
  };

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      className={`relative flex h-full flex-col ${currentDimensions ? '' : sizeClasses[widget.size]} ${isConfiguring ? 'ring-2 ring-primary' : ''} ${
        isDragging ? 'opacity-50 z-50' : ''
      } ${isResizing ? 'select-none' : ''}`}
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
      <CardContent className="flex-1 min-h-0 overflow-auto">
        {children}
      </CardContent>
      
      {/* Resize handle in bottom-right corner */}
      <ResizeHandle
        onResize={handleResize}
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
      />
    </Card>
  );
}