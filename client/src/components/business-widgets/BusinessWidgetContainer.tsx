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
import type { Widget, WidgetDefinition } from "@/types/widgets";

interface BusinessWidgetContainerProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onRemove?: () => void;
  onConfigure?: () => void;
  dragHandleProps?: Record<string, any>;
  dimensions?: { columns?: number; height?: number };
  isResizing?: boolean;
  setIsResizing?: (v: boolean) => void;
  onResizeEnd?: (columns: number, height: number) => void;
}

export default function BusinessWidgetContainer({
  title,
  icon,
  children,
  onRemove,
  onConfigure,
  dragHandleProps,
  dimensions,
  isResizing,
  setIsResizing,
  onResizeEnd,
}: BusinessWidgetContainerProps) {
  return (
    <Card 
      className="h-full flex flex-col overflow-hidden relative"
      style={{ height: dimensions?.height ? `${dimensions.height}px` : undefined }}
      data-testid={`widget-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardHeader className="flex flex-row items-center justify-between p-3 pb-2 gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="cursor-grab hover:bg-muted rounded p-0.5 flex-shrink-0"
              data-testid="widget-drag-handle"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          {icon && <div className="flex-shrink-0">{icon}</div>}
          <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onConfigure && (
              <DropdownMenuItem onClick={onConfigure}>
                <Settings className="h-3.5 w-3.5 mr-2" />
                Configure
              </DropdownMenuItem>
            )}
            {onRemove && (
              <>
                {onConfigure && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onRemove} className="text-destructive">
                  <X className="h-3.5 w-3.5 mr-2" />
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-auto p-3 pt-0">
        {children}
      </CardContent>

      {onResizeEnd && setIsResizing && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize hover:bg-primary/10"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
            
            const card = (e.target as HTMLElement).closest('[data-testid^="widget-"]') as HTMLElement;
            if (!card) return;
            
            const grid = card.closest('.grid') as HTMLElement;
            if (!grid) return;
            
            const rect = card.getBoundingClientRect();
            const containerRect = grid.getBoundingClientRect();
            const gap = 16;
            const columnWidth = (containerRect.width - (7 * gap)) / 8;
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = rect.width;
            const startHeight = rect.height;

            const handleMouseMove = (moveE: MouseEvent) => {
              const deltaX = moveE.clientX - startX;
              const deltaY = moveE.clientY - startY;
              const targetWidth = startWidth + deltaX;
              const columns = Math.round((targetWidth + gap) / (columnWidth + gap));
              const snappedColumns = Math.max(1, Math.min(8, columns));
              const newHeight = Math.max(150, startHeight + deltaY);
              card.style.height = `${newHeight}px`;
            };

            const handleMouseUp = (upE: MouseEvent) => {
              setIsResizing(false);
              const deltaX = upE.clientX - startX;
              const deltaY = upE.clientY - startY;
              const targetWidth = startWidth + deltaX;
              const columns = Math.round((targetWidth + gap) / (columnWidth + gap));
              const snappedColumns = Math.max(1, Math.min(8, columns));
              const finalHeight = Math.max(150, startHeight + deltaY);
              onResizeEnd(snappedColumns, finalHeight);
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
          data-testid="resize-handle"
        >
          <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-r-2 border-b-2 border-muted-foreground/50 hover:border-primary" />
        </div>
      )}
    </Card>
  );
}
