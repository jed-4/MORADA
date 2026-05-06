import { Button } from "@/components/ui/button";
import { MoreVertical, X, Settings, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { WidgetAccent } from "@/types/widgets";

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
  themeClassName?: string;
  themeStyleOverride?: React.CSSProperties;
  accent?: WidgetAccent;
  locked?: boolean;
  lockedMessage?: string;
  headerExtra?: React.ReactNode;
  /**
   * Additional menu items rendered inside the ⋯ dropdown, immediately
   * before the Remove entry. Surrounding separators are added automatically.
   */
  extraMenuItems?: React.ReactNode;
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
  themeClassName,
  themeStyleOverride,
  accent = "purple",
  locked = false,
  lockedMessage = "You don't have permission to view this content.",
  headerExtra,
  extraMenuItems,
}: BusinessWidgetContainerProps) {
  const hasMenu = !!onConfigure || !!onRemove || !!extraMenuItems;
  const headerLeft = dragHandleProps ? (
    <div
      {...dragHandleProps}
      className="cursor-grab rounded p-0.5 flex-shrink-0 text-bp-muted hover-elevate opacity-0 group-hover:opacity-100 transition-opacity -ml-1"
      data-testid="widget-drag-handle"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </div>
  ) : null;
  const headerRight = (
    <>
      {headerExtra}
      {hasMenu && (
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
            {extraMenuItems && (
              <>
                {onConfigure && <DropdownMenuSeparator />}
                {extraMenuItems}
              </>
            )}
            {onRemove && (
              <>
                {(onConfigure || extraMenuItems) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onRemove} className="text-destructive">
                  <X className="h-3.5 w-3.5 mr-2" />
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  return (
    <div
      className={cn("group relative h-full", themeClassName)}
      style={{
        height: dimensions?.height ? `${dimensions.height}px` : undefined,
        ...themeStyleOverride,
      }}
      data-testid={`widget-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <WidgetCard
        title={title}
        accent={accent}
        locked={locked}
        lockedMessage={lockedMessage}
        headerLeft={headerLeft}
        headerRight={headerRight}
        className="h-full"
      >
        {children}
      </WidgetCard>

      {onResizeEnd && setIsResizing && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize hover:bg-primary/10 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
            const card = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
            if (!card) return;
            const grid = card.closest(".grid") as HTMLElement;
            if (!grid) return;
            const rect = card.getBoundingClientRect();
            const containerRect = grid.getBoundingClientRect();
            const gap = 16;
            const columnWidth = (containerRect.width - 7 * gap) / 8;
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = rect.width;
            const startHeight = rect.height;

            const handleMouseMove = (moveE: MouseEvent) => {
              const deltaY = moveE.clientY - startY;
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
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
          data-testid="resize-handle"
        >
          <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-r-2 border-b-2 border-bp-muted/50 hover:border-primary" />
        </div>
      )}
    </div>
  );
}
