import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Plus, Trash2, Clock } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Timesheet, Project, User as UserType, CostCode, TimesheetCostCode, CompanySettings } from "@shared/schema";

const timesheetSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  userId: z.string().min(1, "User is required"),
  date: z.date(),
  timeEntryMode: z.enum(["time", "duration"]),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  duration: z.string().optional(),
  breakDuration: z.string().optional(),
  description: z.string().optional(),
  hourlyRate: z.string().optional(),
  costCodeId: z.string().optional(),
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
}

export function TimesheetDialog({
  open,
  onOpenChange,
  timesheet,
  defaultProjectId,
}: TimesheetDialogProps) {
  const { toast } = useToast();
  const [timeEntryMode, setTimeEntryMode] = useState<"time" | "duration">("time");
  const [isSplit, setIsSplit] = useState(false);
  const [costCodeSplits, setCostCodeSplits] = useState<CostCodeSplit[]>([]);
  const startTimeViewportRef = useRef<HTMLDivElement>(null);
  const endTimeViewportRef = useRef<HTMLDivElement>(null);

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

  // Generate 15-minute interval time options
  const generateTimeOptions = () => {
    const options: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const hourStr = hour.toString().padStart(2, '0');
        const minStr = minute.toString().padStart(2, '0');
        options.push(`${hourStr}:${minStr}`);
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  // Scroll to default time in Select dropdown
  const scrollToTime = (viewportRef: React.RefObject<HTMLDivElement>, time: string) => {
    if (!viewportRef.current) return;
    
    setTimeout(() => {
      const selectedItem = viewportRef.current?.querySelector(`[data-value="${time}"]`);
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }, 0);
  };

  const form = useForm<TimesheetFormData>({
    resolver: zodResolver(timesheetSchema),
    defaultValues: {
      projectId: defaultProjectId || "",
      userId: "",
      date: new Date(),
      timeEntryMode: "time",
      startTime: "",
      endTime: "",
      duration: "",
      breakDuration: "0",
      description: "",
      hourlyRate: "50",
      costCodeId: "",
    },
  });

  // Auto-select project when dialog opens if on a project page
  useEffect(() => {
    if (open && defaultProjectId && !timesheet) {
      form.setValue("projectId", defaultProjectId);
    }
  }, [open, defaultProjectId, timesheet, form]);

  // Calculate duration from start/end time
  useEffect(() => {
    if (timeEntryMode === "time") {
      const startTime = form.watch("startTime");
      const endTime = form.watch("endTime");
      const breakDuration = parseFloat(form.watch("breakDuration") || "0");

      if (startTime && endTime) {
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        let totalMinutes = endMinutes - startMinutes;
        if (totalMinutes < 0) totalMinutes += 24 * 60; // Handle overnight shifts
        
        // Subtract break and round to nearest 0.25 hours
        const hours = (totalMinutes / 60) - breakDuration;
        const roundedHours = Math.max(0, Math.round(hours * 4) / 4);
        
        form.setValue("duration", roundedHours.toString());
      }
    }
  }, [form.watch("startTime"), form.watch("endTime"), form.watch("breakDuration"), timeEntryMode]);

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
        startTime: data.timeEntryMode === "time" ? data.startTime : null,
        endTime: data.timeEntryMode === "time" ? data.endTime : null,
        duration: duration.toString(),
        breakDuration: data.breakDuration || "0",
        description: data.description || null,
        hourlyRate: hourlyRate.toString(),
        total: total,
        status: "draft",
        invoiced: false,
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
            {timesheet ? "Edit Timesheet" : "Add Timesheet"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
            {/* Basic Info */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
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
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-user">
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {`${user.firstName} ${user.lastName}`.trim() || user.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

            {/* Time Entry Mode */}
            <div className="space-y-4">
              <Label>Time Entry Mode</Label>
              <RadioGroup
                value={timeEntryMode}
                onValueChange={(value: "time" | "duration") => {
                  setTimeEntryMode(value);
                  form.setValue("timeEntryMode", value);
                }}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="time" id="time" data-testid="radio-time-mode" />
                  <Label htmlFor="time">Start/End Time</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="duration" id="duration" data-testid="radio-duration-mode" />
                  <Label htmlFor="duration">Duration</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Time Entry Fields */}
            {timeEntryMode === "time" ? (
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <Select 
                        value={field.value} 
                        onValueChange={field.onChange}
                        onOpenChange={(open) => {
                          if (open && !field.value) {
                            const defaultTime = companySettings?.standardWorkStart || "07:00";
                            scrollToTime(startTimeViewportRef, defaultTime);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-start-time">
                            <SelectValue placeholder="Select start time" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[300px]" ref={startTimeViewportRef}>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
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
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <Select 
                        value={field.value} 
                        onValueChange={field.onChange}
                        onOpenChange={(open) => {
                          if (open && !field.value) {
                            const defaultTime = companySettings?.standardWorkEnd || "15:30";
                            scrollToTime(endTimeViewportRef, defaultTime);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-end-time">
                            <SelectValue placeholder="Select end time" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[300px]" ref={endTimeViewportRef}>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
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
                  name="breakDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Break (hours)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.25"
                          {...field}
                          data-testid="input-break-duration"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
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
                        data-testid="input-duration"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Calculated Duration Display */}
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Duration:</span>
                <span className="text-lg font-bold">
                  {form.watch("duration") || "0"} hours
                </span>
              </div>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-cost-code">
                          <SelectValue placeholder="Select cost code" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {costCodes.map((code) => (
                          <SelectItem key={code.id} value={code.id}>
                            {code.code} - {code.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                            <Select
                              value={split.costCodeId}
                              onValueChange={(value) => updateCostCodeSplit(split.id, "costCodeId", value)}
                            >
                              <SelectTrigger data-testid={`select-cost-code-${split.id}`}>
                                <SelectValue placeholder="Select cost code" />
                              </SelectTrigger>
                              <SelectContent>
                                {costCodes.map((code) => (
                                  <SelectItem key={code.id} value={code.id}>
                                    {code.code} - {code.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-timesheet">
                {createMutation.isPending ? "Saving..." : timesheet ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
