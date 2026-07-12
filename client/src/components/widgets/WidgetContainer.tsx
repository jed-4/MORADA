import { Button } from "@/components/ui/button";
import { MoreVertical, X, Settings, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Widget } from "@/types/widgets";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { getWidgetDefinition } from "./WidgetRegistry";
import { cn } from "@/lib/utils";

interface WidgetContainerProps {
  widget: Widget;
  children: React.ReactNode;
  onUpdate?: (widget: Widget) => void;
  onRemove?: (widgetId: string) => void;
  onConfigure?: (widgetId: string) => void;
  isConfiguring?: boolean;
  headerActions?: ReactNode;
}

// Resize overlay that shows during drag
function ResizeOverlay({
  columns,
  height,
  visible,
}: {
  columns: number;
  height: number;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100]" style={{ cursor: "se-resize" }}>
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
  onResizeEnd,
}: {
  onResize: (width: number, height: number, columns: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (columns: number, height: number) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const [previewColumns, setPreviewColumns] = useState(4);
  const [previewHeight, setPreviewHeight] = useState(200);
  const startPosRef = useRef<{ x: number; y: number; width: number; height: number; columnWidth: number; gap: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const parentCard = (e.target as HTMLElement).closest('[data-testid^="widget-"]') as HTMLElement;
      if (!parentCard) return;

      const gridContainer = parentCard.closest(".grid") as HTMLElement;
      if (!gridContainer) {
        console.warn("No grid container found - resize disabled");
        return;
      }

      const rect = parentCard.getBoundingClientRect();
      const containerRect = gridContainer.getBoundingClientRect();
      const gap = 16;
      const columnWidth = (containerRect.width - 7 * gap) / 8;

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
        const targetWidth = startPosRef.current.width + deltaX;
        const columns = Math.round((targetWidth + gap) / (columnWidth + gap));
        const snappedColumns = Math.max(1, Math.min(8, columns));
        const snappedWidth = snappedColumns * columnWidth + (snappedColumns - 1) * gap;
        const newHeight = Math.max(150, startPosRef.current.height + deltaY);

        setPreviewColumns(snappedColumns);
        setPreviewHeight(newHeight);
        onResize(snappedWidth, newHeight, snappedColumns);
      };

      const handleMouseUp = (e: MouseEvent) => {
        setIsResizing(false);
        if (startPosRef.current) {
          const { columnWidth, gap } = startPosRef.current;
          const deltaX = e.clientX - startPosRef.current.x;
          const deltaY = e.clientY - startPosRef.current.y;
          const targetWidth = startPosRef.current.width + deltaX;
          const columns = Math.round((targetWidth + gap) / (columnWidth + gap));
          const snappedColumns = Math.max(1, Math.min(8, columns));
          const finalHeight = Math.max(150, startPosRef.current.height + deltaY);
          onResizeEnd(snappedColumns, finalHeight);
        }
        startPosRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onResize, onResizeStart, onResizeEnd],
  );

  return (
    <>
      <ResizeOverlay columns={previewColumns} height={previewHeight} visible={isResizing} />
      <div
        className={cn(
          "absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize opacity-0 transition-opacity group-hover:opacity-100",
          isResizing ? "bg-primary/30 opacity-100" : "hover:bg-primary/10",
        )}
        onMouseDown={handleMouseDown}
        data-testid="resize-handle"
      >
        <div
          className={cn(
            "absolute bottom-1 right-1 h-2.5 w-2.5 border-r-2 border-b-2 transition-colors",
            isResizing ? "border-primary" : "border-muted-foreground/50",
          )}
        />
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
  headerActions,
}: WidgetContainerProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [currentDimensions, setCurrentDimensions] = useState(widget.dimensions);

  useEffect(() => {
    setCurrentDimensions(widget.dimensions);
  }, [widget.dimensions]);

  const definition = getWidgetDefinition(widget.type);
  const accent = definition?.accent ?? "purple";

  const sizeClasses = {
    sm: "col-span-2 md:col-span-2 lg:col-span-2",
    md: "col-span-2 md:col-span-4 lg:col-span-4",
    lg: "col-span-2 md:col-span-4 lg:col-span-6",
    xl: "col-span-2 md:col-span-4 lg:col-span-8",
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: isResizing,
  });

  const handleResize = useCallback((width: number, height: number, _columns: number) => {
    setCurrentDimensions({ width, height });
  }, []);

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback(
    (columns: number, height: number) => {
      setIsResizing(false);
      if (columns && height && onUpdate) {
        const finalDimensions = { columns, height };
        setCurrentDimensions(finalDimensions);
        onUpdate({ ...widget, dimensions: finalDimensions });
      }
    },
    [onUpdate, widget],
  );

  const getWidthStyle = () => {
    if (!currentDimensions) return undefined;
    if (currentDimensions.columns) return undefined;
    if (currentDimensions.width) return `${currentDimensions.width}px`;
    return undefined;
  };

  const getColSpanClass = () => {
    if (!currentDimensions?.columns) return "";
    const colSpanMap: Record<number, string> = {
      1: "col-span-1",
      2: "col-span-2",
      3: "col-span-3",
      4: "col-span-4",
      5: "col-span-5",
      6: "col-span-6",
      7: "col-span-7",
      8: "col-span-8",
    };
    return colSpanMap[currentDimensions.columns] || "";
  };

  const DEFAULT_WIDGET_HEIGHT = 280;
  const heightValue = currentDimensions?.height || DEFAULT_WIDGET_HEIGHT;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? "none" : transition,
    width: getWidthStyle(),
    height: `${heightValue}px`,
  };

  const headerLeft = (
    <div
      className="cursor-grab rounded p-0.5 flex-shrink-0 text-muted-foreground hover:bg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity -ml-1 active:cursor-grabbing"
      data-testid={`button-drag-handle-${widget.id}`}
      aria-label="Reorder widget"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </div>
  );

  const hasMenu = !!onConfigure || !!onRemove;
  const menuNode = hasMenu ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          data-testid={`widget-menu-trigger-${widget.id}`}
        >
          <MoreVertical className="h-3.5 w-3.5" />
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
          <DropdownMenuItem onClick={() => onRemove(widget.id)} className="text-destructive">
            <X className="h-3.5 w-3.5 mr-2" />
            Remove
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const headerRight = (headerActions || menuNode) ? (
    <>
      {headerActions}
      {menuNode}
    </>
  ) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative",
        currentDimensions?.columns
          ? getColSpanClass()
          : currentDimensions?.width
            ? ""
            : sizeClasses[widget.size],
        isConfiguring && "ring-2 ring-primary rounded-md",
        isDragging && "opacity-50 z-50",
        isResizing && "select-none z-50",
      )}
      data-testid={`widget-${widget.type}-${widget.id}`}
    >
      <WidgetCard
        title={widget.type === "programme" && /programme/i.test(widget.title) ? "Schedule" : widget.title}
        accent={accent}
        headerLeft={headerLeft}
        headerRight={headerRight}
        className="h-full"
      >
        {children}
      </WidgetCard>

      <ResizeHandle
        onResize={handleResize}
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
      />
    </div>
  );
}
