import { useState, useImperativeHandle, forwardRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Bell, Plus, Trash2, Users, 
  ClipboardList, Wrench, Pencil,
  AlertTriangle, Timer, CalendarClock, Repeat, X, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type BusinessReminder, type UserRole, type User } from "@shared/schema";

export interface BusinessRemindersHandle {
  openNewReminderDialog: () => void;
}

interface BusinessRemindersProps {
  searchQuery: string;
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  targetType: z.enum(["timesheet", "site_diary", "custom"]),
  isActive: z.boolean().default(true),
  targetUsers: z.enum(["all", "field", "office", "specific", "roles"]).default("all"),
  targetRoleIds: z.array(z.string()).default([]),
  specificUserIds: z.array(z.string()).default([]),
  scheduleType: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  scheduleTime: z.string().default("09:00"),
  scheduleDays: z.array(z.number()).default([]),
  sendInApp: z.boolean().default(true),
  sendEmail: z.boolean().default(false),
  sendPush: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

const TARGET_TYPE_OPTIONS = [
  { value: "timesheet", label: "Timesheet Submission", icon: Timer, description: "Remind users to submit timesheets" },
  { value: "site_diary", label: "Site Diary Entry", icon: ClipboardList, description: "Remind users to complete site diary" },
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

    const { data: reminders = [], isLoading } = useQuery<BusinessReminder[]>({
      queryKey: ["/api/business-reminders"],
    });

    const { data: roles = [] } = useQuery<UserRole[]>({
      queryKey: ["/api/roles/assignable"],
    });

    const { data: users = [] } = useQuery<User[]>({
      queryKey: ["/api/users/assignable"],
    });

    const form = useForm<FormValues>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        title: "",
        description: "",
        targetType: "timesheet",
        isActive: true,
        targetUsers: "all",
        targetRoleIds: [],
        specificUserIds: [],
        scheduleType: "weekly",
        scheduleTime: "16:30",
        scheduleDays: [1, 2, 3, 4, 5],
        sendInApp: true,
        sendEmail: false,
        sendPush: true,
      },
    });

    useImperativeHandle(ref, () => ({
      openNewReminderDialog: () => {
        setEditingReminder(null);
        form.reset({
          title: "",
          description: "",
          targetType: "timesheet",
          isActive: true,
          targetUsers: "all",
          targetRoleIds: [],
          specificUserIds: [],
          scheduleType: "weekly",
          scheduleTime: "16:30",
          scheduleDays: [1, 2, 3, 4, 5],
          sendInApp: true,
          sendEmail: false,
          sendPush: true,
        });
        setIsDialogOpen(true);
      },
    }));

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
      form.reset({
        title: reminder.title,
        description: reminder.description || "",
        targetType: reminder.targetType as any,
        isActive: reminder.isActive,
        targetUsers: reminder.targetUsers as any,
        targetRoleIds: (reminder.targetRoleIds as string[]) || [],
        specificUserIds: (reminder.specificUserIds as string[]) || [],
        scheduleType: reminder.scheduleType as any,
        scheduleTime: reminder.scheduleTime,
        scheduleDays: (reminder.scheduleDays as number[]) || [],
        sendInApp: reminder.sendInApp,
        sendEmail: reminder.sendEmail,
        sendPush: reminder.sendPush,
      });
      setIsDialogOpen(true);
    };

    const filteredReminders = reminders.filter(r => 
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    );

    const getTargetTypeInfo = (type: string) => {
      return TARGET_TYPE_OPTIONS.find(t => t.value === type) || TARGET_TYPE_OPTIONS[2];
    };

    const formatSchedule = (reminder: BusinessReminder) => {
      const time = reminder.scheduleTime || "09:00";
      const days = (reminder.scheduleDays as number[]) || [];
      
      if (reminder.scheduleType === "daily") {
        return `Daily at ${time}`;
      } else if (reminder.scheduleType === "weekly") {
        const dayLabels = days.map((d: number) => DAYS_OF_WEEK[d]?.label).join(", ");
        return `Weekly on ${dayLabels || "weekdays"} at ${time}`;
      } else if (reminder.scheduleType === "monthly") {
        return `Monthly on day ${days[0] || 1} at ${time}`;
      }
      return "Custom schedule";
    };

    const formatTargetAudience = (reminder: BusinessReminder) => {
      if (reminder.targetUsers === "all") return "All Users";
      if (reminder.targetUsers === "field") return "Field Team";
      if (reminder.targetUsers === "office") return "Office Team";
      if (reminder.targetUsers === "roles") {
        const roleIds = (reminder.targetRoleIds as string[]) || [];
        if (roleIds.length === 0) return "No roles selected";
        const roleNames = roleIds.map(id => roles.find(r => r.id === id)?.name).filter(Boolean);
        return roleNames.length > 2 ? `${roleNames.slice(0, 2).join(", ")} +${roleNames.length - 2}` : roleNames.join(", ");
      }
      if (reminder.targetUsers === "specific") {
        const userIds = (reminder.specificUserIds as string[]) || [];
        if (userIds.length === 0) return "No users selected";
        return `${userIds.length} user${userIds.length > 1 ? 's' : ''}`;
      }
      return "Custom";
    };

    const watchTargetUsers = form.watch("targetUsers");
    const watchScheduleType = form.watch("scheduleType");

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
              const typeInfo = getTargetTypeInfo(reminder.targetType);
              const TypeIcon = typeInfo.icon;
              
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
                      <span className="font-medium text-sm truncate">{reminder.title}</span>
                      {!reminder.isActive && (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Repeat className="h-3 w-3" />
                        {formatSchedule(reminder)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {formatTargetAudience(reminder)}
                      </span>
                    </div>
                    {reminder.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{reminder.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {reminder.sendPush && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Push</Badge>
                      )}
                      {reminder.sendEmail && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Email</Badge>
                      )}
                      {reminder.sendInApp && (
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
                  name="targetType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reminder Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-target-type">
                            <SelectValue placeholder="Select reminder type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TARGET_TYPE_OPTIONS.map((opt) => (
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
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Weekly Timesheet Reminder" data-testid="input-reminder-title" />
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

                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Target Audience
                  </h4>

                  <FormField
                    control={form.control}
                    name="targetUsers"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-target-users">
                              <SelectValue placeholder="Select target audience" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all">All Users</SelectItem>
                            <SelectItem value="field">Field Team</SelectItem>
                            <SelectItem value="office">Office Team</SelectItem>
                            <SelectItem value="roles">Specific Roles</SelectItem>
                            <SelectItem value="specific">Specific Users</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchTargetUsers === "roles" && (
                    <FormField
                      control={form.control}
                      name="targetRoleIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Roles</FormLabel>
                          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                            {roles.filter(r => r.isActive).map((role) => (
                              <div key={role.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`role-${role.id}`}
                                  checked={(field.value || []).includes(role.id)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    if (checked) {
                                      field.onChange([...current, role.id]);
                                    } else {
                                      field.onChange(current.filter(id => id !== role.id));
                                    }
                                  }}
                                  data-testid={`checkbox-role-${role.id}`}
                                />
                                <label htmlFor={`role-${role.id}`} className="text-sm cursor-pointer">
                                  {role.name}
                                </label>
                              </div>
                            ))}
                            {roles.filter(r => r.isActive).length === 0 && (
                              <p className="text-xs text-muted-foreground">No roles available</p>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {watchTargetUsers === "specific" && (
                    <FormField
                      control={form.control}
                      name="specificUserIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Users</FormLabel>
                          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                            {users.filter(u => u.isActive).map((user) => (
                              <div key={user.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`user-${user.id}`}
                                  checked={(field.value || []).includes(user.id)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    if (checked) {
                                      field.onChange([...current, user.id]);
                                    } else {
                                      field.onChange(current.filter(id => id !== user.id));
                                    }
                                  }}
                                  data-testid={`checkbox-user-${user.id}`}
                                />
                                <label htmlFor={`user-${user.id}`} className="text-sm cursor-pointer">
                                  {user.firstName && user.lastName 
                                    ? `${user.firstName} ${user.lastName}` 
                                    : user.email || 'Unknown User'}
                                </label>
                              </div>
                            ))}
                            {users.filter(u => u.isActive).length === 0 && (
                              <p className="text-xs text-muted-foreground">No users available</p>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Schedule
                  </h4>
                  
                  <FormField
                    control={form.control}
                    name="scheduleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-schedule-type">
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

                  {watchScheduleType === "weekly" && (
                    <FormField
                      control={form.control}
                      name="scheduleDays"
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

                  {watchScheduleType === "monthly" && (
                    <FormField
                      control={form.control}
                      name="scheduleDays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Day of Month</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              value={(field.value || [])[0] || 1}
                              onChange={(e) => field.onChange([parseInt(e.target.value) || 1])}
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
                    name="scheduleTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time</FormLabel>
                        <FormControl>
                          <Input type="time" step="900" {...field} data-testid="input-schedule-time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <h4 className="text-sm font-medium">Delivery Methods</h4>
                  
                  <div className="flex flex-wrap gap-4">
                    <FormField
                      control={form.control}
                      name="sendInApp"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-in-app" />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">In-App</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="sendPush"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-push" />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">Push</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="sendEmail"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-email" />
                          </FormControl>
                          <FormLabel className="!mt-0 cursor-pointer">Email</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
                    data-testid="button-submit"
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingReminder ? "Update Reminder" : "Create Reminder"}
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
                Are you sure you want to delete "{deleteReminder?.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteReminder && deleteMutation.mutate(deleteReminder.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
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
