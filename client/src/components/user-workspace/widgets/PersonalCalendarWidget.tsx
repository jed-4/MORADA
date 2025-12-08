import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, isToday, isTomorrow, addDays } from "date-fns";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  type?: string;
  projectId?: string;
}

export default function PersonalCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const maxEvents = widget.config?.maxEvents || 8;
  const daysAhead = widget.config?.daysAhead || 7;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxEvents, setConfigMaxEvents] = useState(maxEvents);
  const [configDaysAhead, setConfigDaysAhead] = useState(daysAhead);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxEvents(widget.config?.maxEvents || 8);
    setConfigDaysAhead(widget.config?.daysAhead || 7);
  }, [widget.title, widget.config]);

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/user"],
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks", { assigneeId: currentUser?.id }],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const response = await fetch(`/api/tasks?assigneeId=${currentUser.id}`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = addDays(startDate, daysAhead);

  const events: CalendarEvent[] = tasks
    .filter(task => {
      if (!task.dueDate) return false;
      if (task.status === 'done' || task.status === 'complete') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate >= startDate && dueDate <= endDate;
    })
    .map(task => ({
      id: task.id,
      title: task.title,
      start: task.dueDate,
      type: 'task',
      projectId: task.projectId,
    }));

  const isLoading = tasksLoading;

  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  const displayEvents = sortedEvents.slice(0, maxEvents);

  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const getTimeLabel = (event: CalendarEvent) => {
    if (event.allDay) return 'All day';
    return format(new Date(event.start), 'h:mm a');
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, maxEvents: configMaxEvents, daysAhead: configDaysAhead }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxEvents(widget.config?.maxEvents || 8);
      setConfigDaysAhead(widget.config?.daysAhead || 7);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Calendar</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Days Ahead</Label>
          <Input 
            type="number"
            min={1}
            max={30}
            value={configDaysAhead}
            onChange={(e) => setConfigDaysAhead(parseInt(e.target.value) || 7)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Events</Label>
          <Input 
            type="number"
            min={1}
            max={20}
            value={configMaxEvents}
            onChange={(e) => setConfigMaxEvents(parseInt(e.target.value) || 8)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {events.length} event{events.length !== 1 ? 's' : ''} this week
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setLocation(`/users/${currentUser?.id}/calendar`)}
          data-testid="calendar-widget-view-all"
        >
          View All
        </Button>
      </div>
      
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-2 border rounded-md">
                <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                <div className="h-2 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : displayEvents.length === 0 ? (
          <div className="text-center py-3 text-xs text-muted-foreground">
            No upcoming events
          </div>
        ) : (
          displayEvents.map((event) => {
            const eventDate = new Date(event.start);
            const isTodayEvent = isToday(eventDate);
            return (
              <div 
                key={event.id}
                className={`p-2 border rounded-md hover-elevate cursor-pointer ${
                  isTodayEvent ? 'bg-[#bba7db]/10 border-[#bba7db]/30' : ''
                }`}
                onClick={() => setLocation(`/users/${currentUser?.id}/calendar`)}
                data-testid={`calendar-event-${event.id}`}
              >
                <div className="flex items-start gap-2">
                  <Calendar className={`h-3 w-3 mt-0.5 flex-shrink-0 ${isTodayEvent ? 'text-[#bba7db]' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{event.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {getDayLabel(event.start)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2 w-2" />
                        {getTimeLabel(event)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
