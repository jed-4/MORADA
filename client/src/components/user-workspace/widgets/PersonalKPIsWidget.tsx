import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Clock,
  Target,
  Award
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";

export default function PersonalKPIsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);

  if (isConfiguring) {
    return (
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Label>Widget Title</Label>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            placeholder="Personal KPIs"
            data-testid="input-widget-title"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCloseConfig}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onUpdate?.({ ...widget, title: editingTitle });
              onCloseConfig?.();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="personal-kpis-widget">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{widget.title || "Personal KPIs"}</span>
          <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Coming Soon
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-muted">
            <Target className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <Award className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <h3 className="text-sm font-medium mb-1">Personal KPIs</h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          Track your personal goals and performance metrics. This feature is coming soon.
        </p>
      </div>
    </div>
  );
}
