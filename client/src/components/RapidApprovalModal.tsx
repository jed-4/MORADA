import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Check, X, Clock, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
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
  
  // Track processed (approved/rejected) IDs locally to filter them out
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedHours, setEditedHours] = useState<string>("");
  const [editedBreak, setEditedBreak] = useState<string>("");

  // Filter out already processed timesheets
  const remainingTimesheets = useMemo(() => 
    pendingTimesheets.filter(ts => !processedIds.has(ts.id)),
    [pendingTimesheets, processedIds]
  );

  const currentTimesheet = remainingTimesheets[currentIndex];

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setProcessedIds(new Set());
      setCurrentIndex(0);
    }
  }, [open]);

  // Update edited values when current timesheet changes
  useEffect(() => {
    if (currentTimesheet) {
      setEditedHours(currentTimesheet.duration || "0");
      setEditedBreak(currentTimesheet.breakDuration || "0");
    }
  }, [currentTimesheet?.id]);

  // Ensure index stays within bounds
  useEffect(() => {
    if (remainingTimesheets.length === 0) {
      return;
    }
    if (currentIndex >= remainingTimesheets.length) {
      setCurrentIndex(Math.max(0, remainingTimesheets.length - 1));
    }
  }, [remainingTimesheets.length, currentIndex]);

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || user?.email || "Unknown User";
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  const getCostCodeName = (costCodeId?: string | null) => {
    if (!costCodeId) return null;
    const costCode = costCodes.find(c => c.id === costCodeId);
    return costCode ? `${costCode.code} - ${costCode.name}` : null;
  };

  // Round to 15 minutes (0.25 hours)
  const roundTo15Min = (hours: string) => {
    const h = parseFloat(hours) || 0;
    return (Math.round(h * 4) / 4).toFixed(2);
  };

  // Check for missing/incomplete info - use edited hours for duration checks
  const getMissingInfo = () => {
    if (!currentTimesheet) return [];
    const issues: string[] = [];
    if (!currentTimesheet.costCodeId) issues.push("No cost code assigned");
    if (!currentTimesheet.description) issues.push("No description");
    
    // Use edited hours for validation
    const duration = parseFloat(editedHours) || 0;
    if (duration === 0) issues.push("Zero hours");
    if (duration > 12) issues.push("Over 12 hours");
    if (duration < 0.25 && duration !== 0) issues.push("Less than 15 minutes");
    // Check if hours don't align to 15min
    const remainder = (duration * 4) % 1;
    if (remainder > 0.01) issues.push("Hours not rounded to 15min");
    return issues;
  };

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; duration: string; breakDuration: string }) => {
      const hours = parseFloat(data.duration) || 0;
      const rate = parseFloat(currentTimesheet?.hourlyRate || "0");
      const total = (hours * rate).toFixed(2);
      
      const res = await apiRequest(`/api/timesheets/${data.id}`, "PATCH", {
        duration: data.duration,
        breakDuration: data.breakDuration,
        total,
      });
      return await res.json();
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      // First update hours if edited
      if (currentTimesheet && (editedHours !== currentTimesheet.duration || editedBreak !== currentTimesheet.breakDuration)) {
        await updateMutation.mutateAsync({
          id: timesheetId,
          duration: editedHours,
          breakDuration: editedBreak,
        });
      }
      const res = await apiRequest(`/api/timesheets/${timesheetId}/approve`, "POST", {});
      return await res.json();
    },
    onSuccess: (_, timesheetId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      
      // Mark as processed locally
      setProcessedIds(prev => new Set([...prev, timesheetId]));
      
      const newRemaining = remainingTimesheets.length - 1;
      if (newRemaining > 0) {
        toast({
          title: "Approved",
          description: `Timesheet approved. ${newRemaining} remaining.`,
        });
      } else {
        toast({
          title: "All done!",
          description: "All pending timesheets have been reviewed.",
        });
        onOpenChange(false);
        onComplete?.();
      }
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      const res = await apiRequest(`/api/timesheets/${timesheetId}/reject`, "POST", {});
      return await res.json();
    },
    onSuccess: (_, timesheetId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      
      // Mark as processed locally
      setProcessedIds(prev => new Set([...prev, timesheetId]));
      
      const newRemaining = remainingTimesheets.length - 1;
      if (newRemaining > 0) {
        toast({
          title: "Rejected",
          description: `Timesheet rejected. ${newRemaining} remaining.`,
        });
      } else {
        toast({
          title: "All done!",
          description: "All pending timesheets have been reviewed.",
        });
        onOpenChange(false);
        onComplete?.();
      }
    },
  });

  const handleRoundHours = () => {
    setEditedHours(roundTo15Min(editedHours));
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < remainingTimesheets.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  // No remaining timesheets or dialog not open
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
  const costCodeName = getCostCodeName(currentTimesheet.costCodeId);
  const parsedHours = parseFloat(editedHours) || 0;
  const rate = parseFloat(currentTimesheet.hourlyRate || "0");
  const calculatedTotal = (parsedHours * rate).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
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

        <div className="space-y-4 py-2">
          {hasMissingInfo && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-300">Needs attention:</p>
                <ul className="mt-1 text-amber-600 dark:text-amber-400 text-xs">
                  {missingInfo.map((issue, i) => (
                    <li key={i}>• {issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
              <span className="text-xs text-muted-foreground">Date</span>
              <span className="text-sm font-medium">{format(new Date(currentTimesheet.date), "EEE, dd MMM yyyy")}</span>
            </div>

            <div className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
              <span className="text-xs text-muted-foreground">Team Member</span>
              <span className="text-sm font-medium">{getUserName(currentTimesheet.userId)}</span>
            </div>

            <div className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
              <span className="text-xs text-muted-foreground">Project</span>
              <span className="text-sm font-medium">{getProjectName(currentTimesheet.projectId)}</span>
            </div>

            <div className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
              <span className="text-xs text-muted-foreground">Cost Code</span>
              <span className={`text-sm font-medium ${!costCodeName ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {costCodeName || "Not assigned"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2 bg-muted/30 rounded-md">
              <span className="text-xs text-muted-foreground">Time</span>
              <span className="text-sm font-medium">
                {currentTimesheet.startTime} - {currentTimesheet.endTime}
              </span>
            </div>

            {currentTimesheet.description && (
              <div className="p-2 bg-muted/30 rounded-md">
                <span className="text-xs text-muted-foreground block mb-1">Description</span>
                <p className="text-sm">{currentTimesheet.description}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Hours</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.25"
                  value={editedHours}
                  onChange={(e) => setEditedHours(e.target.value)}
                  className="h-9 text-sm"
                  data-testid="input-rapid-hours"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 flex-shrink-0"
                  onClick={handleRoundHours}
                  title="Round to 15 minutes"
                  data-testid="button-round-hours"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Break (hrs)</Label>
              <Input
                type="number"
                step="0.25"
                value={editedBreak}
                onChange={(e) => setEditedBreak(e.target.value)}
                className="h-9 text-sm"
                data-testid="input-rapid-break"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Total</Label>
              <div className="h-9 px-3 flex items-center bg-muted/50 rounded-md text-sm font-semibold">
                ${calculatedTotal}
              </div>
            </div>
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
