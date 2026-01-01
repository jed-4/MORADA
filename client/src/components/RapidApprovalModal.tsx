import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Check, X, Clock, ChevronLeft, ChevronRight, RotateCcw, Pencil, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet, Project, User as UserType, CostCode } from "@shared/schema";

interface RapidApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingTimesheets: Timesheet[];
  projects: Project[];
  users: UserType[];
  costCodes: CostCode[];
  onComplete?: () => void;
}

// Generate time slots in 15-min increments (00:00 - 23:45)
const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Round time string to nearest 15 min (e.g., "11:11" -> "11:15")
const roundTimeTo15Min = (time: string): string => {
  if (!time || !time.includes(':')) return time;
  const [hours, mins] = time.split(':').map(Number);
  const roundedMins = Math.round(mins / 15) * 15;
  const adjustedHours = roundedMins === 60 ? (hours + 1) % 24 : hours;
  const adjustedMins = roundedMins === 60 ? 0 : roundedMins;
  return `${adjustedHours.toString().padStart(2, '0')}:${adjustedMins.toString().padStart(2, '0')}`;
};

// Calculate hours between two time strings
const calculateHoursBetween = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins < startMins) endMins += 24 * 60; // Handle overnight
  return Math.max(0, (endMins - startMins) / 60);
};

