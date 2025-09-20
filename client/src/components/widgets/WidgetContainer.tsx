import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreVertical, X, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Widget, WidgetProps } from "@/types/widgets";

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

  return (
    <Card 
      className={`${sizeClasses[widget.size]} ${isConfiguring ? 'ring-2 ring-primary' : ''}`}
      data-testid={`widget-${widget.type}-${widget.id}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
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