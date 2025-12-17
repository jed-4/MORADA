import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Calendar, Timer, Play, Square, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isToday, isSameDay } from "date-fns";
import type { User, Timesheet, Project } from "@shared/schema";

interface UserTimeProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserTime({ user, isOwnPage }: UserTimeProps) {
  const [viewType, setViewType] = useState<"table" | "weekly">("table");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  const { data: timesheets = [], isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets", { userId: user.id }],
    queryFn: async () => {
      const response = await fetch(`/api/timesheets?userId=${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch timesheets');
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weeklyTimesheets = useMemo(() => {
    return timesheets.filter(ts => {
      const tsDate = new Date(ts.date);
      return tsDate >= weekStart && tsDate <= weekEnd;
    });
  }, [timesheets, weekStart, weekEnd]);

  const dailyHours = useMemo(() => {
    const hours: Record<string, number> = {};
    daysOfWeek.forEach(day => {
      const dayKey = format(day, 'yyyy-MM-dd');
      hours[dayKey] = weeklyTimesheets
        .filter(ts => isSameDay(new Date(ts.date), day))
        .reduce((sum, ts) => sum + parseFloat(String(ts.duration || 0)), 0);
    });
    return hours;
  }, [weeklyTimesheets, daysOfWeek]);

  const totalWeekHours = Object.values(dailyHours).reduce((sum, h) => sum + h, 0);

  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || 'Unknown Project';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'submitted': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4" data-testid="user-time">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-pulse flex flex-col items-center gap-2">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-4 w-48 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="user-time">
      <div className="h-10 bg-background flex items-center justify-between px-4 gap-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">
            {isOwnPage ? 'My Time' : `${user.firstName} ${user.lastName} - Time`}
          </h3>
          <Badge variant="outline" className="text-xs" data-testid="badge-timesheet-count">
            {timesheets.length} entries
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={viewType} onValueChange={(v) => setViewType(v as "table" | "weekly")}>
            <TabsList className="h-8">
              <TabsTrigger value="table" className="text-xs" data-testid="tab-table">
                Table
              </TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs" data-testid="tab-weekly">
                Weekly
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {viewType === "weekly" ? (
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setWeekStart(subWeeks(weekStart, 1))}
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-sm font-medium">
                  {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-7 border-t">
                {daysOfWeek.map((day) => {
                  const dayKey = format(day, 'yyyy-MM-dd');
                  const hours = dailyHours[dayKey] || 0;
                  return (
                    <div 
                      key={dayKey} 
                      className={`p-3 text-center border-r last:border-r-0 ${
                        isToday(day) ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="text-xs text-muted-foreground">{format(day, 'EEE')}</div>
                      <div className="text-sm font-medium">{format(day, 'd')}</div>
                      <div className={`text-lg font-semibold mt-2 ${hours > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {hours.toFixed(1)}h
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 border-t bg-muted/30 text-center">
                <span className="text-sm text-muted-foreground">Week Total: </span>
                <span className="text-sm font-semibold">{totalWeekHours.toFixed(1)} hours</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-200px)]">
                {timesheets.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Timer className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No time entries found</p>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-left p-2 font-medium">Project</th>
                        <th className="text-left p-2 font-medium">Duration</th>
                        <th className="text-left p-2 font-medium">Description</th>
                        <th className="text-left p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timesheets.slice(0, 50).map((ts) => (
                        <tr key={ts.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="p-2">{format(new Date(ts.date), 'MMM d, yyyy')}</td>
                          <td className="p-2">{getProjectName(ts.projectId)}</td>
                          <td className="p-2 font-medium">{parseFloat(String(ts.duration || 0)).toFixed(1)}h</td>
                          <td className="p-2 max-w-[200px] truncate text-muted-foreground">
                            {ts.description || '-'}
                          </td>
                          <td className="p-2">
                            <Badge variant="outline" className={`text-[10px] ${getStatusColor(ts.status)}`}>
                              {ts.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
