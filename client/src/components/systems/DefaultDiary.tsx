import { useState, forwardRef, useImperativeHandle } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, Repeat, User } from "lucide-react";
import { format } from "date-fns";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

interface User {
  id: string;
  displayName: string;
  profileImageUrl?: string;
}

export interface DefaultDiaryHandle {
  refresh: () => void;
}

interface DefaultDiaryProps {
  searchQuery?: string;
}

export const DefaultDiary = forwardRef<DefaultDiaryHandle, DefaultDiaryProps>(
  function DefaultDiary({ searchQuery = "" }, ref) {
    const [selectedUserId, setSelectedUserId] = useState<string>("all");

    const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
      queryKey: ["/api/users"],
    });

    const { data: allTasks = [], isLoading: tasksLoading, refetch } = useQuery<any[]>({
      queryKey: ["/api/tasks"],
    });

    useImperativeHandle(ref, () => ({
      refresh: () => refetch(),
    }));

    const recurringTasks = allTasks.filter((task: any) => 
      task.isRecurring && 
      task.status !== "done" && 
      task.status !== "completed" &&
      (selectedUserId === "all" || task.assigneeId === selectedUserId) &&
      (searchQuery === "" || task.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const getTasksForDay = (dayIndex: number) => {
      return recurringTasks.filter((task: any) => {
        const recurringDays = task.recurringDays || [];
        return recurringDays.includes(dayIndex);
      });
    };

    const getPriorityColor = (priority?: string) => {
      switch (priority) {
        case "high": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
        case "medium": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
        case "low": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
        default: return "bg-muted text-muted-foreground";
      }
    };

    const isLoading = usersLoading || tasksLoading;

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
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-48 h-8 text-xs" data-testid="select-diary-user">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.displayName || "Unnamed User"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-7 gap-2 flex-1">
            {DAYS_OF_WEEK.map((_, idx) => (
              <div key={idx} className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2 flex-1 overflow-hidden">
            {DAYS_OF_WEEK.map((dayName, dayIndex) => {
              const dayTasks = getTasksForDay(dayIndex);
              const today = new Date().getDay();
              const isToday = dayIndex === today;

              return (
                <div 
                  key={dayIndex} 
                  className={`flex flex-col min-w-0 rounded-lg border ${
                    isToday ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  data-testid={`diary-day-${dayIndex}`}
                >
                  <div className={`text-center py-2 border-b flex-shrink-0 ${
                    isToday ? 'bg-primary/10' : 'bg-muted/30'
                  }`}>
                    <div className="text-xs font-medium">
                      {SHORT_DAYS[dayIndex]}
                    </div>
                    {isToday && (
                      <Badge variant="default" className="text-[9px] px-1 py-0 mt-0.5">
                        Today
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                    {dayTasks.length === 0 ? (
                      <div className="text-center py-4 text-xs text-muted-foreground">
                        No tasks
                      </div>
                    ) : (
                      dayTasks.map((task: any) => {
                        const assignee = users.find(u => u.id === task.assigneeId);
                        return (
                          <Card
                            key={task.id}
                            className="p-2 cursor-pointer hover-elevate"
                            data-testid={`diary-task-${task.id}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <Repeat className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{task.title}</p>
                                
                                {task.dueTime && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground">
                                      {task.dueTime}
                                    </span>
                                  </div>
                                )}
                                
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  {task.priority && (
                                    <Badge 
                                      variant="secondary" 
                                      className={`text-[9px] px-1 py-0 ${getPriorityColor(task.priority)}`}
                                    >
                                      {task.priority}
                                    </Badge>
                                  )}
                                  {assignee && selectedUserId === "all" && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                                      {assignee.displayName?.split(' ')[0] || 'Unassigned'}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && recurringTasks.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <h3 className="text-sm font-medium mb-1">No Recurring Tasks</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {selectedUserId !== "all" 
                  ? "This user has no active recurring tasks. Try selecting a different user or 'All Users'."
                  : "No recurring tasks have been set up yet. Create recurring tasks from the Task Templates section."}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);
