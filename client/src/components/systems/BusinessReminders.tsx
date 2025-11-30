import { useState, useImperativeHandle, forwardRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Bell, Plus, Trash2, Clock, Users, CheckSquare, FileText, 
  ClipboardList, Wrench, Calendar, Power, PowerOff, Pencil,
  AlertTriangle, Timer, CalendarClock, Repeat
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertBusinessReminderSchema, type BusinessReminder } from "@shared/schema";

export interface BusinessRemindersHandle {
  openNewReminderDialog: () => void;
}

interface BusinessRemindersProps {
  searchQuery: string;
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  reminderType: z.enum(["timesheet_submission", "site_diary_entry", "task_overdue", "defect_followup", "custom"]),
  isActive: z.boolean().default(true),
  targetAudience: z.enum(["all_users", "project_managers", "site_managers", "custom"]).default("all_users"),
  targetRoles: z.array(z.string()).optional(),
  recurringPattern: z.object({
    frequency: z.enum(["daily", "weekly", "monthly"]),
    daysOfWeek: z.array(z.number()).optional(),
    dayOfMonth: z.number().optional(),
    timeOfDay: z.string().optional(),
  }).optional(),
  deliveryMethods: z.object({
    push: z.boolean().default(true),
    email: z.boolean().default(false),
    inApp: z.boolean().default(true),
  }).default({ push: true, email: false, inApp: true }),
  leadTimeDays: z.coerce.number().int().min(0).max(30).optional(),
  leadTimeHours: z.coerce.number().int().min(0).max(23).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const REMINDER_TYPE_OPTIONS = [
  { value: "timesheet_submission", label: "Timesheet Submission", icon: Timer, description: "Remind users to submit timesheets" },
  { value: "site_diary_entry", label: "Site Diary Entry", icon: ClipboardList, description: "Remind users to complete site diary" },
  { value: "task_overdue", label: "Task Overdue", icon: AlertTriangle, description: "Alert on overdue tasks" },
  { value: "defect_followup", label: "Defect Follow-up", icon: Wrench, description: "Follow up on unresolved defects" },
  { value: "custom", label: "Custom Reminder", icon: Bell, description: "Create a custom business reminder" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export const BusinessReminders = forwardRef<BusinessRemindersHandle, BusinessRemindersProps>(
  ({ searchQuery }, ref) => {
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingReminder, setEditingReminder] = useState<BusinessReminder | null>(null);
    const [deleteReminder, setDeleteReminder] = useState<BusinessReminder | null>(null);

    useImperativeHandle(ref, () => ({
      openNewReminderDialog: () => {
        setEditingReminder(null);
        form.reset({
          name: "",
          description: "",
          reminderType: "timesheet_submission",
          isActive: true,
          targetAudience: "all_users",
          targetRoles: [],
          recurringPattern: {
            frequency: "weekly",
            daysOfWeek: [1, 2, 3, 4, 5],
            timeOfDay: "09:00",
          },
          deliveryMethods: { push: true, email: false, inApp: true },
          leadTimeDays: 0,
          leadTimeHours: 0,
        });
        setIsDialogOpen(true);
      },
    }));

    const { data: reminders = [], isLoading } = useQuery<BusinessReminder[]>({
      queryKey: ["/api/business-reminders"],
    });

    const form = useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        name: "",
        description: "",
        reminderType: "timesheet_submission",
        isActive: true,
        targetAudience: "all_users",
        targetRoles: [],
        recurringPattern: {
          frequency: "weekly",
          daysOfWeek: [1, 2, 3, 4, 5],
          timeOfDay: "09:00",
        },
        deliveryMethods: { push: true, email: false, inApp: true },
        leadTimeDays: 0,
        leadTimeHours: 0,
      },
    });

    const createMutation = useMutation({
      mutationFn: async (data: FormValues) => {
        return apiRequest("/api/business-reminders", "POST", data);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/business-reminders"] });
        toast({ title: "Reminder created successfully" });
        setIsDialogOpen(false);
        form.reset();
      },
      onError: (error: any) => {
        toast({ 
          title: "Failed to create reminder", 
          description: error.message,
          variant: "destructive" 
        });
      },
    });

