import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, ChevronLeft, ChevronRight, List, CalendarDays, CheckSquare, Timer, Bell } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, isToday, isTomorrow, addDays, subDays, startOfWeek, endOfWeek, isSameDay, eachDayOfInterval, isBefore } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ViewMode = "list" | "day" | "week";

const HOUR_HEIGHT = 36;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const typeColors: Record<string, string> = {
  task: "bg-blue-500",
  schedule: "bg-emerald-500",
  timesheet: "bg-amber-500",
  reminder: "bg-purple-500",
};

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  type?: string;
  projectId?: string;
}

function TimelineEvent({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  const startHour = event.startTime ? parseTimeString(event.startTime) : parseTimeFromDate(event.start);
  const endHour = event.endTime ? parseTimeString(event.endTime) : (startHour !== null ? startHour + 1 : null);
  
  if (startHour === null) return null;
  
  const duration = endHour !== null ? Math.max(endHour - startHour, 0.5) : 1;
  const top = startHour * HOUR_HEIGHT;
  const height = Math.max(duration * HOUR_HEIGHT, 18);
  
  const now = new Date();
  const eventDate = new Date(event.start);
  const isPast = isBefore(eventDate, now) && !isToday(eventDate);
  
  return (
    <div
      className={`absolute left-10 right-1 rounded-sm border text-[10px] px-1 py-0.5 overflow-hidden cursor-pointer hover-elevate ${
        isPast ? 'opacity-50' : ''
      }`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: typeColors[event.type || 'task']?.replace('bg-', 'hsl(var(--') || 'hsl(var(--muted))',
        borderColor: 'hsl(var(--border))',
      }}
      title={event.title}
    >
      <p className="font-medium truncate leading-tight">{event.title}</p>
    </div>
  );
}

function parseTimeString(timeStr: string): number | null {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + (minutes || 0) / 60;
}

function parseTimeFromDate(dateStr: string): number | null {
  try {
    const date = new Date(dateStr);
    return date.getHours() + date.getMinutes() / 60;
  } catch {
    return 9; // Default to 9am
  }
}

