import { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarDays, Clock, Repeat, User } from "lucide-react";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_HEIGHT = 48;

interface RecurringTask {
  id: number;
  title: string;
  description?: string;
  recurringDays: number[];
  recurringType: string;
  recurringInterval: number;
  assigneeId?: string;
  dueTime?: string;
  priority?: string;
  status: string;
}

interface UserType {
  id: string;
  displayName: string;
  profileImageUrl?: string;
  roleId?: string;
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

    const { data: allTasks = [], isLoading: tasksLoading, refetch } = useQuery<any[]>({
      queryKey: ["/api/tasks"],
    });

    // Fetch role permissions to check if current user can view other users
    const { data: rolePermissions = [] } = useQuery<RolePermission[]>({
      queryKey: ["/api/role-permissions"],
      enabled: !!currentUser?.roleId,
    });

    // Check if current user can view team calendars (other users' diaries)
    const canViewOtherUsers = useMemo(() => {
      if (!currentUser?.roleId) return false;
      const teamCalendarPermission = rolePermissions.find(
        (rp) => rp.roleId === currentUser.roleId && 
        (rp.permissionId === "perm-projects-team_calendars" || rp.permissionId === "3276c3cc-4911-4847-84ec-6330e267f163")
      );
      return !!teamCalendarPermission;
    }, [currentUser?.roleId, rolePermissions]);

    // Default to current user when loaded
    useEffect(() => {
      if (currentUser?.id && selectedUserId === null) {
        setSelectedUserId(currentUser.id);
      }
    }, [currentUser?.id, selectedUserId]);

    useImperativeHandle(ref, () => ({
      refresh: () => refetch(),
    }));

    const effectiveUserId = selectedUserId || currentUser?.id;

