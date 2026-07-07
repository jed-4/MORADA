import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Bell,
  Check,
  Clock,
  AlertTriangle,
  X,
  ChevronDown,
} from "lucide-react";
import { useTimesheetLabelOptions } from "@/hooks/useTimesheetLabelOptions";
import { useAuth } from "@/hooks/use-auth";
import { SetReminderDialog } from "@/components/SetReminderDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProjectSelect } from "@/components/ProjectSelect";
import { UserSelect } from "@/components/UserSelect";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { TimeSelect } from "@/components/ui/time-select";
import type { Timesheet, Project, User as UserType, CostCode, CompanySettings } from "@shared/schema";

const timesheetSchema = z.object({
  projectId: z.string().optional(),
  userId: z.string().min(1, "User is required"),
  date: z.date(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  duration: z.string().optional(),
  breakDuration: z.string().optional(),
  breakStartTime: z.string().optional(),
  breakEndTime: z.string().optional(),
  description: z.string().optional(),
  hourlyRate: z.string().optional(),
  costCodeId: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

type TimesheetFormData = z.infer<typeof timesheetSchema>;

interface CostCodeSplit {
  id: string;
  dbId?: string;
  costCodeId: string;
  duration: string;
  hourlyRate: string;
  total: string;
}

interface TimesheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timesheet?: Timesheet;
  defaultProjectId?: string;
  readonly?: boolean;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

// Token-based label chip styles, keyed by label key from the field-categories API
function getLabelChipClasses(key: string, isSelected: boolean): string {
  if (!isSelected) {
    return "bg-muted/30 text-muted-foreground border-border";
  }
  switch (key) {
    case "overtime":
      return "bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))] border-[hsl(var(--coral))]/30";
    case "travel":
      return "bg-[hsl(var(--amber-bg))] text-[hsl(var(--amber))] border-[hsl(var(--amber))]/30";
    case "meeting":
      return "bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))] border-[hsl(var(--sage))]/30";
    case "regular":
    case "training":
    case "site-visit":
    default:
      return "bg-primary/10 text-primary border-primary/30";
  }
}

export function TimesheetDialog({
  open,
  onOpenChange,
  timesheet,
  defaultProjectId,
  readonly = false,
  onNavigatePrev,
  onNavigateNext,
  hasPrev,
  hasNext,
}: TimesheetDialogProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { data: canViewTimesheetRates = false } = useQuery<boolean>({
    queryKey: ["/api/user/can-view-timesheet-rates"],
  });
  const { data: canApproveTimesheets = false } = useQuery<boolean>({
    queryKey: ["/api/user/can-approve-timesheets"],
  });
  const [isSplit, setIsSplit] = useState(false);
  const [lastEditedField, setLastEditedField] = useState<"startTime" | "endTime" | "duration" | "breakDuration" | null>(null);
  const [costCodeSplits, setCostCodeSplits] = useState<CostCodeSplit[]>([]);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [showBreakTimes, setShowBreakTimes] = useState(false);
  const [showCostCodeSplit, setShowCostCodeSplit] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Drawer mount/animation state
  const [isMounted, setIsMounted] = useState(open);
  const [isShown, setIsShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      // next frame to allow transition from translate-x-full
      const id = window.requestAnimationFrame(() => setIsShown(true));
      return () => window.cancelAnimationFrame(id);
    } else {
      setIsShown(false);
      const t = window.setTimeout(() => setIsMounted(false), 320);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Focus the panel when it opens (lightweight focus management — full focus
  // trap would interfere with the spec's "table arrow-key navigation" pattern).
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open, timesheet?.id]);

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch users
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Fetch cost codes
  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  // Fetch company settings for standard work hours
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const breakDurationOptions = (() => {
    const options: { value: string; label: string }[] = [];
    for (let minutes = 0; minutes <= 600; minutes += 15) {
      const hours = minutes / 60;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const label = h === 0 && m === 0 ? "None" : h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
      options.push({ value: hours.toString(), label });
    }
    return options;
  })();

  const form = useForm<TimesheetFormData>({
    resolver: zodResolver(timesheetSchema),
    defaultValues: {
      projectId: defaultProjectId || "",
      userId: "",
      date: new Date(),
      startTime: "",
      endTime: "",
      duration: "",
      breakDuration: "0",
      breakStartTime: "",
      breakEndTime: "",
      description: "",
      hourlyRate: "50",
      costCodeId: "",
      labels: [],
    },
  });

  const { labelOptions } = useTimesheetLabelOptions();
  const watchedLabels = form.watch("labels") || [];

  // Stable watched values for bi-directional time calculation
  const watchedStartTime = useWatch({ control: form.control, name: "startTime" });
  const watchedEndTime = useWatch({ control: form.control, name: "endTime" });
  const watchedDuration = useWatch({ control: form.control, name: "duration" });
  const watchedBreakDuration = useWatch({ control: form.control, name: "breakDuration" });
  const watchedBreakStartTime = useWatch({ control: form.control, name: "breakStartTime" });
  const watchedBreakEndTime = useWatch({ control: form.control, name: "breakEndTime" });
  const watchedHourlyRate = form.watch("hourlyRate");

  const toggleLabel = (labelKey: string) => {
    const current = form.getValues("labels") || [];
    if (current.includes(labelKey)) {
      form.setValue("labels", current.filter(l => l !== labelKey));
    } else {
      form.setValue("labels", [...current, labelKey]);
    }
  };

  // Populate form when editing an existing timesheet
  useEffect(() => {
    if (open && timesheet) {
      setLastEditedField(null);
      form.reset({
        projectId: timesheet.projectId || "",
        userId: timesheet.userId || "",
        date: new Date(timesheet.date),
        startTime: timesheet.startTime || "",
        endTime: timesheet.endTime || "",
        duration: timesheet.duration ? parseFloat(timesheet.duration.toString()).toString() : "",
        breakDuration: timesheet.breakDuration ? parseFloat(timesheet.breakDuration.toString()).toString() : "0",
        breakStartTime: timesheet.breakStartTime || "",
        breakEndTime: timesheet.breakEndTime || "",
        description: timesheet.description || "",
        hourlyRate: (timesheet.hourlyRate && parseFloat(timesheet.hourlyRate.toString()) > 0) ? parseFloat(timesheet.hourlyRate.toString()).toString() : "",
        costCodeId: timesheet.costCodeId || "",
        labels: (timesheet.labels as string[]) || [],
      });
      // Load existing cost-code splits
      const existingSplits = (timesheet as any).costCodeSplits as any[] | undefined;
      if (existingSplits && existingSplits.length > 0) {
        setCostCodeSplits(
          existingSplits.map((s: any) => ({
            id: s.id,
            dbId: s.id,
            costCodeId: s.costCodeId || "",
            duration: s.duration?.toString() || "",
            hourlyRate: s.hourlyRate?.toString() || "50",
            total: s.total?.toString() || "0",
          }))
        );
        setIsSplit(true);
        setShowCostCodeSplit(true);
      } else {
        setCostCodeSplits([]);
        setIsSplit(false);
        setShowCostCodeSplit(false);
      }
    } else if (open && !timesheet) {
      setLastEditedField(null);
      form.reset({
        projectId: defaultProjectId || "",
        userId: currentUser?.id || "",
        date: new Date(),
        startTime: "",
        endTime: "",
        duration: "",
        breakDuration: "0",
        breakStartTime: "",
        breakEndTime: "",
        description: "",
        hourlyRate: "50",
        costCodeId: "",
        labels: [],
      });
    }
  }, [open, timesheet, defaultProjectId, currentUser, form]);

  // Reset labels and rejection state on close
  useEffect(() => {
    if (!open) {
      setShowLabels(false);
      setShowRejectInput(false);
      setRejectionReason("");
    }
  }, [open]);

  // Helper: Parse time string to minutes
  const timeToMinutes = (time: string): number => {
    const [hour, min] = time.split(":").map(Number);
    return hour * 60 + min;
  };

  // Helper: Convert minutes to time string (handles >24h)
  const minutesToTime = (totalMinutes: number): string => {
    let minutes = totalMinutes % (24 * 60);
    if (minutes < 0) minutes += 24 * 60;
    const hour = Math.floor(minutes / 60);
    const min = minutes % 60;
    return `${hour.toString().padStart(2, '0')}:${String(Math.round(min / 15) * 15).padStart(2, '0')}`;
  };

  // Bi-directional time calculation using stable useWatch values
  useEffect(() => {
    const startTime = watchedStartTime;
    const endTime = watchedEndTime;
    const duration = watchedDuration;
    const breakDuration = parseFloat(watchedBreakDuration || "0");

    // Calculate duration from start + end (when start or end or break changes)
    if ((lastEditedField === "startTime" || lastEditedField === "endTime" || lastEditedField === "breakDuration") && startTime && endTime) {
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);

      let totalMinutes = endMinutes - startMinutes;
      if (totalMinutes < 0) totalMinutes += 24 * 60; // Handle overnight shifts

      const hours = (totalMinutes / 60) - breakDuration;
      const roundedHours = Math.max(0, Math.round(hours * 4) / 4);

      form.setValue("duration", roundedHours.toString());
    }
    // Calculate end time from start + duration
    else if (lastEditedField === "duration" && startTime && duration) {
      const durationHours = parseFloat(duration) || 0;
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + ((durationHours + breakDuration) * 60);
      const calculatedEnd = minutesToTime(endMinutes);
      form.setValue("endTime", calculatedEnd);
    }
  }, [watchedStartTime, watchedEndTime, watchedDuration, watchedBreakDuration, lastEditedField]);

  // Auto-calculate break duration from break start/end times
  useEffect(() => {
    if (watchedBreakStartTime && watchedBreakEndTime) {
      const startMinutes = timeToMinutes(watchedBreakStartTime);
      const endMinutes = timeToMinutes(watchedBreakEndTime);

      let totalMinutes = endMinutes - startMinutes;
      if (totalMinutes < 0) totalMinutes += 24 * 60;

      const hours = Math.round((totalMinutes / 60) * 4) / 4;
      form.setValue("breakDuration", hours.toString());
      setLastEditedField("breakDuration");
    }
  }, [watchedBreakStartTime, watchedBreakEndTime]);

  // Create/Update mutation
  const createMutation = useMutation({
    mutationFn: async (data: TimesheetFormData) => {
      if (!isSplit && !data.costCodeId) {
        form.setError("costCodeId", { message: "Cost code is required" });
        throw new Error("Please select a cost code");
      }
      if (isSplit && costCodeSplits.length === 0) {
        throw new Error("Please add at least one cost code split");
      }

      const duration = parseFloat(data.duration || "0");
      const selectedUser = users.find((u: any) => u.id === data.userId);
      const isSubcontractor = selectedUser?.isSubcontractor === true;
      const hourlyRate = isSubcontractor ? 0 : parseFloat(data.hourlyRate || "0");
      const total = (duration * hourlyRate).toFixed(2);

      const timesheetData = {
        projectId: data.projectId || null,
        userId: data.userId,
        date: data.date,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        duration: duration.toString(),
        breakDuration: data.breakDuration || "0",
        breakStartTime: data.breakStartTime || null,
        breakEndTime: data.breakEndTime || null,
        description: data.description || null,
        hourlyRate: hourlyRate.toString(),
        total: total,
        status: "submitted",
        invoiced: false,
        labels: data.labels || [],
        costCodeId: isSplit ? null : (data.costCodeId || null),
      };

      if (timesheet) {
        const res = await apiRequest(
          `/api/timesheets/${timesheet.id}`,
          "PATCH",
          timesheetData
        );
        // Sync splits: delete all existing DB splits then recreate
        const existingSplits = (timesheet as any).costCodeSplits as any[] | undefined;
        if (existingSplits && existingSplits.length > 0) {
          for (const s of existingSplits) {
            await apiRequest(`/api/timesheets/cost-codes/${s.id}`, "DELETE");
          }
        }
        if (isSplit && costCodeSplits.length > 0) {
          for (const split of costCodeSplits) {
            await apiRequest(
              `/api/timesheets/${timesheet.id}/cost-codes`,
              "POST",
              {
                costCodeId: split.costCodeId,
                duration: split.duration,
                hourlyRate: split.hourlyRate,
                total: split.total,
              }
            );
          }
        } else if (!isSplit) {
          await apiRequest(
            `/api/timesheets/${timesheet.id}/cost-codes`,
            "POST",
            {
              costCodeId: data.costCodeId,
              duration: duration.toString(),
              hourlyRate: hourlyRate.toString(),
              total: total,
            }
          );
        }
        return res;
      } else {
        const created = await apiRequest(
          "/api/timesheets",
          "POST",
          timesheetData
        );

        if (isSplit && costCodeSplits.length > 0) {
          for (const split of costCodeSplits) {
            await apiRequest(
              `/api/timesheets/${created.id}/cost-codes`,
              "POST",
              {
                costCodeId: split.costCodeId,
                duration: split.duration,
                hourlyRate: split.hourlyRate,
                total: split.total,
              }
            );
          }
        } else {
          await apiRequest(
            `/api/timesheets/${created.id}/cost-codes`,
            "POST",
            {
              costCodeId: data.costCodeId,
              duration: duration.toString(),
              hourlyRate: hourlyRate.toString(),
              total: total,
            }
          );
        }

        return created;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      const projectId = data.projectId || form.getValues("projectId");
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "timesheets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "labour-hours-budget"] });
      }
      toast({
        title: timesheet ? "Timesheet updated" : "Timesheet created",
        description: timesheet ? "The timesheet has been updated successfully." : "The timesheet has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save timesheet",
        variant: "destructive",
      });
    },
  });

  // Approve / reject mutations
  const approveMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/timesheets/${id}/approve`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (timesheet?.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", timesheet.projectId, "timesheets"] });
      }
      toast({ title: "Timesheet approved" });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to approve", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/api/timesheets/${id}/reject`, "POST", { comment: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      if (timesheet?.projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", timesheet.projectId, "timesheets"] });
      }
      toast({ title: "Timesheet rejected" });
      setShowRejectInput(false);
      setRejectionReason("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reject", variant: "destructive" });
    },
  });

  // Cost code split helpers
  const addCostCodeSplit = () => {
    setCostCodeSplits([
      ...costCodeSplits,
      {
        id: `new-${Date.now()}`,
        costCodeId: "",
        duration: "0",
        hourlyRate: form.watch("hourlyRate") || "50",
        total: "0",
      },
    ]);
  };

  const removeCostCodeSplit = (id: string) => {
    setCostCodeSplits(costCodeSplits.filter((s) => s.id !== id));
  };

  const updateCostCodeSplit = (id: string, field: keyof CostCodeSplit, value: string) => {
    setCostCodeSplits(
      costCodeSplits.map((split) => {
        if (split.id === id) {
          const updated = { ...split, [field]: value };
          if (field === "duration" || field === "hourlyRate") {
            const dur = parseFloat(field === "duration" ? value : updated.duration);
            const rate = parseFloat(field === "hourlyRate" ? value : updated.hourlyRate);
            updated.total = (dur * rate).toFixed(2);
          }
          return updated;
        }
        return split;
      })
    );
  };

  const calculateSplitTotal = () => {
    return costCodeSplits.reduce((sum, split) => sum + parseFloat(split.total || "0"), 0).toFixed(2);
  };

  // Enable split mode: pre-populate first row from current single-code values
  const enableSplit = () => {
    if (costCodeSplits.length === 0) {
      const currentCostCodeId = form.getValues("costCodeId") || "";
      const currentDuration = form.getValues("duration") || "0";
      const currentRate = form.getValues("hourlyRate") || "50";
      const dur = parseFloat(currentDuration);
      const rate = parseFloat(currentRate);
      setCostCodeSplits([{
        id: `new-${Date.now()}`,
        costCodeId: currentCostCodeId,
        duration: currentDuration,
        hourlyRate: currentRate,
        total: (dur * rate).toFixed(2),
      }]);
    }
    setIsSplit(true);
    setShowCostCodeSplit(true);
  };

  // Disable split mode: copy first row's cost code back to the single field
  const disableSplit = () => {
    if (costCodeSplits.length > 0 && costCodeSplits[0].costCodeId) {
      form.setValue("costCodeId", costCodeSplits[0].costCodeId);
    }
    setIsSplit(false);
    setShowCostCodeSplit(false);
  };

  // Keyboard handling: Esc closes; Arrow Up/Down navigates rows when focus
  // is not inside an editable control (so typing & menu navigation aren't broken).
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target?.isContentEditable ||
          target?.closest('[role="listbox"]') ||
          target?.closest('[role="combobox"]') ||
          target?.closest('[role="menu"]') ||
          target?.closest('[role="dialog"]') !== panelRef.current?.closest('[role="dialog"]');
        if (isEditable) return;
        if (e.key === "ArrowUp" && hasPrev && onNavigatePrev) {
          e.preventDefault();
          onNavigatePrev();
        } else if (e.key === "ArrowDown" && hasNext && onNavigateNext) {
          e.preventDefault();
          onNavigateNext();
        }
      }
    },
    [open, onOpenChange, hasPrev, hasNext, onNavigatePrev, onNavigateNext],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Display values
  const displayDuration = (() => {
    const d = parseFloat(watchedDuration || "");
    if (isNaN(d) || !watchedStartTime || !watchedEndTime) return null;
    return d.toFixed(1);
  })();

  const displayTotal = (
    (parseFloat(watchedDuration || "0") || 0) *
    (parseFloat(watchedHourlyRate || "0") || 0)
  ).toFixed(2);

  const totalHoursVal = parseFloat(watchedDuration || '0') || 0;
  const displayHrs = Math.floor(totalHoursVal);
  const displayMins = Math.round((totalHoursVal - displayHrs) * 60);
  const displayHoursStr = `${displayHrs}h ${String(displayMins).padStart(2, '0')}m`;

  // Split balance check (used for the "allocated" pill and Save button guard)
  const splitAllocatedHours = isSplit
    ? costCodeSplits.reduce((sum, s) => sum + (parseFloat(s.duration) || 0), 0)
    : totalHoursVal;
  const splitBalanced = !isSplit || Math.abs(splitAllocatedHours - totalHoursVal) < 0.01;
  const splitAllocHrs = Math.floor(splitAllocatedHours);
  const splitAllocMins = Math.round((splitAllocatedHours - splitAllocHrs) * 60);
  const splitAllocStr = `${splitAllocHrs}h ${String(splitAllocMins).padStart(2, '0')}m`;

  const displayId = timesheet?.id ? `#TS-${timesheet.id.slice(0, 8)}` : "New entry";
  const headerTitle = readonly ? "View Timesheet" : timesheet ? "Edit Timesheet" : "Add Timesheet";

  if (!isMounted) {
    return (
      <SetReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        linkedItemType="timesheet"
        linkedItemId={timesheet?.id}
        linkedItemTitle={timesheet ? `Timesheet: ${format(new Date(timesheet.date), "MMM d, yyyy")}` : undefined}
        projectId={form.watch("projectId")}
      />
    );
  }

  const labelClass = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block";
  const inputClass =
    "w-full h-9 rounded-md border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50";
  const selectTriggerClass = "h-9 border border-border bg-muted/30 text-sm font-normal";

  const drawer = (
    <>
      {/* Dim overlay over the table — non-blocking so the table behind stays scrollable.
          We re-enable pointer events only on this overlay so clicks dismiss the drawer. */}
      <div
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/15 transition-opacity duration-300",
          "pointer-events-auto",
          isShown ? "opacity-100" : "opacity-0",
        )}
        style={{ right: 480 }}
        data-testid="overlay-timesheet-drawer"
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={headerTitle}
        tabIndex={-1}
        className={cn(
          "fixed right-0 top-0 z-50 h-screen w-[480px] flex flex-col bg-card border-l border-border outline-none",
          "transition-transform duration-300 ease-out",
          "shadow-[-8px_0_32px_rgba(0,0,0,0.18)]",
          isShown ? "translate-x-0" : "translate-x-full",
        )}
        data-testid="drawer-timesheet"
      >
        {/* Sticky header */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-border flex-none">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-7 h-7 rounded-md bg-muted/40 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close drawer"
            data-testid="button-close-drawer"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-foreground leading-tight" data-testid="heading-timesheet-dialog">
              {headerTitle}
            </p>
            <p className="text-[10px] text-muted-foreground" data-testid="text-timesheet-id">
              {displayId}
            </p>
          </div>
          {timesheet?.status && <StatusBadge status={timesheet.status} />}
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
            className="flex flex-col flex-1 min-h-0"
          >
            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <fieldset disabled={readonly} className="flex flex-col gap-3">
                {readonly && (
                  <p className="text-[11px] text-muted-foreground mb-3">
                    You don't have permission to edit this timesheet.
                  </p>
                )}

                {/* Project | Date */}
                <div className="grid grid-cols-[2fr_1fr] gap-3">
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Label className={labelClass}>Project</Label>
                        <FormControl>
                          <ProjectSelect
                            value={field.value || "none"}
                            onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                            placeholder="Select project"
                            allowNone={true}
                            className={selectTriggerClass}
                            data-testid="select-project"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Label className={labelClass}>Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <button
                                type="button"
                                className={cn(inputClass, "text-left flex items-center justify-between")}
                                data-testid="button-select-date"
                              >
                                <span>{field.value ? format(field.value, "MMM d, yyyy") : "Select date"}</span>
                                <CalendarIcon className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Employee — full width */}
                <div>
                  <FormField
                    control={form.control}
                    name="userId"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Label className={labelClass}>Employee</Label>
                        <FormControl>
                          <UserSelect
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder="Select employee"
                            allowNone={false}
                            triggerClassName={selectTriggerClass}
                            data-testid="select-user"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t border-border" />

                {/* Start | End | Break */}
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Label className={labelClass}>Start</Label>
                        <FormControl>
                          <TimeSelect
                            value={field.value}
                            onChange={(value) => {
                              setLastEditedField("startTime");
                              field.onChange(value);
                            }}
                            placeholder="Start"
                            defaultScrollTime={companySettings?.standardWorkStart || "07:00"}
                            showIcon={false}
                            className={selectTriggerClass}
                            data-testid="select-start-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Label className={labelClass}>End</Label>
                        <FormControl>
                          <TimeSelect
                            value={field.value}
                            onChange={(value) => {
                              setLastEditedField("endTime");
                              field.onChange(value);
                            }}
                            placeholder="End"
                            defaultScrollTime={companySettings?.standardWorkEnd || "15:30"}
                            showIcon={false}
                            className={selectTriggerClass}
                            data-testid="select-end-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="breakDuration"
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <Label className={labelClass}>Break</Label>
                        <Select
                          value={field.value || "0"}
                          onValueChange={(value) => {
                            setLastEditedField("breakDuration");
                            field.onChange(value);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className={cn("h-9 text-sm", selectTriggerClass)} data-testid="input-break-duration">
                              <SelectValue placeholder="Break" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[300px]">
                            {breakDurationOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Break start/end collapsible */}
                <button
                  type="button"
                  onClick={() => setShowBreakTimes((s) => !s)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  data-testid="toggle-break-times"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      showBreakTimes ? "rotate-0" : "-rotate-90",
                    )}
                  />
                  Break start/end times (optional)
                </button>
                {showBreakTimes && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="breakStartTime"
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <Label className={labelClass}>Break start</Label>
                          <FormControl>
                            <Input
                              type="time"
                              {...field}
                              className={inputClass}
                              data-testid="input-break-start-time"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="breakEndTime"
                      render={({ field }) => (
                        <FormItem className="space-y-0">
                          <Label className={labelClass}>Break end</Label>
                          <FormControl>
                            <Input
                              type="time"
                              {...field}
                              className={inputClass}
                              data-testid="input-break-end-time"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="border-t border-border" />

                {/* Cost code — label row has inline "Split" toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className={labelClass}>Cost code</Label>
                    {!isSplit ? (
                      <button
                        type="button"
                        onClick={enableSplit}
                        className="text-[11px] text-primary/70 hover:text-primary font-medium leading-none"
                        data-testid="button-enable-split"
                      >
                        Split
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={disableSplit}
                        className="text-[11px] text-muted-foreground hover:text-foreground leading-none"
                        data-testid="button-disable-split"
                      >
                        Remove split
                      </button>
                    )}
                  </div>

                  {/* Single cost-code + rate — hidden in split mode */}
                  {!isSplit && (
                    <div className={canViewTimesheetRates ? "grid grid-cols-[2fr_1fr] gap-3" : ""}>
                      <FormField
                        control={form.control}
                        name="costCodeId"
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <CostCodeSelect
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder="Select cost code"
                                triggerClassName={selectTriggerClass}
                                data-testid="select-cost-code"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {canViewTimesheetRates && (
                        <FormField
                          control={form.control}
                          name="hourlyRate"
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <Label className={labelClass}>Rate ($)</Label>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  {...field}
                                  className={inputClass}
                                  data-testid="input-hourly-rate"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  )}

                  {/* Split table — shown when split mode is active */}
                  {isSplit && (
                    <Card className="mt-0">
                      <CardContent className="p-3 space-y-2">
                        {costCodeSplits.map((split) => (
                          <div
                            key={split.id}
                            className={canViewTimesheetRates ? "grid gap-2 grid-cols-[2fr_1fr_1fr_auto] items-end" : "grid gap-2 grid-cols-[2fr_1fr_auto] items-end"}
                          >
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Cost Code</Label>
                              <CostCodeSelect
                                value={split.costCodeId}
                                onValueChange={(v) => updateCostCodeSplit(split.id, "costCodeId", v)}
                                placeholder="Select"
                                allowNone={false}
                                data-testid={`select-cost-code-${split.id}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Hours</Label>
                              <Input
                                type="number"
                                step="0.25"
                                value={split.duration}
                                onChange={(e) => updateCostCodeSplit(split.id, "duration", e.target.value)}
                                className={inputClass}
                                data-testid={`input-split-duration-${split.id}`}
                              />
                            </div>
                            {canViewTimesheetRates && (
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Rate</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={split.hourlyRate}
                                  onChange={(e) => updateCostCodeSplit(split.id, "hourlyRate", e.target.value)}
                                  className={inputClass}
                                  data-testid={`input-split-rate-${split.id}`}
                                />
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCostCodeSplit(split.id)}
                              data-testid={`button-remove-split-${split.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addCostCodeSplit}
                            data-testid="button-add-split"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add split
                          </Button>
                          <span
                            className={cn(
                              "text-[11px] font-medium px-2 py-0.5 rounded-full",
                              splitBalanced
                                ? "bg-muted/50 text-muted-foreground"
                                : "bg-destructive/10 text-destructive",
                            )}
                            data-testid="text-split-allocation"
                          >
                            {splitAllocStr} / {displayHoursStr} allocated
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Duration & Total cost — Total only visible to users with rates permission and not in split mode */}
                <div className={canViewTimesheetRates && !isSplit ? "grid grid-cols-[2fr_1fr] gap-3" : ""}>
                  <div>
                    <Label className={labelClass}>Duration</Label>
                    <div
                      className="rounded-md border border-border bg-muted/30 px-4 py-2"
                      data-testid="display-duration"
                    >
                      <div style={{ fontSize: '20px', fontWeight: 600, color: displayHoursStr ? '#a890d4' : undefined, lineHeight: 1.2 }}
                           className={displayHoursStr ? '' : 'text-muted-foreground'}>
                        {displayHoursStr || "—"}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9b9b9b', marginTop: '2px' }}>total hours</div>
                    </div>
                  </div>
                  {canViewTimesheetRates && !isSplit && (
                    <div>
                      <Label className={labelClass}>Total cost</Label>
                      <div
                        className="rounded-md border border-border bg-muted/30 px-4 py-2"
                        data-testid="display-total"
                      >
                        <div style={{ fontSize: '20px', fontWeight: 600, lineHeight: 1.2 }} className="text-muted-foreground">
                          ${displayTotal}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9b9b9b', marginTop: '2px' }}>total cost</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border" />

                {/* Labels — collapsible */}
                {labelOptions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowLabels((s) => !s)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      data-testid="toggle-labels"
                    >
                      <ChevronDown
                        className={cn("h-3 w-3 transition-transform shrink-0", !showLabels && "-rotate-90")}
                      />
                      Labels
                    </button>
                    {showLabels && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {labelOptions.map((option) => {
                          const isSelected = watchedLabels?.includes(option.key);
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => toggleLabel(option.key)}
                              className={cn(
                                "rounded-full text-[11px] font-medium px-3 py-1 border transition-colors cursor-pointer",
                                getLabelChipClasses(option.key, !!isSelected),
                              )}
                              data-testid={`timesheet-label-${option.key}`}
                            >
                              {option.name}
                              {isSelected && <Check className="inline h-3 w-3 ml-1" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <Label className={labelClass}>Description</Label>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="What did you work on?"
                          className="min-h-[104px] resize-none rounded-md border border-border bg-muted/30 text-[12px] focus-visible:ring-1 focus-visible:ring-primary/50"
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Clocked in / out */}
                {timesheet?.actualStartTime && (
                  <div
                    className="bg-muted/20 rounded-md px-3 py-1.5 text-[11px] text-muted-foreground flex items-center gap-2"
                    data-testid="display-clocked-times"
                  >
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span>
                      Clocked in: <span className="font-medium text-foreground">{timesheet.actualStartTime}</span>
                      {timesheet.actualEndTime && (
                        <>
                          {" · Clocked out: "}
                          <span className="font-medium text-foreground">{timesheet.actualEndTime}</span>
                        </>
                      )}
                    </span>
                  </div>
                )}

                {/* Approval / rejection note */}
                {timesheet && (timesheet.status === "approved" || timesheet.status === "rejected") && timesheet.approvedById && (
                  <div
                    className={cn(
                      "flex flex-col gap-1 px-3 py-2 rounded-md text-[11px]",
                      timesheet.status === "approved"
                        ? "bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))]"
                        : "bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))]",
                    )}
                    data-testid="display-approval-note"
                  >
                    <div className="flex items-center gap-1.5">
                      {timesheet.status === "approved" ? (
                        <Check className="h-3 w-3 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      )}
                      <span>
                        {timesheet.status === "approved" ? "Approved" : "Rejected"} by{" "}
                        <span className="font-semibold">
                          {(() => {
                            const approver = users.find((u) => u.id === timesheet.approvedById);
                            return approver
                              ? `${approver.firstName || ""} ${approver.lastName || ""}`.trim() || approver.email || "Unknown"
                              : "Unknown";
                          })()}
                        </span>
                        {timesheet.approvedAt && (
                          <> on {format(new Date(timesheet.approvedAt), "dd MMM yyyy 'at' h:mm a")}</>
                        )}
                      </span>
                    </div>
                    {timesheet.status === "rejected" && timesheet.rejectionReason && (
                      <div className="pl-[18px]">Reason: {timesheet.rejectionReason}</div>
                    )}
                  </div>
                )}
              </fieldset>
            </div>

            {/* Sticky footer */}
            <div
              className="flex items-center justify-between px-5 min-h-[60px] border-t border-border bg-card flex-none gap-2 py-3 flex-wrap"
            >
              {timesheet ? (
                <button
                  type="button"
                  onClick={() => setShowReminderDialog(true)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border rounded-md px-3 h-[30px] hover:bg-muted/40 transition-colors"
                  data-testid="button-set-reminder"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Set reminder
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Approve / Reject — visible when user can approve and timesheet is submitted */}
                {canApproveTimesheets && timesheet?.status === "submitted" && !showRejectInput && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowRejectInput(true)}
                      className="border border-border bg-muted/40 text-muted-foreground rounded-md px-3 h-[30px] text-[12px] hover:bg-muted transition-colors"
                      data-testid="button-reject-timesheet"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={approveMutation.isPending}
                      onClick={() => timesheet && approveMutation.mutate(timesheet.id)}
                      className="bg-[hsl(var(--sage))] text-white rounded-md px-4 h-[30px] text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-colors"
                      data-testid="button-approve-timesheet"
                    >
                      {approveMutation.isPending ? "Approving…" : "Approve"}
                    </button>
                  </>
                )}
                {/* Inline rejection reason */}
                {canApproveTimesheets && timesheet?.status === "submitted" && showRejectInput && (
                  <>
                    <Input
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="h-[30px] text-[12px] w-36"
                      data-testid="input-rejection-reason"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && timesheet) {
                          rejectMutation.mutate({ id: timesheet.id, reason: rejectionReason });
                        }
                        if (e.key === "Escape") setShowRejectInput(false);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRejectInput(false)}
                      className="bg-muted/40 text-muted-foreground rounded-md px-3 h-[30px] text-[12px] hover:bg-muted transition-colors"
                      data-testid="button-cancel-reject"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={rejectMutation.isPending}
                      onClick={() => timesheet && rejectMutation.mutate({ id: timesheet.id, reason: rejectionReason })}
                      className="bg-destructive text-white rounded-md px-3 h-[30px] text-[12px] font-semibold hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                      data-testid="button-confirm-reject"
                    >
                      {rejectMutation.isPending ? "Rejecting…" : "Confirm Reject"}
                    </button>
                  </>
                )}
                {/* Cancel / Save — hidden only while reject input is open */}
                {!showRejectInput && (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="bg-muted/40 text-muted-foreground rounded-md px-4 h-[30px] text-[12px] hover:bg-muted transition-colors"
                      data-testid="button-cancel"
                    >
                      {readonly ? "Close" : "Cancel"}
                    </button>
                    {!readonly && (
                      <button
                        type="submit"
                        disabled={createMutation.isPending || (isSplit && !splitBalanced)}
                        className="bg-primary text-primary-foreground rounded-md px-4 h-[30px] text-[12px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        data-testid="button-save-timesheet"
                        title={isSplit && !splitBalanced ? "Allocated hours must match total hours" : undefined}
                      >
                        {createMutation.isPending ? "Saving…" : timesheet ? "Update" : "Create"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
    </>
  );

  return (
    <>
      {createPortal(drawer, document.body)}
      <SetReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        linkedItemType="timesheet"
        linkedItemId={timesheet?.id}
        linkedItemTitle={timesheet ? `Timesheet: ${format(new Date(timesheet.date), "MMM d, yyyy")}` : undefined}
        projectId={form.watch("projectId")}
      />
    </>
  );
}
