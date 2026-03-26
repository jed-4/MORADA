import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Calendar, Timer, ChevronLeft, ChevronRight, X, Briefcase, Tag, FileText, AlarmClock, ExternalLink } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isToday, isSameDay } from "date-fns";
import type { User, Timesheet, Project, CostCode } from "@shared/schema";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface UserTimeProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserTime({ user, isOwnPage }: UserTimeProps) {
  const [viewType, setViewType] = useState<"table" | "weekly">("table");
  const weekStartDay = useWeekStartDay();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  const { effectiveTimezone } = useTimezone();
  const [selectedTimesheet, setSelectedTimesheet] = useState<any | null>(null);
  const [, navigate] = useLocation();

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

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: weekStartDay });
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

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return 'Business';
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  const getCostCodeName = (ts: any) => {
    const codeId = ts.costCodeId || ts.costCodeSplits?.[0]?.costCodeId;
    if (!codeId) return null;
    const cc = costCodes.find(c => c.id === codeId);
    if (!cc) return null;
    return cc.code ? `${cc.code} — ${cc.title}` : cc.title;
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
      {/* Header Panel - 2 rows connected to content */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        {/* Row 1 - Title */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {isOwnPage ? 'My Timesheets' : `${user.firstName}'s Timesheets`}
          </h2>
        </div>

        {/* Row 2 - View Tabs */}
        <div className="h-8 flex items-center justify-between px-3">
          <div className="flex items-center gap-1" data-testid="tabs-time-views">
            {(["table", "weekly"] as const).map((view) => {
              const Icon = view === "table" ? Clock : Calendar;
              const isActive = viewType === view;
              return (
                <button
                  key={view}
                  onClick={() => setViewType(view)}
                  className={`relative h-7 px-2 text-xs flex items-center gap-1 transition-colors ${
                    isActive
                      ? 'text-[#bba7db] font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`tab-${view}`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="capitalize">{view}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Weekly view navigation */}
          {viewType === "weekly" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekStart(subWeeks(weekStart, 1))}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-prev-week"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-xs text-muted-foreground px-2">
                {formatInTimezone(weekStart, effectiveTimezone, { month: 'short', day: 'numeric' })} - {formatInTimezone(weekEnd, effectiveTimezone, { month: 'short', day: 'numeric' })}
              </span>
              <button
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-next-week"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content - connected to header */}
      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
        {viewType === "weekly" ? (
          <div>
            <div className="grid grid-cols-7 border-b">
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
                    <div className="text-xs text-muted-foreground">{formatInTimezone(day, effectiveTimezone, { weekday: 'short' })}</div>
                    <div className="text-sm font-medium">{formatInTimezone(day, effectiveTimezone, { day: 'numeric' })}</div>
                    <div className={`text-lg font-semibold mt-2 ${hours > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {hours.toFixed(1)}h
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 bg-muted/30 text-center">
              <span className="text-sm text-muted-foreground">Week Total: </span>
              <span className="text-sm font-semibold">{totalWeekHours.toFixed(1)} hours</span>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
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
                    <th className="text-left p-2 font-medium">Cost Code</th>
                    <th className="text-left p-2 font-medium">Duration</th>
                    <th className="text-left p-2 font-medium">Description</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.slice(0, 50).map((ts: any) => {
                    const costCodeName = getCostCodeName(ts);
                    return (
                      <tr
                        key={ts.id}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedTimesheet(ts)}
                        data-testid={`row-timesheet-${ts.id}`}
                      >
                        <td className="p-2">{formatInTimezone(new Date(ts.date), effectiveTimezone, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                        <td className="p-2">{getProjectName(ts.projectId)}</td>
                        <td className="p-2 text-muted-foreground">{costCodeName || <span className="text-muted-foreground/50">—</span>}</td>
                        <td className="p-2 font-medium">{parseFloat(String(ts.duration || 0)).toFixed(1)}h</td>
                        <td className="p-2 max-w-[160px] truncate text-muted-foreground">
                          {ts.description || '—'}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className={`text-[10px] ${getStatusColor(ts.status)}`}>
                            {ts.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ScrollArea>
        )}
      </div>

      {/* Timesheet Detail Modal */}
      <Dialog open={!!selectedTimesheet} onOpenChange={(open) => { if (!open) setSelectedTimesheet(null); }}>
        <DialogContent className="max-w-md" data-testid="modal-timesheet-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Timer className="w-4 h-4" />
              Timesheet Entry
            </DialogTitle>
          </DialogHeader>
          {selectedTimesheet && (
            <div className="space-y-3 text-sm">
              {/* Date */}
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Date</div>
                  <div className="font-medium">
                    {formatInTimezone(new Date(selectedTimesheet.date), effectiveTimezone, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Time & Duration */}
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                <AlarmClock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-0.5">Time & Duration</div>
                  <div className="font-medium">
                    {parseFloat(String(selectedTimesheet.duration || 0)).toFixed(2)} hours
                  </div>
                  {(selectedTimesheet.startTime || selectedTimesheet.endTime) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selectedTimesheet.startTime || '—'} → {selectedTimesheet.endTime || '—'}
                      {selectedTimesheet.breakDuration && parseFloat(String(selectedTimesheet.breakDuration)) > 0 && (
                        <span> (break: {parseFloat(String(selectedTimesheet.breakDuration)).toFixed(2)}h)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Project */}
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                <Briefcase className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Project</div>
                  <div className="font-medium">{getProjectName(selectedTimesheet.projectId)}</div>
                </div>
              </div>

              {/* Cost Code */}
              {getCostCodeName(selectedTimesheet) && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                  <Tag className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Cost Code</div>
                    <div className="font-medium">{getCostCodeName(selectedTimesheet)}</div>
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedTimesheet.description && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                    <div>{selectedTimesheet.description}</div>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="outline" className={`text-[10px] ${getStatusColor(selectedTimesheet.status)}`}>
                  {selectedTimesheet.status}
                </Badge>
              </div>

              {/* Rejection reason */}
              {selectedTimesheet.status === 'rejected' && selectedTimesheet.rejectionReason && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md text-xs text-red-700 dark:text-red-400">
                  <span className="font-medium">Rejection reason: </span>
                  {selectedTimesheet.rejectionReason}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedTimesheet(null);
                navigate("/timesheets");
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Go to Timesheets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
