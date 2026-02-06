import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Plus, Trash2, Bell, Check } from "lucide-react";
import { useTimesheetLabelOptions } from "@/hooks/useTimesheetLabelOptions";
import { SetReminderDialog } from "@/components/SetReminderDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProjectSelect } from "@/components/ProjectSelect";
import { UserSelect } from "@/components/UserSelect";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { TimeSelect } from "@/components/ui/time-select";
import type { Timesheet, Project, User as UserType, CostCode, TimesheetCostCode, CompanySettings } from "@shared/schema";

const timesheetSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
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
  costCodeId: z.string().optional(), // Validated in mutation based on split mode
  labels: z.array(z.string()).optional(),
});

type TimesheetFormData = z.infer<typeof timesheetSchema>;

interface CostCodeSplit {
  id: string;
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
}

export function TimesheetDialog({
  open,
  onOpenChange,
  timesheet,
  defaultProjectId,
  readonly = false,
}: TimesheetDialogProps) {
  const { toast } = useToast();
  const [isSplit, setIsSplit] = useState(false);
  const [lastEditedField, setLastEditedField] = useState<"startTime" | "endTime" | "duration" | "breakDuration" | null>(null);
  const [costCodeSplits, setCostCodeSplits] = useState<CostCodeSplit[]>([]);
  const [showReminderDialog, setShowReminderDialog] = useState(false);

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
  
  const toggleLabel = (labelKey: string) => {
    const current = form.getValues("labels") || [];
    if (current.includes(labelKey)) {
      form.setValue("labels", current.filter(l => l !== labelKey));
    } else {
      form.setValue("labels", [...current, labelKey]);
    }
  };

  // Auto-select project when dialog opens if on a project page
  useEffect(() => {
    if (open && defaultProjectId && !timesheet) {
      form.setValue("projectId", defaultProjectId);
    }
  }, [open, defaultProjectId, timesheet, form]);

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

  // Bi-directional time calculation
  useEffect(() => {
    const startTime = form.watch("startTime");
    const endTime = form.watch("endTime");
    const duration = form.watch("duration");
    const breakDuration = parseFloat(form.watch("breakDuration") || "0");

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
  }, [form.watch("startTime"), form.watch("endTime"), form.watch("duration"), form.watch("breakDuration"), lastEditedField]);

  // Auto-calculate break duration from break start/end times
  useEffect(() => {
    const breakStartTime = form.watch("breakStartTime");
    const breakEndTime = form.watch("breakEndTime");
    
    if (breakStartTime && breakEndTime) {
      const startMinutes = timeToMinutes(breakStartTime);
      const endMinutes = timeToMinutes(breakEndTime);
      
      let totalMinutes = endMinutes - startMinutes;
      if (totalMinutes < 0) totalMinutes += 24 * 60; // Handle overnight
      
      const hours = Math.round((totalMinutes / 60) * 4) / 4; // Round to nearest 0.25
      form.setValue("breakDuration", hours.toString());
      setLastEditedField("breakDuration"); // Trigger duration recalculation
    }
  }, [form.watch("breakStartTime"), form.watch("breakEndTime")]);

  // Create/Update mutation
  const createMutation = useMutation({
    mutationFn: async (data: TimesheetFormData) => {
      // Validate cost code
      if (!isSplit && !data.costCodeId) {
        throw new Error("Please select a cost code");
      }
      if (isSplit && costCodeSplits.length === 0) {
        throw new Error("Please add at least one cost code split");
      }

      const duration = parseFloat(data.duration || "0");
      const hourlyRate = parseFloat(data.hourlyRate || "0");
      const total = (duration * hourlyRate).toFixed(2);

      const timesheetData = {
        projectId: data.projectId,
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
      };

      if (timesheet) {
        const res = await apiRequest(
          "PATCH",
          `/api/timesheets/${timesheet.id}`,
          timesheetData
        );
        return await res.json();
      } else {
        const res = await apiRequest(
          "POST",
          "/api/timesheets",
          timesheetData
        );
        const created = await res.json();
        
        // If split, create cost code splits
        if (isSplit && costCodeSplits.length > 0) {
          for (const split of costCodeSplits) {
            await apiRequest(
              "POST",
              `/api/timesheets/${created.id}/cost-codes`,
              {
                costCodeId: split.costCodeId,
                duration: split.duration,
                hourlyRate: split.hourlyRate,
                total: split.total,
              }
            );
          }
        } else {
          // Create a single cost code entry for the primary cost code
          await apiRequest(
            "POST",
            `/api/timesheets/${created.id}/cost-codes`,
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
      // Invalidate project-specific queries
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

  // Add cost code split
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

  // Remove cost code split
  const removeCostCodeSplit = (id: string) => {
    setCostCodeSplits(costCodeSplits.filter((s) => s.id !== id));
  };

  // Update cost code split
  const updateCostCodeSplit = (id: string, field: keyof CostCodeSplit, value: string) => {
    setCostCodeSplits(
      costCodeSplits.map((split) => {
        if (split.id === id) {
          const updated = { ...split, [field]: value };
          
          // Recalculate total if duration or rate changes
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

  // Calculate total from splits
  const calculateSplitTotal = () => {
    return costCodeSplits.reduce((sum, split) => sum + parseFloat(split.total || "0"), 0).toFixed(2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="heading-timesheet-dialog">
            {readonly ? "View Timesheet" : timesheet ? "Edit Timesheet" : "Add Timesheet"}
          </DialogTitle>
          {readonly && (
            <p className="text-sm text-muted-foreground">
              You don't have permission to edit this timesheet.
            </p>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
            <fieldset disabled={readonly} className="space-y-6">
            {/* Basic Info */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <FormControl>
                      <ProjectSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select project"
                        allowNone={false}
                        data-testid="select-project"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User</FormLabel>
                    <FormControl>
                      <UserSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select user"
                        allowNone={false}
                        data-testid="select-user"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          data-testid="button-select-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : "Select date"}
                        </Button>
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

            {/* Time Entry Fields - All fields shown with bi-directional calculation */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <TimeSelect
                        value={field.value}
                        onChange={(value) => {
                          setLastEditedField("startTime");
                          field.onChange(value);
                        }}
                        placeholder="Select start time"
                        defaultScrollTime={companySettings?.standardWorkStart || "07:00"}
                        showIcon={false}
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
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <TimeSelect
                        value={field.value}
                        onChange={(value) => {
                          setLastEditedField("endTime");
                          field.onChange(value);
                        }}
                        placeholder="Select end time"
                        defaultScrollTime={companySettings?.standardWorkEnd || "15:30"}
                        showIcon={false}
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
                  <FormItem>
                    <FormLabel>Break</FormLabel>
                    <Select
                      value={field.value || "0"}
                      onValueChange={(value) => {
                        setLastEditedField("breakDuration");
                        field.onChange(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="input-break-duration">
                          <SelectValue placeholder="Select break" />
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

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.25"
                        {...field}
                        onChange={(e) => {
                          setLastEditedField("duration");
                          field.onChange(e);
                        }}
                        data-testid="input-duration"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Auto-calculated or enter manually</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Break Start/End Times */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="breakStartTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Break Start</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
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
                  <FormItem>
                    <FormLabel>Break End</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                        data-testid="input-break-end-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Rate & Total */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="hourlyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly Rate ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        data-testid="input-hourly-rate"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>Total Cost</Label>
                <div className="p-3 bg-primary/10 rounded-md border">
                  <span className="text-2xl font-bold text-primary">
                    ${((parseFloat(form.watch("duration") || "0") * parseFloat(form.watch("hourlyRate") || "0"))).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Cost Code */}
            {!isSplit && (
              <FormField
                control={form.control}
                name="costCodeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Code</FormLabel>
                    <FormControl>
                      <CostCodeSelect
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select cost code"
                        data-testid="select-cost-code"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Cost Code Split */}
            {!timesheet && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Split Across Cost Codes</Label>
                  <Button
                    type="button"
                    variant={isSplit ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsSplit(!isSplit);
                      if (!isSplit && costCodeSplits.length === 0) {
                        addCostCodeSplit();
                      }
                    }}
                    data-testid="button-toggle-split"
                  >
                    {isSplit ? "Single Cost Code" : "Split Time"}
                  </Button>
                </div>

                {isSplit && (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      {costCodeSplits.map((split) => (
                        <div key={split.id} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end">
                          <div className="space-y-2">
                            <Label>Cost Code</Label>
                            <CostCodeSelect
                              value={split.costCodeId}
                              onValueChange={(value) => updateCostCodeSplit(split.id, "costCodeId", value)}
                              placeholder="Select cost code"
                              allowNone={false}
                              data-testid={`select-cost-code-${split.id}`}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Hours</Label>
                            <Input
                              type="number"
                              step="0.25"
                              value={split.duration}
                              onChange={(e) => updateCostCodeSplit(split.id, "duration", e.target.value)}
                              data-testid={`input-split-duration-${split.id}`}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Rate ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={split.hourlyRate}
                              onChange={(e) => updateCostCodeSplit(split.id, "hourlyRate", e.target.value)}
                              data-testid={`input-split-rate-${split.id}`}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Total</Label>
                            <div className="p-2 bg-muted rounded-md text-center font-medium">
                              ${split.total}
                            </div>
                          </div>

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

                      <div className="flex items-center justify-between pt-3 border-t">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addCostCodeSplit}
                          data-testid="button-add-split"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Split
                        </Button>
                        <div className="text-lg font-bold">
                          Total: ${calculateSplitTotal()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Labels */}
            {labelOptions.length > 0 && (
              <div className="space-y-2">
                <Label>Labels</Label>
                <div className="flex flex-wrap gap-2">
                  {labelOptions.map((option) => {
                    const isSelected = watchedLabels?.includes(option.key);
                    return (
                      <Button
                        key={option.key}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleLabel(option.key)}
                        className="text-xs"
                        style={{
                          backgroundColor: isSelected ? option.color || undefined : undefined,
                          borderColor: option.color || undefined,
                          color: isSelected ? "#ffffff" : option.color || undefined,
                        }}
                        data-testid={`timesheet-label-${option.key}`}
                      >
                        {option.name}
                        {isSelected && <Check className="h-3 w-3 ml-1" />}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="What did you work on?"
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            </fieldset>

            <DialogFooter className="gap-2">
              {timesheet && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReminderDialog(true)}
                  className="mr-auto"
                  data-testid="button-set-reminder"
                >
                  <Bell className="h-4 w-4 mr-1.5" />
                  Set Reminder
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                {readonly ? "Close" : "Cancel"}
              </Button>
              {!readonly && (
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-timesheet">
                  {createMutation.isPending ? "Saving..." : timesheet ? "Update" : "Create"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      {/* Set Reminder Dialog */}
      <SetReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        linkedItemType="timesheet"
        linkedItemId={timesheet?.id}
        linkedItemTitle={timesheet ? `Timesheet: ${format(new Date(timesheet.date), "MMM d, yyyy")}` : undefined}
        projectId={form.watch("projectId")}
      />
    </Dialog>
  );
}
