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
import { useState, useRef, useCallback } from "react";

interface PersonalWidgetContainerProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onRemove?: () => void;
  onConfigure?: () => void;
  dragHandleProps?: Record<string, unknown>;
  onResizeEnd?: (columns: number, height: number) => void;
  dimensions?: { columns?: number; height?: number };
  isResizing?: boolean;
  setIsResizing?: (value: boolean) => void;
}

function ResizeHandle({ 
  onResize, 
  onResizeStart, 
  onResizeEnd 
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
    
    const parentCard = (e.target as HTMLElement).closest('[data-testid^="personal-widget-"]') as HTMLElement;
    if (!parentCard) return;

    const gridContainer = parentCard.closest('.grid') as HTMLElement;
    if (!gridContainer) {
      console.warn('No grid container found - resize disabled');
      return;
    }

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
      const snappedWidth = (snappedColumns * columnWidth) + ((snappedColumns - 1) * gap);
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

export default function PersonalWidgetContainer({
  title,
  icon,
  children,
  onRemove,
  onConfigure,
  dragHandleProps,
  onResizeEnd,
  dimensions,
  isResizing: externalIsResizing,
  setIsResizing: externalSetIsResizing,
}: PersonalWidgetContainerProps) {
  const [currentDimensions, setCurrentDimensions] = useState(dimensions);

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

  const heightStyle = currentDimensions?.height ? `${currentDimensions.height}px` : undefined;

  return (
    <Card 
      className={`relative h-full flex flex-col overflow-hidden ${externalIsResizing ? 'select-none z-50' : ''}`} 
      style={{ height: heightStyle }}
      data-testid={`personal-widget-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-2 px-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded"
            data-testid="widget-drag-handle"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
          <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" data-testid="widget-menu-trigger">
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
      </CardHeader>
      
      <CardContent className="flex-1 overflow-auto p-3">
        {children}
      </CardContent>

      {onResizeEnd && (
        <ResizeHandle
          onResize={handleResize}
          onResizeStart={handleResizeStart}
          onResizeEnd={handleResizeEnd}
        />
      )}
    </Card>
  );
}