    const updateMutation = useMutation({
      mutationFn: async ({ id, data }: { id: string; data: Partial<FormValues> }) => {
        return apiRequest(`/api/business-reminders/${id}`, "PATCH", data);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/business-reminders"] });
        toast({ title: "Reminder updated successfully" });
        setIsDialogOpen(false);
        setEditingReminder(null);
        form.reset();
      },
      onError: (error: any) => {
        toast({ 
          title: "Failed to update reminder", 
          description: error.message,
          variant: "destructive" 
        });
      },
    });

    const deleteMutation = useMutation({
      mutationFn: async (id: string) => {
        return apiRequest(`/api/business-reminders/${id}`, "DELETE");
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/business-reminders"] });
        toast({ title: "Reminder deleted successfully" });
        setDeleteReminder(null);
      },
      onError: (error: any) => {
        toast({ 
          title: "Failed to delete reminder", 
          description: error.message,
          variant: "destructive" 
        });
      },
    });

    const toggleActiveMutation = useMutation({
      mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
        return apiRequest(`/api/business-reminders/${id}`, "PATCH", { isActive });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/business-reminders"] });
      },
      onError: (error: any) => {
        toast({ 
          title: "Failed to update reminder", 
          description: error.message,
          variant: "destructive" 
        });
      },
    });

    const onSubmit = (data: FormValues) => {
      if (editingReminder) {
        updateMutation.mutate({ id: editingReminder.id, data });
      } else {
        createMutation.mutate(data);
      }
    };

    const handleEdit = (reminder: BusinessReminder) => {
      setEditingReminder(reminder);
      const pattern = reminder.recurringPattern as any || {};
      form.reset({
        name: reminder.name,
        description: reminder.description || "",
        reminderType: reminder.reminderType as any,
        isActive: reminder.isActive,
        targetAudience: reminder.targetAudience as any,
        targetRoles: (reminder.targetRoles as string[]) || [],
        recurringPattern: {
          frequency: pattern.frequency || "weekly",
          daysOfWeek: pattern.daysOfWeek || [1, 2, 3, 4, 5],
          dayOfMonth: pattern.dayOfMonth,
          timeOfDay: pattern.timeOfDay || "09:00",
        },
        deliveryMethods: (reminder.deliveryMethods as any) || { push: true, email: false, inApp: true },
        leadTimeDays: reminder.leadTimeDays || 0,
        leadTimeHours: reminder.leadTimeHours || 0,
      });
      setIsDialogOpen(true);
    };

    const filteredReminders = reminders.filter(r => 
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );

    const getReminderTypeInfo = (type: string) => {
      return REMINDER_TYPE_OPTIONS.find(t => t.value === type) || REMINDER_TYPE_OPTIONS[4];
    };

    const formatRecurringPattern = (pattern: any) => {
      if (!pattern) return "Not configured";
      const freq = pattern.frequency || "weekly";
      const time = pattern.timeOfDay || "09:00";
      
      if (freq === "daily") {
        return `Daily at ${time}`;
      } else if (freq === "weekly") {
        const days = (pattern.daysOfWeek || []).map((d: number) => DAYS_OF_WEEK[d]?.label).join(", ");
        return `Weekly on ${days || "weekdays"} at ${time}`;
      } else if (freq === "monthly") {
        return `Monthly on day ${pattern.dayOfMonth || 1} at ${time}`;
      }
      return "Custom schedule";
    };

    const watchFrequency = form.watch("recurringPattern.frequency");

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-sm">Loading reminders...</div>
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto p-4" data-testid="business-reminders-content">
        {filteredReminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No business reminders yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create recurring reminders for your team such as timesheet submissions, site diary entries, and more.
            </p>
            <Button 
              onClick={() => {
                setEditingReminder(null);
                form.reset();
                setIsDialogOpen(true);
              }}
              className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
              data-testid="button-create-first-reminder"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Reminder
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReminders.map((reminder) => {
              const typeInfo = getReminderTypeInfo(reminder.reminderType);
              const TypeIcon = typeInfo.icon;
              const pattern = reminder.recurringPattern as any;
              const deliveryMethods = reminder.deliveryMethods as any || {};
              
              return (
                <div
                  key={reminder.id}
                  className="flex items-center gap-4 p-3 rounded-lg border bg-card hover-elevate"
                  data-testid={`reminder-item-${reminder.id}`}
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                    reminder.isActive ? "bg-[#bba7db]/10" : "bg-muted"
                  }`}>
                    <TypeIcon className={`h-5 w-5 ${reminder.isActive ? "text-[#bba7db]" : "text-muted-foreground"}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">{reminder.name}</span>
                      {!reminder.isActive && (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Repeat className="h-3 w-3" />
                        {formatRecurringPattern(pattern)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {reminder.targetAudience === "all_users" ? "All Users" : 
                         reminder.targetAudience === "project_managers" ? "Project Managers" :
                         reminder.targetAudience === "site_managers" ? "Site Managers" : "Custom"}
                      </span>
                    </div>
                    {reminder.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{reminder.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {deliveryMethods.push && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Push</Badge>
                      )}
                      {deliveryMethods.email && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Email</Badge>
                      )}
                      {deliveryMethods.inApp && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">In-App</Badge>
                      )}
                    </div>
                    
                    <Switch
                      checked={reminder.isActive}
                      onCheckedChange={(checked) => 
                        toggleActiveMutation.mutate({ id: reminder.id, isActive: checked })
                      }
                      data-testid={`toggle-active-${reminder.id}`}
                    />
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(reminder)}
                      data-testid={`button-edit-${reminder.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteReminder(reminder)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-delete-${reminder.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingReminder ? "Edit Reminder" : "Create Business Reminder"}</DialogTitle>
              <DialogDescription>
                Configure a recurring reminder for your team. These reminders will be sent to the selected audience based on your schedule.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="reminderType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reminder Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-reminder-type">
                            <SelectValue placeholder="Select reminder type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REMINDER_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <opt.icon className="h-4 w-4" />
                                <span>{opt.label}</span>
                              </div>
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
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Weekly Timesheet Reminder" data-testid="input-reminder-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Add a description for this reminder..." rows={2} data-testid="input-reminder-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-target-audience">
                            <SelectValue placeholder="Select target audience" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all_users">All Users</SelectItem>
                          <SelectItem value="project_managers">Project Managers</SelectItem>
                          <SelectItem value="site_managers">Site Managers</SelectItem>
                          <SelectItem value="custom">Custom Roles</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Schedule
                  </h4>
                  
                  <FormField
                    control={form.control}
                    name="recurringPattern.frequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-frequency">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {FREQUENCY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchFrequency === "weekly" && (
                    <FormField
                      control={form.control}
                      name="recurringPattern.daysOfWeek"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Days of Week</FormLabel>
                          <div className="flex gap-1 flex-wrap">
                            {DAYS_OF_WEEK.map((day) => (
                              <Button
                                key={day.value}
                                type="button"
                                size="sm"
                                variant={(field.value || []).includes(day.value) ? "default" : "outline"}
                                className="h-8 w-10 px-0"
                                onClick={() => {
                                  const current = field.value || [];
                                  if (current.includes(day.value)) {
                                    field.onChange(current.filter(d => d !== day.value));
                                  } else {
                                    field.onChange([...current, day.value].sort());
                                  }
                                }}
                                data-testid={`day-toggle-${day.value}`}
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {watchFrequency === "monthly" && (
                    <FormField
                      control={form.control}
                      name="recurringPattern.dayOfMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Day of Month</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={1} 
                              max={31} 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              data-testid="input-day-of-month" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="recurringPattern.timeOfDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time of Day</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} data-testid="input-time-of-day" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Delivery Methods
                  </h4>
                  
                  <div className="flex flex-wrap gap-4">
                    <FormField
                      control={form.control}
                      name="deliveryMethods.inApp"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="font-normal">In-App</FormLabel>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="deliveryMethods.push"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="font-normal">Push</FormLabel>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="deliveryMethods.email"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="font-normal">Email</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>Active</FormLabel>
                        <FormDescription>Enable or disable this reminder</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
                    data-testid="button-save-reminder"
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingReminder ? "Update Reminder" : "Create Reminder"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteReminder} onOpenChange={() => setDeleteReminder(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Reminder</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deleteReminder?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteReminder && deleteMutation.mutate(deleteReminder.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
);

BusinessReminders.displayName = "BusinessReminders";