    const recurringTasks = allTasks.filter((task: any) => 
      task.isRecurring && 
      task.status !== "done" && 
      task.status !== "completed" &&
      (effectiveUserId === "all" || task.assigneeId === effectiveUserId) &&
      (searchQuery === "" || task.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const getTasksForDay = (dayIndex: number) => {
      return recurringTasks.filter((task: any) => {
        const recurringDays = task.recurringDays || [];
        return recurringDays.includes(dayIndex);
      });
    };

    const getTasksForDayAndHour = (dayIndex: number, hour: number) => {
      const dayTasks = getTasksForDay(dayIndex);
      return dayTasks.filter((task: any) => {
        const startHour = parseTime(task.dueTime);
        if (startHour === null) return false;
        return Math.floor(startHour) === hour;
      });
    };

    const getAllDayTasks = (dayIndex: number) => {
      const dayTasks = getTasksForDay(dayIndex);
      return dayTasks.filter((task: any) => {
        const startHour = parseTime(task.dueTime);
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

    const isLoading = usersLoading || tasksLoading;
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
              {recurringTasks.length} recurring {recurringTasks.length === 1 ? 'task' : 'tasks'}
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
                const dayTasks = getTasksForDay(dayIndex);
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
                      {dayTasks.length > 0 && (
                        <Badge 
                          variant={isToday ? "default" : "secondary"} 
                          className="text-[9px] px-1.5 py-0 h-4 min-w-4"
                        >
                          {dayTasks.length}
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

            {/* All-Day Tasks Row */}
            <div className="grid grid-cols-8 border-b flex-shrink-0">
              <div className="p-1 text-[10px] text-muted-foreground text-center border-r bg-muted/20 flex items-center justify-center">
                All Day
              </div>
              {DAYS_OF_WEEK.map((_, dayIndex) => {
                const allDayTasks = getAllDayTasks(dayIndex);
                const isToday = dayIndex === today;
                return (
                  <div 
                    key={dayIndex} 
                    className={`p-1 border-r last:border-r-0 min-h-[40px] ${isToday ? 'bg-primary/5' : ''}`}
                  >
                    <div className="space-y-0.5">
                      {allDayTasks.slice(0, 3).map((task: any) => (
                        <div
                          key={task.id}
                          className={`text-[9px] px-1 py-0.5 rounded truncate border ${getPriorityColor(task.priority)}`}
                          title={task.title}
                        >
                          {task.title}
                        </div>
                      ))}
                      {allDayTasks.length > 3 && (
                        <div className="text-[9px] text-muted-foreground px-1">
                          +{allDayTasks.length - 3} more
                        </div>
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

                      {/* Positioned tasks with collision handling */}
                      {(() => {
                        const TASK_HEIGHT = HOUR_HEIGHT - 4;
                        const timedTasks = getTasksForDay(dayIndex)
                          .filter((task: any) => parseTime(task.dueTime) !== null)
                          .map((task: any) => {
                            const startHour = parseTime(task.dueTime)!;
                            return {
                              ...task,
                              startHour,
                              top: startHour * HOUR_HEIGHT + 2,
                              bottom: startHour * HOUR_HEIGHT + 2 + TASK_HEIGHT,
                            };
                          })
                          .sort((a, b) => a.startHour - b.startHour);
                        
                        // Detect visual overlaps based on actual pixel positions
                        // Using a greedy column assignment algorithm
                        const columns: typeof timedTasks[] = [];
                        
                        timedTasks.forEach(task => {
                          // Find the first column where this task doesn't overlap
                          let placed = false;
                          for (let colIdx = 0; colIdx < columns.length; colIdx++) {
                            const col = columns[colIdx];
                            const lastInCol = col[col.length - 1];
                            // Check if task starts after the last item in this column ends
                            if (task.top >= lastInCol.bottom) {
                              col.push(task);
                              placed = true;
                              break;
                            }
                          }
                          // If no existing column works, create a new one
                          if (!placed) {
                            columns.push([task]);
                          }
                        });
                        
                        // Assign column index to each task
                        const taskColumns = new Map<number, { colIdx: number; totalCols: number }>();
                        
                        // For each task, find which column it's in and how many columns overlap with it
                        timedTasks.forEach(task => {
                          let colIdx = 0;
                          for (let c = 0; c < columns.length; c++) {
                            if (columns[c].some(t => t.id === task.id)) {
                              colIdx = c;
                              break;
                            }
                          }
                          
                          // Count how many columns have tasks that overlap with this task's time range
                          let overlappingCols = 0;
                          for (let c = 0; c < columns.length; c++) {
                            const hasOverlap = columns[c].some(t => 
                              !(t.bottom <= task.top || t.top >= task.bottom)
                            );
                            if (hasOverlap) overlappingCols++;
                          }
                          
                          taskColumns.set(task.id, { colIdx, totalCols: Math.max(overlappingCols, 1) });
                        });

                        return timedTasks.map((task: any) => {
                          const colInfo = taskColumns.get(task.id) || { colIdx: 0, totalCols: 1 };
                          const widthPercent = 100 / colInfo.totalCols;
                          const leftPercent = colInfo.colIdx * widthPercent;
                          
                          const assignee = effectiveUserId === "all" 
                            ? users.find(u => u.id === task.assigneeId) 
                            : null;

                          return (
                            <div
                              key={task.id}
                              className={`absolute rounded text-[9px] px-1 py-0.5 overflow-hidden cursor-pointer hover:opacity-90 hover:z-20 border ${getPriorityColor(task.priority)}`}
                              style={{ 
                                top: `${task.top}px`, 
                                height: `${TASK_HEIGHT}px`,
                                left: `calc(${leftPercent}% + 2px)`,
                                width: `calc(${widthPercent}% - 4px)`,
                              }}
                              title={`${task.title}${task.dueTime ? ` @ ${task.dueTime}` : ''}`}
                              data-testid={`diary-task-${task.id}`}
                            >
                              <div className="flex items-start gap-0.5">
                                <Repeat className="h-2 w-2 flex-shrink-0 mt-0.5 opacity-60" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate leading-tight">{task.title}</div>
                                  {colInfo.totalCols === 1 && task.dueTime && (
                                    <div className="opacity-70 text-[8px]">{task.dueTime}</div>
                                  )}
                                  {colInfo.totalCols === 1 && assignee && (
                                    <div className="opacity-70 truncate text-[8px]">{assignee.displayName?.split(' ')[0]}</div>
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

        {!isLoading && recurringTasks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center bg-background/80 p-6 rounded-lg">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <h3 className="text-sm font-medium mb-1">No Recurring Tasks</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {effectiveUserId !== "all" 
                  ? "No active recurring tasks found. Create recurring tasks from the Task Templates section."
                  : "No recurring tasks have been set up yet. Create recurring tasks from the Task Templates section."}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);
