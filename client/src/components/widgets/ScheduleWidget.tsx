import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Plus, AlertTriangle } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";

// Function to generate project-specific mock schedule items
const generateProjectScheduleItems = (projectId: string, projectName: string) => {
  const seed = projectId ? projectId.charCodeAt(0) * 1000 : 1000;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  const scheduleTypes = [
    { title: `${projectName} - Foundation Inspection`, type: "inspection", priority: "high" },
    { title: `${projectName} - Electrical Work`, type: "work", priority: "medium" },
    { title: `${projectName} - Plumbing Install`, type: "work", priority: "medium" },
    { title: `${projectName} - Client Meeting`, type: "meeting", priority: "high" },
    { title: `${projectName} - Final Walkthrough`, type: "inspection", priority: "high" },
  ];

  return scheduleTypes.slice(0, 2 + (seed % 3)).map((item, index) => ({
    id: `${projectId}-${index}`,
    title: item.title,
    date: new Date(today.getTime() + (index * 86400000) + ((seed % 3) * 86400000)).toISOString().split('T')[0],
    time: `${9 + (seed % 6)}:00 ${(seed % 2) ? 'AM' : 'PM'}`,
    type: item.type,
    status: (seed % 4 === 0 && index === 0) ? "overdue" : "scheduled",
    priority: item.priority,
  }));
};

export default function ScheduleWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const maxItems = widget.config?.maxItems || 4;
  const showOverdue = widget.config?.showOverdue !== false;
  
  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view schedule
      </div>
    );
  }

  const projectScheduleItems = generateProjectScheduleItems(currentProject.id, currentProject.name);
  const filteredItems = projectScheduleItems
    .filter(item => showOverdue || item.status !== 'overdue')
    .slice(0, maxItems);

  const typeColors = {
    inspection: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    work: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    meeting: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredItems.length} scheduled item{filteredItems.length !== 1 ? 's' : ''}
        </div>
        <Button size="sm" variant="ghost" data-testid="schedule-widget-add">
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <div 
            key={item.id}
            className={`p-3 border rounded hover-elevate cursor-pointer ${
              item.status === 'overdue' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' : ''
            }`}
            data-testid={`schedule-widget-item-${item.id}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{item.title}</span>
                  {item.status === 'overdue' && (
                    <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(item.date)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{item.time}</span>
                  </div>
                </div>
              </div>
              
              <Badge className={`text-xs ${typeColors[item.type as keyof typeof typeColors]}`}>
                {item.type}
              </Badge>
            </div>
          </div>
        ))}
      </div>
      
      {filteredItems.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No scheduled items
        </div>
      )}
    </div>
  );
}