// Time Picker Popover Component - styled like Select dropdowns
function TimePicker({ 
  value, 
  onChange, 
  label 
}: { 
  value: string; 
  onChange: (time: string) => void; 
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (open && scrollRef.current && value) {
      const index = TIME_SLOTS.findIndex(t => t === value);
      if (index >= 0) {
        setTimeout(() => {
          const element = scrollRef.current?.querySelector(`[data-time="${value}"]`);
          element?.scrollIntoView({ block: 'center' });
        }, 50);
      }
    }
  }, [open, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-between h-7 px-2 text-[11px] bg-background border border-input rounded-md hover:bg-accent hover:text-accent-foreground min-w-[55px]">
          <span>{value || "--:--"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-24 p-0" align="center">
        <div 
          ref={scrollRef}
          className="max-h-48 overflow-y-scroll overscroll-contain p-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {TIME_SLOTS.map((time) => (
            <button
              key={time}
              data-time={time}
              onClick={() => { onChange(time); setOpen(false); }}
              className={`w-full px-2 py-1.5 text-[11px] text-center rounded hover:bg-muted ${
                time === value ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {time}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function RapidApprovalModal({
  open,
  onOpenChange,
  pendingTimesheets,
  projects,
  users,
  costCodes,
  onComplete,
}: RapidApprovalModalProps) {
  const { toast } = useToast();
  
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Editable fields
  const [editedStartTime, setEditedStartTime] = useState<string>("");
  const [editedEndTime, setEditedEndTime] = useState<string>("");
  const [editedBreakStart, setEditedBreakStart] = useState<string>("");
  const [editedBreak, setEditedBreak] = useState<string>("0");
  const [editedDate, setEditedDate] = useState<Date | undefined>();
  const [editedProjectId, setEditedProjectId] = useState<string>("");
  const [editedCostCodeId, setEditedCostCodeId] = useState<string>("");
  const [editedDescription, setEditedDescription] = useState<string>("");
  const [rejectionComment, setRejectionComment] = useState<string>("");
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isCommentExpanded, setIsCommentExpanded] = useState(false);

  const remainingTimesheets = useMemo(() => 
    pendingTimesheets.filter(ts => !processedIds.has(ts.id)),
    [pendingTimesheets, processedIds]
  );

  const currentTimesheet = remainingTimesheets[currentIndex];

  useEffect(() => {
    if (open) {
      setProcessedIds(new Set());
      setCurrentIndex(0);
      setRejectionComment("");
      setIsCommentExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    if (currentTimesheet) {
      setEditedStartTime(currentTimesheet.startTime || "");
      setEditedEndTime(currentTimesheet.endTime || "");
      setEditedBreakStart(""); // Not stored in DB yet
      setEditedBreak(currentTimesheet.breakDuration || "0");
      setEditedDate(new Date(currentTimesheet.date));
      setEditedProjectId(currentTimesheet.projectId);
      setEditedCostCodeId(currentTimesheet.costCodeId || "");
      setEditedDescription(currentTimesheet.description || "");
      setRejectionComment("");
      setIsDescriptionExpanded(false);
      setIsCommentExpanded(false);
    }
  }, [currentTimesheet?.id]);

  useEffect(() => {
    if (remainingTimesheets.length === 0) return;
    if (currentIndex >= remainingTimesheets.length) {
      setCurrentIndex(Math.max(0, remainingTimesheets.length - 1));
    }
  }, [remainingTimesheets.length, currentIndex]);

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return "Unknown User";
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    return user.email || "Unknown User";
  };

  const handleRoundTimes = () => {
    setEditedStartTime(roundTimeTo15Min(editedStartTime));
    setEditedEndTime(roundTimeTo15Min(editedEndTime));
  };

  // Calculate duration based on start/end times
  const calculatedDuration = useMemo(() => {
    return calculateHoursBetween(editedStartTime, editedEndTime);
  }, [editedStartTime, editedEndTime]);

  const parsedBreak = parseFloat(editedBreak) || 0;
  const netHours = Math.max(0, calculatedDuration - parsedBreak);
  const rate = parseFloat(currentTimesheet?.hourlyRate || "0");
  const calculatedTotal = (netHours * rate).toFixed(2);

  const getMissingInfo = () => {
    if (!currentTimesheet) return [];
    const issues: string[] = [];
    if (!editedCostCodeId) issues.push("No cost code");
    if (!editedDescription.trim()) issues.push("No description");
    if (calculatedDuration === 0) issues.push("Zero hours");
    if (calculatedDuration > 12) issues.push("Over 12 hours");
    return issues;
  };

  const updateMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      startTime?: string;
      endTime?: string;
      duration: string; 
      breakDuration: string;
      date?: string;
      projectId?: string;
      costCodeId?: string | null;
      description?: string;
    }) => {
      const hours = parseFloat(data.duration) || 0;
      const breakHours = parseFloat(data.breakDuration) || 0;
      const netHoursCalc = Math.max(0, hours - breakHours);
      const rateVal = parseFloat(currentTimesheet?.hourlyRate || "0");
      const total = (netHoursCalc * rateVal).toFixed(2);
      
      const res = await apiRequest(`/api/timesheets/${data.id}`, "PATCH", {
        ...data,
        total,
      });
      return await res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      const hasChanges = currentTimesheet && (
        editedStartTime !== (currentTimesheet.startTime || "") ||
        editedEndTime !== (currentTimesheet.endTime || "") ||
        editedBreak !== (currentTimesheet.breakDuration || "0") ||
        format(editedDate!, "yyyy-MM-dd") !== currentTimesheet.date ||
        editedProjectId !== currentTimesheet.projectId ||
        editedCostCodeId !== (currentTimesheet.costCodeId || "") ||
        editedDescription !== (currentTimesheet.description || "")
      );
      
      if (hasChanges && editedDate) {
        await updateMutation.mutateAsync({
          id: timesheetId,
          startTime: editedStartTime,
          endTime: editedEndTime,
          duration: calculatedDuration.toFixed(2),
          breakDuration: editedBreak,
          date: format(editedDate, "yyyy-MM-dd"),
          projectId: editedProjectId,
          costCodeId: editedCostCodeId || null,
          description: editedDescription,
        });
      }
      const res = await apiRequest(`/api/timesheets/${timesheetId}/approve`, "POST", {});
      return await res.json();
    },
    onSuccess: (_, timesheetId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setProcessedIds(prev => new Set([...prev, timesheetId]));
      
      const newRemaining = remainingTimesheets.length - 1;
      if (newRemaining > 0) {
        toast({ title: "Approved", description: `${newRemaining} remaining.` });
      } else {
        toast({ title: "All done!", description: "All pending timesheets reviewed." });
        onOpenChange(false);
        onComplete?.();
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      const res = await apiRequest(`/api/timesheets/${timesheetId}/reject`, "POST", { 
        comment: rejectionComment || undefined 
      });
      return await res.json();
    },
    onSuccess: (_, timesheetId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setProcessedIds(prev => new Set([...prev, timesheetId]));
      
      const newRemaining = remainingTimesheets.length - 1;
      if (newRemaining > 0) {
        toast({ title: "Rejected", description: `${newRemaining} remaining.` });
      } else {
        toast({ title: "All done!", description: "All pending timesheets reviewed." });
        onOpenChange(false);
        onComplete?.();
      }
    },
  });

  const handlePrev = () => currentIndex > 0 && setCurrentIndex(prev => prev - 1);
  const handleNext = () => currentIndex < remainingTimesheets.length - 1 && setCurrentIndex(prev => prev + 1);

  if (!currentTimesheet) {
    if (open && remainingTimesheets.length === 0) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-[380px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                All Done!
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 text-center text-sm text-muted-foreground">
              All pending timesheets have been processed.
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} size="sm">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    return null;
  }

  const missingInfo = getMissingInfo();
  const hasMissingInfo = missingInfo.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="text-xs font-normal text-muted-foreground">
              {currentIndex + 1}/{remainingTimesheets.length}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Rapid Approval
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {hasMissingInfo && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-[10px]">
              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-amber-700 dark:text-amber-300">{missingInfo.join(" • ")}</span>
            </div>
          )}

          {/* Team Member */}
          <div className="flex items-center justify-between px-2 py-1 bg-muted/30 rounded">
            <span className="text-[11px] text-muted-foreground">Team Member</span>
            <span className="text-[11px] font-medium">{getUserName(currentTimesheet.userId)}</span>
          </div>

          {/* Time Row: Actual times on left | Round | Pickers | Hours */}
          <div className="flex items-center justify-between px-2 py-1 bg-muted/30 rounded">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Time:</span>
              <span className="text-[11px] font-medium">{editedStartTime || "--:--"} - {editedEndTime || "--:--"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRoundTimes}
                title="Round times to 15 minutes"
                data-testid="button-round-times"
                className="flex items-center gap-1 h-7 px-2 text-[11px] bg-background border border-input rounded-md hover:bg-accent hover:text-accent-foreground"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Round
              </button>
              <TimePicker value={editedStartTime} onChange={setEditedStartTime} label="Start" />
              <span className="text-[11px] text-muted-foreground">-</span>
              <TimePicker value={editedEndTime} onChange={setEditedEndTime} label="End" />
              <span className="text-[11px] font-medium min-w-[40px] text-right">
                {calculatedDuration.toFixed(2)}h
              </span>
            </div>
          </div>

          {/* Break Row with start time on right */}
          <div className="flex items-center justify-between px-2 py-1 bg-muted/30 rounded">
            <span className="text-[11px] text-muted-foreground">Break:</span>
            <div className="flex items-center gap-1.5">
              <TimePicker value={editedBreakStart} onChange={setEditedBreakStart} label="Start" />
              <input
                type="number"
                step="0.25"
                value={editedBreak}
                onChange={(e) => setEditedBreak(e.target.value)}
                className="h-7 w-14 px-2 text-[11px] text-center bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-rapid-break"
              />
              <span className="text-[11px] text-muted-foreground">hrs</span>
            </div>
          </div>

          {/* Date, Project, Cost Code - Compact Grid */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-[10px] text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center justify-between w-full h-7 px-2 text-[11px] bg-background border border-input rounded-md hover:bg-accent hover:text-accent-foreground">
                    <span>{editedDate ? format(editedDate, "dd MMM") : "Select"}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editedDate}
                    onSelect={setEditedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground">Project</Label>
              <Select value={editedProjectId} onValueChange={setEditedProjectId}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id} className="text-[11px]">
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground">Cost Code</Label>
              <Select value={editedCostCodeId || "none"} onValueChange={(val) => setEditedCostCodeId(val === "none" ? "" : val)}>
                <SelectTrigger className={`h-7 text-[11px] ${!editedCostCodeId ? "border-amber-300" : ""}`}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-[11px] text-muted-foreground">None</SelectItem>
                  {costCodes.map((code) => (
                    <SelectItem key={code.id} value={code.id} className="text-[11px]">
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description - 2 line preview */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <Label className="text-[10px] text-muted-foreground">Description</Label>
              <Popover open={isDescriptionExpanded} onOpenChange={setIsDescriptionExpanded}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-4 px-1 text-[10px] gap-0.5">
                    <Pencil className="w-2 h-2" />
                    Edit
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Edit Description</Label>
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="min-h-[80px] text-[11px]"
                      placeholder="Enter description..."
                    />
                    <Button 
                      size="sm" 
                      className="w-full h-6 text-[11px]"
                      onClick={() => setIsDescriptionExpanded(false)}
                    >
                      Done
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div 
              className={`px-2 py-1 bg-muted/30 rounded text-[11px] min-h-[28px] ${!editedDescription ? "text-muted-foreground italic" : ""}`}
              style={{ 
                display: "-webkit-box", 
                WebkitLineClamp: 2, 
                WebkitBoxOrient: "vertical", 
                overflow: "hidden" 
              }}
            >
              {editedDescription || "No description"}
            </div>
          </div>

          {/* Net Hours / Total - Comment Button OUTSIDE the bubble */}
          <div className="flex items-center gap-2">
            <Popover open={isCommentExpanded} onOpenChange={setIsCommentExpanded}>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`h-6 w-6 p-0 ${rejectionComment ? "text-amber-600" : "text-muted-foreground"}`}
                  title="Add comment"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Comment (for rejection)</Label>
                  <Textarea
                    value={rejectionComment}
                    onChange={(e) => setRejectionComment(e.target.value)}
                    className="min-h-[60px] text-[11px]"
                    placeholder="e.g., Not enough info..."
                  />
                  <Button 
                    size="sm" 
                    className="w-full h-6 text-[11px]"
                    onClick={() => setIsCommentExpanded(false)}
                  >
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex-1 flex items-center justify-between px-2 py-1 bg-[#bba7db]/10 rounded border border-[#bba7db]/30">
              <span className="text-[11px] font-medium">Net Hours / Total</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium">{netHours.toFixed(2)} hrs</span>
                <span className="text-[11px] font-bold text-[#bba7db]">${calculatedTotal}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between pt-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              data-testid="button-rapid-prev"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handleNext}
              disabled={currentIndex === remainingTimesheets.length - 1}
              data-testid="button-rapid-next"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => rejectMutation.mutate(currentTimesheet.id)}
              disabled={rejectMutation.isPending}
              className="h-7 gap-1 text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
              data-testid="button-rapid-reject"
            >
              <X className="w-3 h-3" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => approveMutation.mutate(currentTimesheet.id)}
              disabled={approveMutation.isPending || updateMutation.isPending}
              className="h-7 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-rapid-approve"
            >
              <Check className="w-3 h-3" />
              {remainingTimesheets.length > 1 ? "Approve & Next" : "Approve"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
