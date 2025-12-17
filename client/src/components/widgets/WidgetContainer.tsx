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

// Resize overlay that shows during drag
function ResizeOverlay({ 
  columns, 
  height,
  visible 
}: { 
  columns: number; 
  height: number;
  visible: boolean;
}) {
  if (!visible) return null;
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{ cursor: 'se-resize' }}
    >
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md shadow-lg text-sm font-medium">
        {columns} col × {Math.round(height)}px
      </div>
    </div>
  );
}

// Resize handle component
function ResizeHandle({ 
  onResize, 
  onResizeStart, 
  onResizeEnd 
}: { 
  onResize: (width: number, height: number, columns: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (width: number, height: number) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const [previewColumns, setPreviewColumns] = useState(4);
  const [previewHeight, setPreviewHeight] = useState(200);
  const startPosRef = useRef<{ x: number; y: number; width: number; height: number; columnWidth: number; gap: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drag from starting
    e.preventDefault();
    
    const parentCard = (e.target as HTMLElement).closest('[data-testid^="widget-"]') as HTMLElement;
    if (!parentCard) return;

    // Find the grid container to calculate column widths
    const gridContainer = parentCard.closest('.grid') as HTMLElement;
    if (!gridContainer) {
      console.warn('No grid container found - resize disabled');
      return;
    }

    const rect = parentCard.getBoundingClientRect();
    const containerRect = gridContainer.getBoundingClientRect();
    const gap = 16; // gap-4 = 1rem = 16px
    
    // Calculate column width based on 8-column grid
    // Container width minus gaps between 8 columns (7 gaps)
    const columnWidth = (containerRect.width - (7 * gap)) / 8;
    
    // Calculate initial columns from current width
    const initialColumns = Math.round((rect.width + gap) / (columnWidth + gap));
    setPreviewColumns(Math.max(1, Math.min(8, initialColumns)));
    setPreviewHeight(rect.height);
    
    setIsResizing(true);
    onResizeStart();
    
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      columnWidth,
      gap,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!startPosRef.current) return;
      
      const { columnWidth, gap } = startPosRef.current;
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      
      // Calculate target width
      const targetWidth = startPosRef.current.width + deltaX;
      
      // Snap to column boundaries (1-8 columns)
      // Calculate how many columns this width represents
      const columns = Math.round((targetWidth + gap) / (columnWidth + gap));
      const snappedColumns = Math.max(1, Math.min(8, columns));
      
      // Calculate snapped width: (columns * columnWidth) + ((columns - 1) * gap)
      const snappedWidth = (snappedColumns * columnWidth) + ((snappedColumns - 1) * gap);
      
      const newHeight = Math.max(150, startPosRef.current.height + deltaY);
      
      setPreviewColumns(snappedColumns);
      setPreviewHeight(newHeight);
      onResize(snappedWidth, newHeight, snappedColumns);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsResizing(false);
      
      // Calculate final snapped dimensions at mouseup
      if (startPosRef.current) {
        const { columnWidth, gap } = startPosRef.current;
        const deltaX = e.clientX - startPosRef.current.x;
        const deltaY = e.clientY - startPosRef.current.y;
        
        const targetWidth = startPosRef.current.width + deltaX;
        const columns = Math.round((targetWidth + gap) / (columnWidth + gap));
        const snappedColumns = Math.max(1, Math.min(8, columns));
        const finalHeight = Math.max(150, startPosRef.current.height + deltaY);
        
        console.log(`Resize complete - snapped to ${snappedColumns} columns`);
        onResizeEnd(snappedColumns, finalHeight);
      }
      
      startPosRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, onResizeStart, onResizeEnd]);

  return (
    <>
      <ResizeOverlay columns={previewColumns} height={previewHeight} visible={isResizing} />
      <div
        ref={elementRef}
        className={`absolute bottom-0 right-0 w-5 h-5 cursor-se-resize group ${
          isResizing ? 'bg-primary/30' : 'hover:bg-primary/10'
        }`}
        onMouseDown={handleMouseDown}
        data-testid="resize-handle"
      >
        <div className={`absolute bottom-1 right-1 w-2.5 h-2.5 border-r-2 border-b-2 transition-colors ${
          isResizing ? 'border-primary' : 'border-muted-foreground/50 group-hover:border-primary'
        }`} />
      </div>
    </>
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
    sm: "col-span-2 md:col-span-2 lg:col-span-2",  // 100% mobile, 50% tablet, 25% desktop
    md: "col-span-2 md:col-span-4 lg:col-span-4",  // 100% mobile, 100% tablet, 50% desktop
    lg: "col-span-2 md:col-span-4 lg:col-span-6",  // 100% mobile, 100% tablet, 75% desktop
    xl: "col-span-2 md:col-span-4 lg:col-span-8",  // 100% mobile, 100% tablet, 100% desktop
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

  const handleResize = useCallback((width: number, height: number, columns: number) => {
    setCurrentDimensions({ width, height, columns });
  }, []);

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback((columns: number, height: number) => {
    setIsResizing(false);
    console.log(`Widget ${widget.id} resize ended. Snapped to ${columns} columns, height: ${height}px`);
    if (columns && height && onUpdate) {
      const finalDimensions = { columns, height };
      setCurrentDimensions(finalDimensions);
      const updatedWidget = {
        ...widget,
        dimensions: finalDimensions,
      };
      console.log(`Calling onUpdate for widget ${widget.id} with dimensions:`, updatedWidget.dimensions);
      onUpdate(updatedWidget);
    } else {
      console.log(`No update - columns: ${columns}, height: ${height}, onUpdate: ${!!onUpdate}`);
    }
  }, [onUpdate, widget]);

  // Calculate column span class or pixel width based on dimensions
  const getWidthStyle = () => {
    if (!currentDimensions) return undefined;
    
    // If we have a column count, let the grid handle it via class
    if (currentDimensions.columns) {
      return undefined; // Grid col-span will handle it
    }
    
    // Otherwise use pixel width if available
    if (currentDimensions.width) {
      return `${currentDimensions.width}px`;
    }
    
    return undefined;
  };

  const getColSpanClass = () => {
    if (!currentDimensions?.columns) return '';
    
    // Map columns (1-8) to Tailwind col-span classes
    // All responsive to maintain grid alignment
    const colSpanMap: Record<number, string> = {
      1: 'col-span-1',
      2: 'col-span-2', 
      3: 'col-span-3',
      4: 'col-span-4',
      5: 'col-span-5',
      6: 'col-span-6',
      7: 'col-span-7',
      8: 'col-span-8',
    };
    
    return colSpanMap[currentDimensions.columns] || '';
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? 'none' : transition,
    width: getWidthStyle(),
    height: currentDimensions?.height ? `${currentDimensions.height}px` : undefined,
  };

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      className={`relative flex h-full flex-col ${
        currentDimensions?.columns 
          ? getColSpanClass() // Use column-based span if available
          : currentDimensions?.width 
            ? '' // No grid class if using pixel width
            : sizeClasses[widget.size] // Default size class
      } ${isConfiguring ? 'ring-2 ring-primary' : ''} ${
        isDragging ? 'opacity-50 z-50' : ''
      } ${isResizing ? 'select-none z-50' : ''}`}
      data-testid={`widget-${widget.type}-${widget.id}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div
            className="flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted"
            aria-label="Reorder widget"
            data-testid={`button-drag-handle-${widget.id}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
          <CardTitle className="text-xs font-semibold truncate">{widget.title}</CardTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onConfigure && (
              <DropdownMenuItem onClick={() => onConfigure(widget.id)}>
                <Settings className="h-3.5 w-3.5 mr-2" />
                Configure
              </DropdownMenuItem>
            )}
            {onConfigure && onRemove && <DropdownMenuSeparator />}
            {onRemove && (
              <DropdownMenuItem 
                onClick={() => onRemove(widget.id)}
                className="text-destructive"
              >
                <X className="h-3.5 w-3.5 mr-2" />
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-auto p-2 pt-0">
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