export default function PersonalCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const maxEvents = widget.config?.maxEvents || 8;
  const daysAhead = widget.config?.daysAhead || 7;
  const defaultViewMode = (widget.config?.viewMode as ViewMode) || "day";
  
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxEvents, setConfigMaxEvents] = useState(maxEvents);
  const [configDaysAhead, setConfigDaysAhead] = useState(daysAhead);
  const [configViewMode, setConfigViewMode] = useState(defaultViewMode);
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxEvents(widget.config?.maxEvents || 8);
    setConfigDaysAhead(widget.config?.daysAhead || 7);
    setConfigViewMode((widget.config?.viewMode as ViewMode) || "day");
    setViewMode((widget.config?.viewMode as ViewMode) || "day");
  }, [widget.title, widget.config]);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = addDays(startDate, daysAhead);

  const allEvents: CalendarEvent[] = tasks
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
      startTime: task.startTime,
      endTime: task.endTime,
      type: 'task',
      projectId: task.projectId,
    }));

  // Scroll to 6 AM or earliest event on mount
  useEffect(() => {
    if (scrollRef.current && (viewMode === "day" || viewMode === "week")) {
      const DEFAULT_START_HOUR = 6; // Default to 6 AM
      
      // Find earliest event time
      let earliestHour = DEFAULT_START_HOUR;
      allEvents.forEach(event => {
        if (event.startTime) {
          const startHour = parseTimeString(event.startTime);
          if (startHour !== null && startHour < earliestHour) {
            earliestHour = startHour;
          }
        }
      });
      
      const scrollPosition = Math.max(0, earliestHour * HOUR_HEIGHT);
      scrollRef.current.scrollTop = scrollPosition;
    }
  }, [viewMode, allEvents]);

  const isLoading = tasksLoading;

  const sortedEvents = [...allEvents].sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const getTimeLabel = (event: CalendarEvent) => {
    if (event.allDay) return 'All day';
    if (event.startTime) return event.startTime;
    return format(new Date(event.start), 'h:mm a');
  };

  const goToToday = () => setSelectedDate(new Date());
  const goToPrev = () => setSelectedDate(prev => viewMode === "week" ? subDays(prev, 7) : subDays(prev, 1));
  const goToNext = () => setSelectedDate(prev => viewMode === "week" ? addDays(prev, 7) : addDays(prev, 1));

  // Get events for selected date(s)
  const getEventsForDate = (date: Date) => {
    return allEvents.filter(event => isSameDay(new Date(event.start), date));
  };

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { 
            ...widget.config, 
            maxEvents: configMaxEvents, 
            daysAhead: configDaysAhead,
            viewMode: configViewMode 
          }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxEvents(widget.config?.maxEvents || 8);
      setConfigDaysAhead(widget.config?.daysAhead || 7);
      setConfigViewMode((widget.config?.viewMode as ViewMode) || "day");
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
          <Label className="text-xs">Default View</Label>
          <Select value={configViewMode} onValueChange={(v: ViewMode) => setConfigViewMode(v)}>
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="list">List</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Days Ahead (for list)</Label>
          <Input 
            type="number"
            min={1}
            max={30}
            value={configDaysAhead}
            onChange={(e) => setConfigDaysAhead(parseInt(e.target.value) || 7)}
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

  // Render header with view mode toggle
  const renderHeader = () => (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1">
        {(viewMode === "day" || viewMode === "week") && (
          <>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={goToPrev}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px]" onClick={goToToday}>
              Today
            </Button>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={goToNext}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </>
        )}
        <span className="text-xs font-medium ml-1">
          {viewMode === "week" 
            ? `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`
            : viewMode === "day"
              ? format(selectedDate, 'EEE, MMM d')
              : `${allEvents.length} upcoming`
          }
        </span>
      </div>
      <div className="flex items-center gap-0.5 border rounded-md p-0.5">
        <button 
          className={`p-1 rounded-sm ${viewMode === 'list' ? 'bg-muted' : ''}`}
          onClick={() => setViewMode('list')}
          title="List view"
        >
          <List className="h-3 w-3" />
        </button>
        <button 
          className={`p-1 rounded-sm ${viewMode === 'day' ? 'bg-muted' : ''}`}
          onClick={() => setViewMode('day')}
          title="Day view"
        >
          <Calendar className="h-3 w-3" />
        </button>
        <button 
          className={`p-1 rounded-sm ${viewMode === 'week' ? 'bg-muted' : ''}`}
          onClick={() => setViewMode('week')}
          title="Week view"
        >
          <CalendarDays className="h-3 w-3" />
        </button>
      </div>
    </div>
  );

  // Render List View
  const renderListView = () => {
    const displayEvents = sortedEvents.slice(0, maxEvents);
    
    if (displayEvents.length === 0) {
      return (
        <div className="text-center py-3 text-xs text-muted-foreground">
          No upcoming events
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {displayEvents.map((event) => {
          const eventDate = new Date(event.start);
          const isTodayEvent = isToday(eventDate);
          return (
            <div 
              key={event.id}
              className={`p-2 border rounded-md hover-elevate cursor-pointer ${
                isTodayEvent ? 'bg-[#bba7db]/10 border-[#bba7db]/30' : ''
              }`}
              data-testid={`calendar-event-${event.id}`}
            >
              <div className="flex items-start gap-2">
                <CheckSquare className={`h-3 w-3 mt-0.5 flex-shrink-0 ${isTodayEvent ? 'text-[#bba7db]' : 'text-muted-foreground'}`} />
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
        })}
      </div>
    );
  };

  // Render Day View
  const renderDayView = () => {
    const dayEvents = getEventsForDate(selectedDate);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const showCurrentTime = isToday(selectedDate);

    return (
      <div 
        ref={scrollRef}
        className="relative overflow-auto"
        style={{ height: 'calc(100% - 32px)', maxHeight: '300px' }}
      >
        <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Hour lines */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-border/30"
              style={{ top: `${hour * HOUR_HEIGHT}px` }}
            >
              <span className="absolute left-0 -top-2 text-[9px] text-muted-foreground w-9 text-right pr-1">
                {format(new Date().setHours(hour, 0), 'ha')}
              </span>
            </div>
          ))}
          
          {/* Current time indicator */}
          {showCurrentTime && (
            <div
              className="absolute left-9 right-0 border-t-2 border-red-500 z-10"
              style={{ top: `${(currentMinutes / 60) * HOUR_HEIGHT}px` }}
            >
              <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
            </div>
          )}
          
          {/* Events */}
          {dayEvents.map((event) => (
            <TimelineEvent key={event.id} event={event} />
          ))}
          
          {dayEvents.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">No events</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Week View
  const renderWeekView = () => {
    return (
      <div 
        ref={scrollRef}
        className="overflow-auto"
        style={{ height: 'calc(100% - 32px)', maxHeight: '300px' }}
      >
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px border-b border-border sticky top-0 bg-background z-10">
          {weekDays.map((day) => (
            <div 
              key={day.toISOString()} 
              className={`text-center py-1 ${isToday(day) ? 'bg-[#bba7db]/10' : ''}`}
            >
              <div className="text-[9px] text-muted-foreground">{format(day, 'EEE')}</div>
              <div className={`text-xs font-medium ${isToday(day) ? 'text-[#bba7db]' : ''}`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>
        
        {/* Day columns with events */}
        <div className="grid grid-cols-7 gap-px min-h-[200px]">
          {weekDays.map((day) => {
            const dayEvents = getEventsForDate(day);
            return (
              <div 
                key={day.toISOString()} 
                className={`border-r border-border/30 p-0.5 min-h-[180px] ${isToday(day) ? 'bg-[#bba7db]/5' : ''}`}
              >
                {dayEvents.slice(0, 4).map((event) => (
                  <div
                    key={event.id}
                    className="text-[9px] p-0.5 mb-0.5 rounded-sm bg-blue-500/20 border-l-2 border-blue-500 truncate cursor-pointer hover-elevate"
                    title={event.title}
                  >
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 4 && (
                  <div className="text-[8px] text-muted-foreground text-center">
                    +{dayEvents.length - 4} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {renderHeader()}
      
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-xs text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <>
          {viewMode === "list" && renderListView()}
          {viewMode === "day" && renderDayView()}
          {viewMode === "week" && renderWeekView()}
        </>
      )}
    </div>
  );
}
