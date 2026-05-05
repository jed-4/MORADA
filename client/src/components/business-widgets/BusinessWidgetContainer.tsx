import { Button } from "@/components/ui/button";
import { MoreVertical, X, Settings, GripVertical, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
}

const ACCENT_BG: Record<WidgetAccent, string> = {
  purple: "bg-bp-purple",
  teal: "bg-bp-teal",
  green: "bg-bp-green",
  amber: "bg-bp-amber",
  coral: "bg-bp-coral",
  financial: "bg-bp-accent-financial",
  project: "bg-bp-accent-project",
  schedule: "bg-bp-accent-schedule",
  success: "bg-bp-accent-success",
  danger: "bg-bp-accent-danger",
};

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
}: BusinessWidgetContainerProps) {
  const accentClass = ACCENT_BG[accent] || ACCENT_BG.purple;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-md border border-bp-border bg-bp-card text-bp-card-foreground shadow-card",
        themeClassName,
      )}
      style={{
        height: dimensions?.height ? `${dimensions.height}px` : undefined,
        ...themeStyleOverride,
      }}
      data-testid={`widget-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={cn("h-1 w-full flex-shrink-0", accentClass)} />
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="cursor-grab rounded p-0.5 flex-shrink-0 text-bp-muted hover-elevate"
              data-testid="widget-drag-handle"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}
          {icon && <div className="flex-shrink-0 text-bp-muted">{icon}</div>}
          <h3 className="truncate text-sm font-semibold leading-tight">{title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {locked && (
            <span
              className="inline-flex items-center gap-1 rounded-sm bg-bp-amber/15 px-1.5 py-0.5 text-[10px] font-medium text-bp-amber"
              data-testid="widget-locked-badge"
            >
              <Lock className="h-2.5 w-2.5" />
              Locked
            </span>
          )}
          {headerExtra}
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
        </div>
      </div>

      <div className="relative flex-1 overflow-auto px-4 pb-4">
        {children}
        {locked && (
          <div
            data-testid="widget-locked-overlay"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bp-card/75 p-4 text-center backdrop-blur-sm"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bp-amber/15 text-bp-amber">
              <Lock className="h-4 w-4" />
            </div>
            <p className="max-w-xs text-xs text-bp-muted">{lockedMessage}</p>
          </div>
        )}
      </div>

      {onResizeEnd && setIsResizing && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize hover:bg-primary/10 z-10"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
            const card = (e.target as HTMLElement).closest('[data-testid^="widget-"]') as HTMLElement;
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
