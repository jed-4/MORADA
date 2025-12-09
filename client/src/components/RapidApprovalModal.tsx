import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertTriangle, Check, X, Clock, ChevronLeft, ChevronRight, RotateCcw, CalendarIcon, ChevronUp, ChevronDown, Pencil } from "lucide-react";
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
  const [editedHours, setEditedHours] = useState<string>("");
  const [editedBreak, setEditedBreak] = useState<string>("");
  const [editedDate, setEditedDate] = useState<Date | undefined>();
  const [editedProjectId, setEditedProjectId] = useState<string>("");
  const [editedCostCodeId, setEditedCostCodeId] = useState<string>("");
  const [editedDescription, setEditedDescription] = useState<string>("");
  const [rejectionComment, setRejectionComment] = useState<string>("");
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

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
    }
  }, [open]);

  useEffect(() => {
    if (currentTimesheet) {
      setEditedHours(currentTimesheet.duration || "0");
      setEditedBreak(currentTimesheet.breakDuration || "0");
      setEditedDate(new Date(currentTimesheet.date));
      setEditedProjectId(currentTimesheet.projectId);
      setEditedCostCodeId(currentTimesheet.costCodeId || "");
      setEditedDescription(currentTimesheet.description || "");
      setRejectionComment("");
      setIsDescriptionExpanded(false);
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
    return user?.name || user?.email || "Unknown User";
  };

  const roundTo15Min = (hours: string) => {
    const h = parseFloat(hours) || 0;
    return (Math.round(h * 4) / 4).toFixed(2);
  };

  const adjustHours = (delta: number) => {
    const current = parseFloat(editedHours) || 0;
    const newVal = Math.max(0, current + delta);
    setEditedHours(newVal.toFixed(2));
  };

  const adjustBreak = (delta: number) => {
    const current = parseFloat(editedBreak) || 0;
    const newVal = Math.max(0, current + delta);
    setEditedBreak(newVal.toFixed(2));
  };

  const getMissingInfo = () => {
    if (!currentTimesheet) return [];
    const issues: string[] = [];
    if (!editedCostCodeId) issues.push("No cost code assigned");
    if (!editedDescription.trim()) issues.push("No description");
    
    const duration = parseFloat(editedHours) || 0;
    if (duration === 0) issues.push("Zero hours");
    if (duration > 12) issues.push("Over 12 hours");
    if (duration < 0.25 && duration !== 0) issues.push("Less than 15 minutes");
    const remainder = (duration * 4) % 1;
    if (remainder > 0.01) issues.push("Hours not rounded to 15min");
    return issues;
  };

  const updateMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      duration: string; 
      breakDuration: string;
      date?: string;
      projectId?: string;
      costCodeId?: string | null;
      description?: string;
    }) => {
      const hours = parseFloat(data.duration) || 0;
      const breakHours = parseFloat(data.breakDuration) || 0;
      const netHours = Math.max(0, hours - breakHours);
      const rate = parseFloat(currentTimesheet?.hourlyRate || "0");
      const total = (netHours * rate).toFixed(2);
      
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
        editedHours !== currentTimesheet.duration ||
        editedBreak !== currentTimesheet.breakDuration ||
        format(editedDate!, "yyyy-MM-dd") !== currentTimesheet.date ||
        editedProjectId !== currentTimesheet.projectId ||
        editedCostCodeId !== (currentTimesheet.costCodeId || "") ||
        editedDescription !== (currentTimesheet.description || "")
      );
      
      if (hasChanges && editedDate) {
        await updateMutation.mutateAsync({
          id: timesheetId,
          duration: editedHours,
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
        toast({ title: "Approved", description: `Timesheet approved. ${newRemaining} remaining.` });
      } else {
        toast({ title: "All done!", description: "All pending timesheets have been reviewed." });
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
        toast({ title: "Rejected", description: `Timesheet rejected. ${newRemaining} remaining.` });
      } else {
        toast({ title: "All done!", description: "All pending timesheets have been reviewed." });
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
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                All Done!
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 text-center text-sm text-muted-foreground">
              All pending timesheets have been processed.
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    return null;
  }

  const missingInfo = getMissingInfo();
  const hasMissingInfo = missingInfo.length > 0;
  const parsedHours = parseFloat(editedHours) || 0;
  const parsedBreak = parseFloat(editedBreak) || 0;
  const netHours = Math.max(0, parsedHours - parsedBreak);
  const rate = parseFloat(currentTimesheet.hourlyRate || "0");
  const calculatedTotal = (netHours * rate).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Rapid Approval
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {currentIndex + 1} of {remainingTimesheets.length}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {hasMissingInfo && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-300">Needs attention:</p>
                <ul className="mt-0.5 text-amber-600 dark:text-amber-400">
                  {missingInfo.map((issue, i) => (
                    <li key={i}>• {issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Team Member - Read Only */}
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
            <span className="text-xs text-muted-foreground">Team Member</span>
            <span className="text-sm font-medium">{getUserName(currentTimesheet.userId)}</span>
          </div>

          {/* Time Row: Clock In/Out on left, Round button + Hours on right */}
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Time:</span>
              <span className="text-sm font-medium">
                {currentTimesheet.startTime || "--:--"} - {currentTimesheet.endTime || "--:--"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setEditedHours(roundTo15Min(editedHours))}
                title="Round to 15 minutes"
                data-testid="button-round-hours"
              >
                <RotateCcw className="w-3 h-3" />
                Round
              </Button>
              <div className="flex items-center border rounded-md">
                <Input
                  type="number"
                  step="0.25"
                  value={editedHours}
                  onChange={(e) => setEditedHours(e.target.value)}
                  className="h-7 w-16 text-xs text-center border-0 focus-visible:ring-0"
                  data-testid="input-rapid-hours"
                />
                <div className="flex flex-col border-l">
                  <button 
                    onClick={() => adjustHours(0.25)} 
                    className="h-3.5 px-1 hover:bg-muted"
                    data-testid="button-hours-up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => adjustHours(-0.25)} 
                    className="h-3.5 px-1 hover:bg-muted"
                    data-testid="button-hours-down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">hrs</span>
            </div>
          </div>

          {/* Break Row - Same styling as Time */}
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
            <span className="text-xs text-muted-foreground">Break</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md">
                <Input
                  type="number"
                  step="0.25"
                  value={editedBreak}
                  onChange={(e) => setEditedBreak(e.target.value)}
                  className="h-7 w-16 text-xs text-center border-0 focus-visible:ring-0"
                  data-testid="input-rapid-break"
                />
                <div className="flex flex-col border-l">
                  <button 
                    onClick={() => adjustBreak(0.25)} 
                    className="h-3.5 px-1 hover:bg-muted"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => adjustBreak(-0.25)} 
                    className="h-3.5 px-1 hover:bg-muted"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">hrs</span>
            </div>
          </div>

          {/* Editable Fields: Date, Project, Cost Code */}
          <div className="grid grid-cols-3 gap-2">
            {/* Date */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-7 text-xs justify-start gap-1 px-2">
                    <CalendarIcon className="w-3 h-3" />
                    {editedDate ? format(editedDate, "dd MMM") : "Select"}
                  </Button>
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

            {/* Project */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Project</Label>
              <Select value={editedProjectId} onValueChange={setEditedProjectId}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id} className="text-xs">
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cost Code */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Cost Code</Label>
              <Select value={editedCostCodeId || "none"} onValueChange={(val) => setEditedCostCodeId(val === "none" ? "" : val)}>
                <SelectTrigger className={`h-7 text-xs ${!editedCostCodeId ? "border-amber-300" : ""}`}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs text-muted-foreground">None</SelectItem>
                  {costCodes.map((code) => (
                    <SelectItem key={code.id} value={code.id} className="text-xs">
                      {code.code} - {code.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description - 2 line preview with expand */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">Description</Label>
              <Popover open={isDescriptionExpanded} onOpenChange={setIsDescriptionExpanded}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] gap-1">
                    <Pencil className="w-2.5 h-2.5" />
                    Edit
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-2">
                    <Label className="text-xs">Edit Description</Label>
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="min-h-[100px] text-xs"
                      placeholder="Enter description..."
                    />
                    <Button 
                      size="sm" 
                      className="w-full h-7 text-xs"
                      onClick={() => setIsDescriptionExpanded(false)}
                    >
                      Done
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div 
              className={`p-2 bg-muted/30 rounded-md text-xs min-h-[40px] ${!editedDescription ? "text-muted-foreground italic" : ""}`}
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

          {/* Total */}
          <div className="flex items-center justify-between p-2 bg-[#bba7db]/10 rounded-md border border-[#bba7db]/30">
            <span className="text-xs font-medium">Net Hours / Total</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{netHours.toFixed(2)} hrs</span>
              <span className="text-sm font-bold text-[#bba7db]">${calculatedTotal}</span>
            </div>
          </div>

          {/* Rejection Comment */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Comment (optional - for rejection)</Label>
            <Input
              value={rejectionComment}
              onChange={(e) => setRejectionComment(e.target.value)}
              placeholder="e.g., Not enough info, wrong project..."
              className="h-7 text-xs"
              data-testid="input-rejection-comment"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              data-testid="button-rapid-prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleNext}
              disabled={currentIndex === remainingTimesheets.length - 1}
              data-testid="button-rapid-next"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => rejectMutation.mutate(currentTimesheet.id)}
              disabled={rejectMutation.isPending}
              className="gap-1.5 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
              data-testid="button-rapid-reject"
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => approveMutation.mutate(currentTimesheet.id)}
              disabled={approveMutation.isPending || updateMutation.isPending}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-rapid-approve"
            >
              <Check className="w-3.5 h-3.5" />
              {remainingTimesheets.length > 1 ? "Approve & Next" : "Approve"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
