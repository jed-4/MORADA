import type { ReactNode, CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { MoreVertical, X, Settings, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useRef, useCallback, useEffect } from "react";
import { WidgetCard, type WidgetAccent } from "@/components/ui/WidgetCard";
import { cn } from "@/lib/utils";

interface PersonalWidgetContainerProps {
  title: string;
  icon?: ReactNode;
  accent?: WidgetAccent;
  children: ReactNode;
  onRemove?: () => void;
  onConfigure?: () => void;
  dragHandleProps?: Record<string, unknown>;
  onResizeEnd?: (columns: number, height: number) => void;
  dimensions?: { columns?: number; height?: number };
  isResizing?: boolean;
  setIsResizing?: (value: boolean) => void;
  themeClassName?: string;
  themeStyleOverride?: CSSProperties;
  locked?: boolean;
  lockedMessage?: string;
}

function ResizeHandle({
  onResize,
  onResizeStart,
  onResizeEnd,
}: {
  onResize: (width: number, height: number) => void;
  onResizeStart: () => void;
  onResizeEnd: (columns: number, height: number) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef<{ x: number; y: number; width: number; height: number; columnWidth: number; gap: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const parentCard = (e.target as HTMLElement).closest('[data-personal-widget="true"]') as HTMLElement;
    if (!parentCard) return;

    const gridContainer = parentCard.closest('.grid') as HTMLElement;
    if (!gridContainer) return;

    const rect = parentCard.getBoundingClientRect();
    const containerRect = gridContainer.getBoundingClientRect();
    const gap = 16;
    const columnWidth = (containerRect.width - (7 * gap)) / 8;

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
      onResize(snappedWidth, newHeight);
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
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, onResizeStart, onResizeEnd]);

  return (
    <div
      className={cn(
        "absolute bottom-0 right-0 z-10 h-4 w-4 cursor-se-resize group",
        isResizing ? "bg-primary/20" : "hover:bg-primary/10",
      )}
      onMouseDown={handleMouseDown}
      data-testid="resize-handle"
    >
      <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-muted-foreground/50 group-hover:border-primary" />
    </div>
  );
}

export default function PersonalWidgetContainer({
  title,
  icon,
  accent = "purple",
  children,
  onRemove,
  onConfigure,
  dragHandleProps,
  onResizeEnd,
  dimensions,
  isResizing: externalIsResizing,
  setIsResizing: externalSetIsResizing,
  themeClassName,
  themeStyleOverride,
  locked,
  lockedMessage,
}: PersonalWidgetContainerProps) {
  const [currentDimensions, setCurrentDimensions] = useState(dimensions);

  useEffect(() => {
    setCurrentDimensions(dimensions);
  }, [dimensions]);

  const handleResize = useCallback((width: number, height: number) => {
    setCurrentDimensions(prev => ({ ...prev, width, height }));
  }, []);

  const handleResizeStart = useCallback(() => {
    externalSetIsResizing?.(true);
  }, [externalSetIsResizing]);

  const handleResizeEnd = useCallback((columns: number, height: number) => {
    externalSetIsResizing?.(false);
    setCurrentDimensions({ columns, height });
    onResizeEnd?.(columns, height);
  }, [externalSetIsResizing, onResizeEnd]);

  const DEFAULT_WIDGET_HEIGHT = 280;
  const heightValue = currentDimensions?.height || DEFAULT_WIDGET_HEIGHT;

  const headerRight = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          data-testid="widget-menu-trigger"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onConfigure && (
          <>
            <DropdownMenuItem onClick={onConfigure} data-testid="widget-configure">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {onRemove && (
          <DropdownMenuItem onClick={onRemove} className="text-destructive" data-testid="widget-remove">
            <X className="h-4 w-4 mr-2" />
            Remove
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const titleNode = (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        {...dragHandleProps}
        className="-ml-1 cursor-grab rounded p-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:bg-muted active:cursor-grabbing"
        data-testid="widget-drag-handle"
        aria-label="Drag widget"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {icon && <span className="text-bp-muted">{icon}</span>}
    </div>
  );

  return (
    <div
      data-personal-widget="true"
      data-testid={`personal-widget-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        "group relative widget-animate-in",
        externalIsResizing && "z-50 select-none",
        themeClassName,
      )}
      style={{ height: `${heightValue}px`, ...themeStyleOverride }}
    >
      <WidgetCard
        title={title}
        accent={accent}
        locked={locked}
        lockedMessage={lockedMessage}
        headerRight={
          <div className="flex items-center gap-1">
            {titleNode}
            {headerRight}
          </div>
        }
        className="h-full"
        contentClassName="overflow-auto"
      >
        {children}
        {onResizeEnd && (
          <ResizeHandle
            onResize={handleResize}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
          />
        )}
      </WidgetCard>
    </div>
  );
}
