import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarDays, Clock, Repeat, User, ListTodo } from "lucide-react";
import type { TaskTemplate } from "@shared/schema";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_HEIGHT = 48;

interface UserType {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  roleId?: string;
}

interface RecurringScheduleItem {
  dayOfWeek: number;
  startTime: string;
  duration: number;
}

interface RolePermission {
  roleId: string;
  permissionId: string;
  allowedActions: string[];
}

export interface DefaultDiaryHandle {
  refresh: () => void;
}

interface DefaultDiaryProps {
  searchQuery?: string;
}

function parseTime(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours + minutes / 60;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export const DefaultDiary = forwardRef<DefaultDiaryHandle, DefaultDiaryProps>(
  function DefaultDiary({ searchQuery = "" }, ref) {
    const { user: currentUser } = useAuth();
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

    const { data: users = [], isLoading: usersLoading } = useQuery<UserType[]>({
      queryKey: ["/api/users"],
    });

    // Fetch task templates with recurring schedules
    const { data: taskTemplates = [], isLoading: templatesLoading, refetch } = useQuery<TaskTemplate[]>({
      queryKey: ["/api/systems/task-templates"],
    });

    const { data: userRoles = [] } = useQuery<any[]>({
      queryKey: ["/api/user-roles"],
    });

    // Check if current user is admin or has elevated permissions
    const canViewOtherUsers = useMemo(() => {
      if (!currentUser?.roleId) return true; // Allow by default if no role system
      const userRole = userRoles.find((r: any) => r.id === currentUser.roleId);
      return userRole?.name === "Admin" || userRole?.name === "Owner" || userRole?.isAdmin;
    }, [currentUser?.roleId, userRoles]);

    // Default to "all" to show all recurring templates
    useEffect(() => {
      if (selectedUserId === null) {
        setSelectedUserId("all");
      }
    }, [selectedUserId]);

    useImperativeHandle(ref, () => ({
      refresh: () => refetch(),
    }));

    const effectiveUserId = selectedUserId || "all";

    // Filter recurring task templates
    const recurringTemplates = useMemo(() => {
      return taskTemplates.filter((template) => {
        // Only show active recurring templates
        if (!template.isRecurringTemplate || !template.isActive) return false;
        
        // Must have at least one recurring day
        const recurringDays = (template.recurringDays as number[]) || [];
        if (recurringDays.length === 0) return false;
        
        // Search filter (applies to all views)
        if (searchQuery && !template.title.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        
        // Filter by user if selected (checks assigneeUserId or default role assignment)
        if (effectiveUserId !== "all") {
          // Check direct user assignment
          if (template.assigneeUserId === effectiveUserId) return true;
          // Check role-based assignment - see if user has that role
          if (template.defaultRoleId) {
            const user = users.find(u => u.id === effectiveUserId);
            if (user?.roleId === template.defaultRoleId) return true;
          }
          return false;
        }
        
        return true;
      });
    }, [taskTemplates, effectiveUserId, users, searchQuery]);

    // Get templates scheduled for a specific day
    const getTemplatesForDay = (dayIndex: number) => {
      return recurringTemplates.filter((template) => {
        const recurringDays = (template.recurringDays as number[]) || [];
        return recurringDays.includes(dayIndex);
      });
    };

    // Get templates for a specific day and hour (uses recurringSchedule for time)
    const getTemplatesForDayAndHour = (dayIndex: number, hour: number) => {
      const dayTemplates = getTemplatesForDay(dayIndex);
      return dayTemplates.filter((template) => {
        const schedule = (template.recurringSchedule as RecurringScheduleItem[]) || [];
        const daySchedule = schedule.find(s => s.dayOfWeek === dayIndex);
        if (!daySchedule) {
          // Fall back to dueTime if no specific schedule
          const startHour = parseTime(template.dueTime);
          if (startHour === null) return false;
          return Math.floor(startHour) === hour;
        }
        const startHour = parseTime(daySchedule.startTime);
        if (startHour === null) return false;
        return Math.floor(startHour) === hour;
      });
    };

    // Get all-day templates (no specific time set)
    const getAllDayTemplates = (dayIndex: number) => {
      const dayTemplates = getTemplatesForDay(dayIndex);
      return dayTemplates.filter((template) => {
        const schedule = (template.recurringSchedule as RecurringScheduleItem[]) || [];
        const daySchedule = schedule.find(s => s.dayOfWeek === dayIndex);
        if (daySchedule) return false; // Has a specific time
        const startHour = parseTime(template.dueTime);
        return startHour === null;
      });
    };

    const getPriorityColor = (priority?: string) => {
      switch (priority) {
        case "high": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-800";
        case "medium": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800";
        case "low": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800";
        default: return "bg-primary/10 text-primary border-primary/20";
      }
    };

    const isLoading = usersLoading || templatesLoading;
    const today = new Date().getDay();

    // Get current time for the time indicator
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeTop = (currentHour + currentMinutes / 60) * HOUR_HEIGHT;

    return (
      <div className="h-full flex flex-col overflow-hidden p-4">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Default Week
            </h2>
            <Badge variant="secondary" className="text-xs">
              {recurringTemplates.length} recurring {recurringTemplates.length === 1 ? 'template' : 'templates'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <Select 
              value={effectiveUserId || ""} 
              onValueChange={setSelectedUserId}
            >
              <SelectTrigger className="w-48 h-8 text-xs" data-testid="select-diary-user">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {canViewOtherUsers && (
                  <SelectItem value="all">All Users</SelectItem>
                )}
                {currentUser && (
                  <SelectItem value={currentUser.id}>
                    {users.find(u => u.id === currentUser.id)?.displayName || "Me"}
                  </SelectItem>
                )}
                {canViewOtherUsers && users
                  .filter(u => u.id !== currentUser?.id)
                  .map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.displayName || "Unnamed User"}
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-8 gap-0 flex-1 border rounded-lg overflow-hidden">
            <div className="bg-muted/30 p-2">
              <Skeleton className="h-6 w-full" />
            </div>
            {DAYS_OF_WEEK.map((_, idx) => (
              <div key={idx} className="space-y-2 p-2 border-l">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden border rounded-lg flex flex-col">
            {/* Header Row with Day Names and Count Chips */}
            <div className="grid grid-cols-8 bg-muted/30 flex-shrink-0 border-b">
              <div className="p-2 text-xs font-medium text-muted-foreground text-center border-r">
                Time
              </div>
              {DAYS_OF_WEEK.map((_, dayIndex) => {
                const dayTemplates = getTemplatesForDay(dayIndex);
                const isToday = dayIndex === today;
                return (
                  <div 
                    key={dayIndex} 
                    className={`p-2 text-center border-r last:border-r-0 ${isToday ? 'bg-primary/10' : ''}`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`text-xs font-medium ${isToday ? 'text-primary' : ''}`}>
                        {SHORT_DAYS[dayIndex]}
                      </span>
                      {dayTemplates.length > 0 && (
                        <Badge 
                          variant={isToday ? "default" : "secondary"} 
                          className="text-[9px] px-1.5 py-0 h-4 min-w-4"
                        >
                          {dayTemplates.length}
                        </Badge>
                      )}
                    </div>
                    {isToday && (
                      <div className="text-[9px] text-primary mt-0.5">Today</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* All-Day Tasks Row - height matches half-hour bar (24px) */}
            <div className="grid grid-cols-8 border-b flex-shrink-0" style={{ minHeight: `${HOUR_HEIGHT / 2}px` }}>
              <div className="p-0.5 text-[9px] text-muted-foreground text-center border-r bg-muted/20 flex items-center justify-center">
                All Day
              </div>
              {DAYS_OF_WEEK.map((_, dayIndex) => {
                const allDayTemplates = getAllDayTemplates(dayIndex);
                const isToday = dayIndex === today;
                return (
                  <div 
                    key={dayIndex} 
                    className={`px-0.5 py-0.5 border-r last:border-r-0 flex items-center ${isToday ? 'bg-primary/5' : ''}`}
                    style={{ minHeight: `${HOUR_HEIGHT / 2}px` }}
                  >
                    <div className="flex flex-wrap gap-0.5 w-full">
                      {allDayTemplates.slice(0, 2).map((template) => (
                        <div
                          key={template.id}
                          className="text-[8px] px-1 py-0 rounded truncate border leading-tight max-w-full"
                          style={template.color ? { backgroundColor: template.color + '20', borderColor: template.color, color: template.color } : {}}
                          title={template.title}
                        >
                          {template.title}
                        </div>
                      ))}
                      {allDayTemplates.length > 2 && (
                        <span className="text-[8px] text-muted-foreground">
                          +{allDayTemplates.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Timeline Grid */}
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-8">
                {/* Time Column */}
                <div className="relative border-r bg-muted/10">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div
                      key={hour}
                      className="border-b text-[10px] text-muted-foreground pr-2 text-right flex items-start justify-end pt-0.5"
                      style={{ height: `${HOUR_HEIGHT}px` }}
                    >
                      {formatHour(hour)}
                    </div>
                  ))}
                </div>

                {/* Day Columns */}
                {DAYS_OF_WEEK.map((_, dayIndex) => {
                  const isToday = dayIndex === today;
                  return (
                    <div 
                      key={dayIndex} 
                      className={`relative border-r last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}
                    >
                      {/* Hour grid lines */}
                      {Array.from({ length: 24 }, (_, hour) => (
                        <div
                          key={hour}
                          className="border-b border-border/50"
                          style={{ height: `${HOUR_HEIGHT}px` }}
                        />
                      ))}

                      {/* Current time indicator (only for today) */}
                      {isToday && (
                        <div
                          className="absolute left-0 right-0 z-10 pointer-events-none"
                          style={{ top: `${currentTimeTop}px` }}
                        >
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <div className="flex-1 h-0.5 bg-red-500" />
                          </div>
                        </div>
                      )}

                      {/* Positioned templates with collision handling */}
                      {(() => {
                        const TASK_HEIGHT = HOUR_HEIGHT - 4;
                        const dayTemplates = getTemplatesForDay(dayIndex);
                        
                        // Get templates with times (from recurringSchedule or dueTime)
                        const timedTemplates = dayTemplates
                          .map((template) => {
                            const schedule = (template.recurringSchedule as RecurringScheduleItem[]) || [];
                            const daySchedule = schedule.find(s => s.dayOfWeek === dayIndex);
                            const timeStr = daySchedule?.startTime || template.dueTime;
                            const startHour = parseTime(timeStr);
                            if (startHour === null) return null;
                            
                            const duration = daySchedule?.duration || template.estimatedDuration || 60;
                            const heightPx = (duration / 60) * HOUR_HEIGHT;
                            
                            return {
                              ...template,
                              startHour,
                              duration,
                              timeStr,
                              top: startHour * HOUR_HEIGHT + 2,
                              bottom: startHour * HOUR_HEIGHT + 2 + Math.max(heightPx, TASK_HEIGHT),
                              heightPx: Math.max(heightPx, TASK_HEIGHT),
                            };
                          })
                          .filter(Boolean)
                          .sort((a, b) => a!.startHour - b!.startHour) as any[];
                        
                        // Detect visual overlaps based on actual pixel positions
                        // Using a greedy column assignment algorithm
                        const columns: typeof timedTemplates[] = [];
                        
                        timedTemplates.forEach(template => {
                          // Find the first column where this template doesn't overlap
                          let placed = false;
                          for (let colIdx = 0; colIdx < columns.length; colIdx++) {
                            const col = columns[colIdx];
                            const lastInCol = col[col.length - 1];
                            // Check if template starts after the last item in this column ends
                            if (template.top >= lastInCol.bottom) {
                              col.push(template);
                              placed = true;
                              break;
                            }
                          }
                          // If no existing column works, create a new one
                          if (!placed) {
                            columns.push([template]);
                          }
                        });
                        
                        // Assign column index to each template
                        const templateColumns = new Map<string, { colIdx: number; totalCols: number }>();
                        
                        // For each template, find which column it's in and how many columns overlap with it
                        timedTemplates.forEach(template => {
                          let colIdx = 0;
                          for (let c = 0; c < columns.length; c++) {
                            if (columns[c].some(t => t.id === template.id)) {
                              colIdx = c;
                              break;
                            }
                          }
                          
                          // Count how many columns have templates that overlap with this template's time range
                          let overlappingCols = 0;
                          for (let c = 0; c < columns.length; c++) {
                            const hasOverlap = columns[c].some(t => 
                              !(t.bottom <= template.top || t.top >= template.bottom)
                            );
                            if (hasOverlap) overlappingCols++;
                          }
                          
                          templateColumns.set(template.id, { colIdx, totalCols: Math.max(overlappingCols, 1) });
                        });

                        return timedTemplates.map((template: any) => {
                          const colInfo = templateColumns.get(template.id) || { colIdx: 0, totalCols: 1 };
                          const widthPercent = 100 / colInfo.totalCols;
                          const leftPercent = colInfo.colIdx * widthPercent;
                          
                          const assigneeName = template.assigneeUserName || template.defaultRoleName;

                          return (
                            <div
                              key={template.id}
                              className="absolute rounded text-[9px] px-1 py-0.5 overflow-hidden cursor-pointer hover:opacity-90 hover:z-20 border"
                              style={{ 
                                top: `${template.top}px`, 
                                height: `${template.heightPx}px`,
                                left: `calc(${leftPercent}% + 2px)`,
                                width: `calc(${widthPercent}% - 4px)`,
                                backgroundColor: template.color ? template.color + '20' : 'hsl(var(--primary) / 0.1)',
                                borderColor: template.color || 'hsl(var(--primary) / 0.3)',
                                color: template.color || 'hsl(var(--primary))',
                              }}
                              title={`${template.title}${template.timeStr ? ` @ ${template.timeStr}` : ''} (${template.duration}min)`}
                              data-testid={`diary-template-${template.id}`}
                            >
                              <div className="flex items-start gap-0.5">
                                <ListTodo className="h-2 w-2 flex-shrink-0 mt-0.5 opacity-60" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate leading-tight">{template.title}</div>
                                  {colInfo.totalCols === 1 && template.timeStr && (
                                    <div className="opacity-70 text-[8px]">{template.timeStr} ({template.duration}min)</div>
                                  )}
                                  {colInfo.totalCols === 1 && assigneeName && (
                                    <div className="opacity-70 truncate text-[8px]">{assigneeName}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {!isLoading && recurringTemplates.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center bg-background/80 p-6 rounded-lg">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <h3 className="text-sm font-medium mb-1">No Recurring Templates</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {effectiveUserId !== "all" 
                  ? "No active recurring templates found for this user. Create recurring templates from the Task Templates section."
                  : "No recurring templates have been set up yet. Create task templates and mark them as recurring to see them here."}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);
