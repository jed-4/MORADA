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

interface PersonalWidgetContainerProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onRemove?: () => void;
  onConfigure?: () => void;
  dragHandleProps?: Record<string, unknown>;
}

export default function PersonalWidgetContainer({
  title,
  icon,
  children,
  onRemove,
  onConfigure,
  dragHandleProps,
}: PersonalWidgetContainerProps) {
  return (
    <Card className="h-full flex flex-col overflow-hidden" data-testid={`personal-widget-${title.toLowerCase().replace(/\s+/g, '-')}`}>
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
    </Card>
  );
}
