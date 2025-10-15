import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Plus } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { type ChecklistTemplate } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { useLocation } from "wouter";

export default function ChecklistWidget({ widget }: WidgetProps) {
  const maxChecklists = widget.config?.maxChecklists || 5;
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();
  
  // Fetch checklist templates filtered by current project
  const { data: checklists = [], isLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/checklist-templates?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });
  
  const displayChecklists = checklists.slice(0, maxChecklists);

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      'handover': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'pre_start': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'progress': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      'quality': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      'safety': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      'custom': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[type] || colors.custom;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'handover': 'Handover',
      'pre_start': 'Pre-Start',
      'progress': 'Progress',
      'quality': 'Quality',
      'safety': 'Safety',
      'custom': 'Custom',
    };
    return labels[type] || 'Custom';
  };

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view checklists
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {checklists.length} checklist{checklists.length !== 1 ? 's' : ''}
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          onClick={() => setLocation('/checklist-templates')}
          data-testid="checklist-widget-view-all"
        >
          <Plus className="h-3 w-3 mr-1" />
          View All
        </Button>
      </div>
      
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].slice(0, maxChecklists).map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-start gap-2 p-3 border rounded">
                  <div className="h-4 w-4 bg-muted rounded"></div>
                  <div className="flex-1 min-w-0">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          displayChecklists.map((checklist) => (
            <div 
              key={checklist.id} 
              className="p-3 border rounded hover-elevate cursor-pointer"
              onClick={() => setLocation(`/checklist-templates/${checklist.id}`)}
              data-testid={`checklist-widget-item-${checklist.id}`}
            >
              <div className="flex items-start gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{checklist.name}</p>
                    <Badge 
                      className={`${getTypeBadgeColor(checklist.type)} text-xs px-2 py-0 no-default-hover-elevate no-default-active-elevate`}
                    >
                      {getTypeLabel(checklist.type)}
                    </Badge>
                  </div>
                  {checklist.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {checklist.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {displayChecklists.length === 0 && !isLoading && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No checklists yet
        </div>
      )}
    </div>
  );
}
