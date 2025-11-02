import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { 
  Calendar,
  Clock,
  MapPin,
  FileText,
  User,
  ExternalLink,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { format } from "date-fns";
import type { CalendarEvent } from "./EnhancedCalendar";
import type { Task, Project } from "@shared/schema";

interface CalendarEventDetailDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarEventDetailDialog({ event, open, onOpenChange }: CalendarEventDetailDialogProps) {
  const [, navigate] = useLocation();

  // Fetch project details if the event has a projectId
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", event?.projectId],
    enabled: !!event?.projectId,
  });

  // Fetch full task details if it's a task event
  const { data: taskDetails } = useQuery<Task>({
    queryKey: ["/api/tasks", event?.id],
    enabled: open && event?.type === "task",
  });

  if (!event) return null;

  const isGoogleCalendar = event.type === "google-calendar";
  const isTask = event.type === "task";
  const isSchedule = event.type === "schedule";
  const isMeeting = event.type === "meeting";

  const handleNavigate = () => {
    if (isTask && event.projectId) {
      navigate(`/projects/${event.projectId}/tasks`);
      onOpenChange(false);
    } else if (isSchedule && event.projectId) {
      navigate(`/projects/${event.projectId}/schedule`);
      onOpenChange(false);
    } else if (isMeeting && event.projectId) {
      navigate(`/projects/${event.projectId}/minutes`);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="calendar-event-detail-dialog">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                {event.title}
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
                <DialogDescription className="mt-1">
                  {project.name}
                </DialogDescription>
              )}
            </div>
            {event.status && (
              <Badge variant={event.isCompleted ? "default" : "secondary"}>
                {event.isCompleted ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : null}
                {event.status}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Date and Time */}
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{formatEventDate(event.startDate)}</p>
              {(event.startTime || event.endTime) && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(event.startTime)}
                  {event.endTime && ` - ${formatTime(event.endTime)}`}
                </p>
              )}
            </div>
          </div>

          {/* Location (for Google Calendar events) */}
          {isGoogleCalendar && event.location && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Location</p>
                  <p className="text-sm text-muted-foreground mt-1">{event.location}</p>
                </div>
              </div>
            </>
          )}

          {/* Description */}
          {(isGoogleCalendar && event.description) || (isTask && taskDetails?.content) && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Description</p>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {isGoogleCalendar ? event.description : taskDetails?.content}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Assignee (for tasks) */}
          {isTask && taskDetails?.assigneeName && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Assigned to</p>
                  <p className="text-sm text-muted-foreground mt-1">{taskDetails.assigneeName}</p>
                </div>
              </div>
            </>
          )}

          {/* Checklist (for tasks) */}
          {isTask && taskDetails?.checklist && (taskDetails.checklist as Array<{text: string; completed: boolean}>).length > 0 && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <ListChecks className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">Checklist</p>
                    <Badge variant="secondary" className="text-xs">
                      {(taskDetails.checklist as Array<{text: string; completed: boolean}>).filter(item => item.completed).length}/
                      {(taskDetails.checklist as Array<{text: string; completed: boolean}>).length} complete
                    </Badge>
                  </div>
                  <div className="space-y-1 mt-2">
                    {(taskDetails.checklist as Array<{text: string; completed: boolean}>).map((item, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        {item.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        <span className={item.completed ? 'line-through text-muted-foreground' : ''}>
                          {item.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Read-only notice for Google Calendar */}
          {isGoogleCalendar && (
            <>
              <Separator />
              <div className="bg-muted/50 p-3 rounded-md">
                <p className="text-xs text-muted-foreground">
                  This is a read-only event from your Google Calendar. To make changes, please edit it in Google Calendar.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-event-detail">
            Close
          </Button>
          {(isTask || isSchedule || isMeeting) && event.projectId && (
            <Button onClick={handleNavigate} data-testid="go-to-event">
              <ExternalLink className="h-4 w-4 mr-2" />
              {isTask && "Go to Task Board"}
              {isSchedule && "Go to Schedule"}
              {isMeeting && "Go to Meetings"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
