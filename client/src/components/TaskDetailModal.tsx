import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Calendar,
  Clock,
  MapPin,
  FileText,
  User,
  ExternalLink,
  CheckCircle2,
  ListChecks,
  Flag,
  FolderOpen,
  Pencil,
  Trash2,
  CircleCheck,
  AlertTriangle,
  CalendarPlus,
} from "lucide-react";
import { format } from "date-fns";
import { getPriorityStyle } from "@/lib/priorityConfig";
import type { CalendarEvent } from "./EnhancedCalendar";
import type { Task, Project } from "@shared/schema";

type ChecklistItem = { id?: string; text: string; completed: boolean };

interface TaskDetailModalProps {
  event?: CalendarEvent | null;
  taskId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (task: Task) => void;
}

/** "14:00" -> "15:00", clamped so a late start can't roll past midnight. */
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const end = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${`${Math.floor(end / 60)}`.padStart(2, "0")}:${`${end % 60}`.padStart(2, "0")}`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function isEmptyHtmlContent(content: string | null | undefined): boolean {
  if (!content) return true;
  const stripped = content.replace(/<[^>]*>/g, '').trim();
  return stripped.length === 0;
}

export function TaskDetailModal({ event, taskId, open, onOpenChange, onEdit }: TaskDetailModalProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChecklistRef = useRef<ChecklistItem[] | null>(null);
  const mutationInFlightRef = useRef(false);

  // Determine which ID to use - taskId prop takes precedence
  // Strip 'task-' prefix from calendar event IDs to get actual task ID
  const rawTaskId = taskId || event?.id;
  const effectiveTaskId = rawTaskId?.startsWith('task-') ? rawTaskId.slice(5) : rawTaskId;
  const isTaskType = taskId ? true : event?.type === "task";

  // Fetch full task details if it's a task event or taskId is provided
  const { data: taskDetails } = useQuery<Task>({
    queryKey: ["/api/tasks", effectiveTaskId],
    enabled: open && isTaskType && !!effectiveTaskId,
  });

  // Time already booked against this schedule item, so it's clear who is turning up.
  const { data: bookings = [] } = useQuery<any[]>({
    queryKey: ["/api/schedule-items", event?.id, "bookings"],
    queryFn: () => apiRequest(`/api/schedule-items/${event?.id}/bookings`, "GET").catch(() => []),
    enabled: open && event?.type === "schedule" && !!event?.id,
  });

  // When the open task is itself a booking, the item it was booked against.
  const bookedAgainstId =
    taskDetails?.referenceType === "schedule_item_booking" ? taskDetails?.referenceId : null;
  const { data: bookedAgainstItem } = useQuery<any>({
    queryKey: ["/api/schedule-items", bookedAgainstId],
    queryFn: () => apiRequest(`/api/schedule-items/${bookedAgainstId}`, "GET").catch(() => null),
    enabled: open && !!bookedAgainstId,
  });

  // Fetch project details - use taskDetails.projectId when opened via taskId
  const projectIdForQuery = event?.projectId || taskDetails?.projectId;
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectIdForQuery],
    enabled: !!projectIdForQuery,
  });

  // Reset delete confirmation when task changes
  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [effectiveTaskId]);

  // Clean up any pending debounce and in-flight tracking when the viewed task
  // changes or the component unmounts, so a delayed callback cannot fire a
  // stale checklist payload against the wrong task.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingChecklistRef.current = null;
      mutationInFlightRef.current = false;
    };
  }, [effectiveTaskId]);

  // Sync local checklist state with task data.
  // Skip while a debounced save is pending OR a mutation is in-flight so no
  // background response can overwrite state the user is still working on.
  useEffect(() => {
    if (debounceTimerRef.current !== null || mutationInFlightRef.current) return;
    if (taskDetails?.checklist) {
      setChecklistItems(taskDetails.checklist as ChecklistItem[]);
    } else {
      setChecklistItems([]);
    }
  }, [taskDetails?.checklist]);

  // Mutation to update checklist
  const updateChecklistMutation = useMutation({
    mutationFn: async (newChecklist: ChecklistItem[]) => {
      if (!effectiveTaskId) return;
      mutationInFlightRef.current = true;
      return await apiRequest(`/api/tasks/${effectiveTaskId}`, "PATCH", { checklist: newChecklist });
    },
    onSuccess: (data) => {
      mutationInFlightRef.current = false;
      // Write the server response directly into the per-task cache rather than
      // triggering a full refetch that could race with local checklist state.
      if (effectiveTaskId && data) {
        queryClient.setQueryData(["/api/tasks", effectiveTaskId], (old: any) =>
          old ? { ...old, checklist: (data as any).checklist ?? old.checklist } : old
        );
      }
      // Still invalidate the flat list so task-list views (counts, badges) stay fresh.
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"], exact: true });
    },
    onError: (error: any) => {
      mutationInFlightRef.current = false;
      toast({
        title: "Failed to update checklist",
        description: error.message,
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", effectiveTaskId] });
    },
  });

  // Determine completion state from fresh task data when available
  const isTaskCompleted = taskDetails?.status === "done" || taskDetails?.status === "completed" || event?.isCompleted;

  // Mutation to mark task complete/incomplete
  const toggleCompleteMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveTaskId) return;
      // Use taskDetails for fresh state, fallback to event prop
      const currentlyCompleted = taskDetails?.status === "done" || taskDetails?.status === "completed" || event?.isCompleted;
      const newStatus = currentlyCompleted ? "todo" : "done";
      return await apiRequest(`/api/tasks/${effectiveTaskId}`, "PATCH", { status: newStatus });
    },
    onSuccess: (_, __, context) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-calendar-events"] });
      const wasCompleted = taskDetails?.status === "done" || taskDetails?.status === "completed" || event?.isCompleted;
      toast({
        title: wasCompleted ? "Task reopened" : "Task completed",
        description: wasCompleted ? "Task marked as incomplete" : "Great job!",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to delete task
  // Books an hour of the viewer's own time against this schedule item, as a linked
  // task. Deliberately not "assign me to the item": a five-day work bar would then
  // occupy five days of calendar for what is really a one-hour commitment.
  //
  // Must stay above the `if (!event && !taskId) return null` guard below — hooks
  // cannot sit after an early return, or the hook count changes between renders
  // and React tears the tree down ("Rendered more hooks than during the previous
  // render"). Times are read from `event` inside mutationFn rather than from the
  // display variables, which are only computed past that guard.
  const bookTimeMutation = useMutation({
    mutationFn: async () => {
      // Inherit the item's own times when it has them (an inspection at 9), else
      // a sensible default the user can then drag on the calendar.
      const start = event?.startTime || "09:00";
      const end = event?.endTime || addOneHour(start);
      return await apiRequest(`/api/schedule-items/${event?.id}/book-time`, "POST", {
        startTime: start,
        endTime: end,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-items/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-items", event?.id, "bookings"] });
      toast({
        title: "Time booked",
        description: "Added to your calendar. Drag it to adjust.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to book time",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveTaskId) return;
      return await apiRequest(`/api/tasks/${effectiveTaskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-calendar-events"] });
      toast({
        title: "Task deleted",
        description: "The task has been removed",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleChecklistItem = (itemIndex: number) => {
    // Functional updater ensures rapid successive clicks always operate on the
    // latest local state rather than a stale closure snapshot.
    setChecklistItems(prev => {
      const newChecklist = prev.map((item, idx) =>
        idx === itemIndex ? { ...item, completed: !item.completed } : item
      );
      pendingChecklistRef.current = newChecklist;
      return newChecklist;
    });

    // Debounce: reset the timer on each click so a burst of quick checks
    // collapses into a single PATCH with the final state.
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (pendingChecklistRef.current !== null) {
        updateChecklistMutation.mutate(pendingChecklistRef.current);
        pendingChecklistRef.current = null;
      }
    }, 500);
  };

  // If no event and no taskId, nothing to show
  if (!event && !taskId) return null;

  // When only taskId is provided, we treat it as a task
  const isGoogleCalendar = event?.type === "google-calendar";
  const isTask = taskId ? true : event?.type === "task";
  const isSchedule = event?.type === "schedule";
  const isMeeting = event?.type === "meeting";

  // Get display values - use taskDetails when available, fallback to event
  const displayTitle = taskDetails?.title || event?.title || "Task";
  const displayProjectId = taskDetails?.projectId || event?.projectId;
  const displayDescription = taskDetails?.description || event?.description || null;
  const displayStartDate = taskDetails?.dueDate || event?.startDate;
  const displayStartTime = event?.startTime;
  const displayEndTime = event?.endTime;
  const displayStatus = taskDetails?.status || event?.status;
  const displayLocation = event?.location;
  const bookingStart = displayStartTime || "09:00";

  const handleNavigate = () => {
    if (isTask && displayProjectId) {
      navigate(`/projects/${displayProjectId}/tasks`);
      onOpenChange(false);
    } else if (isSchedule && displayProjectId) {
      navigate(`/projects/${displayProjectId}/schedule`);
      onOpenChange(false);
    } else if (isMeeting && displayProjectId) {
      navigate(`/projects/${displayProjectId}/minutes`);
      onOpenChange(false);
    }
  };

  const formatEventDate = (date: Date) => {
    return format(new Date(date), "EEEE, MMMM d, yyyy");
  };

  const formatTime = (time: string | null | undefined) => {
    if (!time) return null;
    return time;
  };

  const priority = taskDetails?.priority || "none";
  const priorityInfo = getPriorityStyle(priority);
  const checklistProgress = checklistItems.length > 0 
    ? (checklistItems.filter(item => item.completed).length / checklistItems.length) * 100 
    : 0;

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) setShowDeleteConfirm(false);
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-2xl" data-testid="calendar-event-detail-dialog">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
                {displayTitle}
                {isGoogleCalendar && (
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                    style={{ borderColor: '#4285f4', color: '#4285f4' }}
                  >
                    Google Calendar
                  </Badge>
                )}
              </DialogTitle>
              {project && (
                <DialogDescription className="mt-1 flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" />
                  {project.name}
                </DialogDescription>
              )}
            </div>
            {/* Status and Priority Badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {isTask && priority && priority !== "none" && (
                <Badge 
                  variant="outline" 
                  className="text-xs flex items-center gap-1"
                  style={{ 
                    borderColor: priorityInfo.color, 
                    color: priorityInfo.color,
                    backgroundColor: priorityInfo.bgColor 
                  }}
                  data-testid="priority-badge"
                >
                  <Flag className="h-3 w-3" />
                  {priorityInfo.label}
                </Badge>
              )}
              {displayStatus && (
                <Badge 
                  variant={isTaskCompleted ? "default" : "secondary"}
                  data-testid="status-badge"
                >
                  {isTaskCompleted && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {displayStatus}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Quick Actions Bar for Tasks */}
        {isTask && (
          <div className="flex items-center gap-2 py-2 border-b">
            <Button
              size="sm"
              variant={isTaskCompleted ? "outline" : "default"}
              onClick={() => toggleCompleteMutation.mutate()}
              disabled={toggleCompleteMutation.isPending}
              data-testid="toggle-complete-button"
            >
              {isTaskCompleted ? (
                <>
                  <CircleCheck className="h-4 w-4 mr-1.5" />
                  Reopen Task
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Mark Complete
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (onEdit && taskDetails) {
                  onEdit(taskDetails);
                  onOpenChange(false);
                } else if (displayProjectId) {
                  handleNavigate();
                }
              }}
              data-testid="edit-task-button"
            >
              <Pencil className="h-4 w-4 mr-1.5" />
              Edit
            </Button>
            {!showDeleteConfirm ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="delete-task-button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-muted-foreground mr-1">Delete?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteTaskMutation.mutate()}
                  disabled={deleteTaskMutation.isPending}
                  data-testid="confirm-delete-button"
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="cancel-delete-button"
                >
                  No
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 mt-4">
          {/* Date and Time */}
          {displayStartDate && (
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{formatEventDate(new Date(displayStartDate))}</p>
                {(displayStartTime || displayEndTime) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(displayStartTime)}
                    {displayEndTime && ` - ${formatTime(displayEndTime)}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Assignee with Avatar (for tasks) */}
          {isTask && taskDetails?.assigneeName && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div className="flex items-center gap-2 flex-1">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(taskDetails.assigneeName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{taskDetails.assigneeName}</p>
                    <p className="text-xs text-muted-foreground">Assignee</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Location (for Google Calendar events) */}
          {isGoogleCalendar && displayLocation && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Location</p>
                  <p className="text-sm text-muted-foreground mt-1">{displayLocation}</p>
                </div>
              </div>
            </>
          )}

          {/* Description */}
          {((isGoogleCalendar && displayDescription) || (isTask && taskDetails?.content && !isEmptyHtmlContent(taskDetails.content))) && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Description</p>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">
                    {isGoogleCalendar ? displayDescription : taskDetails?.content}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Checklist with Progress Bar (for tasks) */}
          {isTask && checklistItems.length > 0 && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <ListChecks className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">Checklist</p>
                    <span className="text-xs text-muted-foreground">
                      {checklistItems.filter(item => item.completed).length} of {checklistItems.length} complete
                    </span>
                  </div>
                  <Progress value={checklistProgress} className="h-2 mb-3" />
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {checklistItems.map((item, index) => (
                      <label 
                        key={item.id || index} 
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded p-1.5 -ml-1"
                        data-testid={`checklist-item-${index}`}
                      >
                        <Checkbox 
                          checked={item.completed}
                          onCheckedChange={() => handleToggleChecklistItem(index)}
                          data-testid={`checkbox-checklist-item-${index}`}
                        />
                        <span className={item.completed ? 'line-through text-muted-foreground' : ''}>
                          {item.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Read-only notice for Google Calendar */}
          {/* Time already committed to this schedule item */}
          {isSchedule && bookings.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                  <Clock className="h-3.5 w-3.5" />
                  Booked time
                </div>
                <div className="space-y-1.5" data-testid="schedule-item-bookings">
                  {bookings.map((booking: any) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded px-2 py-1.5"
                    >
                      <span className="truncate">
                        {(booking.assigneeNames || []).join(", ") || booking.title}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {booking.startTime && booking.endTime
                          ? `${booking.startTime}–${booking.endTime}`
                          : "no time set"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* This task is itself time booked against a schedule item */}
          {bookedAgainstItem && (
            <>
              <Separator />
              <div className="flex items-start gap-2">
                <CalendarPlus className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Booked against</div>
                  <button
                    className="text-sm font-medium hover:underline text-left truncate"
                    onClick={() => {
                      const pid = bookedAgainstItem.projectId || displayProjectId;
                      if (pid) {
                        navigate(`/projects/${pid}/schedule`);
                        onOpenChange(false);
                      }
                    }}
                    data-testid="booked-against-link"
                  >
                    {bookedAgainstItem.name}
                  </button>
                </div>
              </div>
            </>
          )}

          {isGoogleCalendar && (
            <>
              <Separator />
              <div className="bg-muted/50 p-3 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  This is a read-only event from your Google Calendar. To make changes, please edit it in Google Calendar.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer Action Buttons */}
        <div className="flex justify-end gap-2 mt-6">
          {event?.type === "task" && taskDetails && onEdit && (
            <Button 
              variant="default" 
              onClick={() => {
                onOpenChange(false);
                onEdit(taskDetails);
              }} 
              data-testid="edit-task-button"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {isSchedule && event?.id && (
            <Button
              variant="default"
              onClick={() => bookTimeMutation.mutate()}
              disabled={bookTimeMutation.isPending}
              title={`Adds ${bookingStart}–${displayEndTime || addOneHour(bookingStart)} to your calendar, linked to this item`}
              data-testid="book-my-time"
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              {bookTimeMutation.isPending ? "Booking…" : "Book my time"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-event-detail">
            Close
          </Button>
          {(isSchedule || isMeeting) && displayProjectId && (
            <Button onClick={handleNavigate} data-testid="go-to-event">
              <ExternalLink className="h-4 w-4 mr-2" />
              {isSchedule && "Go to Schedule"}
              {isMeeting && "Go to Meetings"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
