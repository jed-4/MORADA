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
  CalendarDays,
  Timer,
  Bell,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { generateNotionColors } from "@/lib/taskColors";
import type { CalendarItem } from "@/components/user-workspace/widgets/usePersonalCalendarEvents";

interface EventDetailModalProps {
  event: CalendarItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeColorMap: Record<string, string> = {
  schedule: "#10b981",
  timesheet: "#f59e0b",
  reminder: "#a855f7",
  "google-calendar": "#7aafff",
};

const typeLabelMap: Record<string, string> = {
  schedule: "Schedule Item",
  timesheet: "Timesheet Entry",
  reminder: "Reminder",
  "google-calendar": "Google Calendar",
};

const typeIconMap: Record<string, React.ReactNode> = {
  schedule: <CalendarDays className="h-4 w-4" />,
  timesheet: <Timer className="h-4 w-4" />,
  reminder: <Bell className="h-4 w-4" />,
  "google-calendar": <Calendar className="h-4 w-4" />,
};

export function EventDetailModal({ event, open, onOpenChange }: EventDetailModalProps) {
  const [, navigate] = useLocation();

  if (!event) return null;

  const color = typeColorMap[event.type] || "#6b7280";
  const label = typeLabelMap[event.type] || event.type;
  const notionColors = generateNotionColors(color);

  const formatEventDate = (date: Date) => {
    return format(new Date(date), "EEEE, MMMM d, yyyy");
  };

  const handleNavigateToProject = () => {
    if (!event.projectId) return;
    if (event.type === "schedule") {
      navigate(`/projects/${event.projectId}/schedule`);
    } else {
      navigate(`/projects/${event.projectId}`);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
          style={{ backgroundColor: notionColors.originalHex }}
        />
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
                {event.title}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-1.5">
                {event.projectName ? (
                  <>
                    <FolderOpen className="h-3.5 w-3.5" />
                    {event.projectName}
                  </>
                ) : (
                  <span>{label} details</span>
                )}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className="text-xs flex items-center gap-1 flex-shrink-0"
              style={{
                borderColor: notionColors.originalHex,
                color: notionColors.originalHex,
              }}
            >
              {typeIconMap[event.type]}
              {label}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{formatEventDate(event.startDate)}</p>
              {(event.startTime || event.endTime) && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3" />
                  {event.startTime}
                  {event.endTime && ` - ${event.endTime}`}
                </p>
              )}
            </div>
          </div>

          {event.type === "google-calendar" && event.location && (
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

          {event.description && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Description</p>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-6">
                    {event.description}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {event.projectId && (
            <Button onClick={handleNavigateToProject}>
              <ExternalLink className="h-4 w-4 mr-2" />
              {event.type === "schedule" && "Go to Schedule"}
              {event.type === "timesheet" && "Go to Project"}
              {event.type !== "schedule" && event.type !== "timesheet" && "Go to Project"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
