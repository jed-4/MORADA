import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, formatDistanceToNow, isPast, isFuture, addMinutes } from "date-fns";
import { 
  Bell, Plus, Clock, CheckSquare, ClipboardList, Timer, 
  Wrench, Calendar, Trash2, Pencil, AlarmClockOff, AlarmClock,
  Filter, ChevronDown, MoreHorizontal, FileText, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { insertReminderSchema, type Reminder, type User } from "@shared/schema";

interface UserRemindersProps {
  user: User;
  isOwnPage: boolean;
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  reminderType: z.enum(["task", "site_diary", "timesheet", "defect", "custom"]).default("custom"),
  triggerAt: z.string().min(1, "Date and time is required"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

type FormValues = z.infer<typeof formSchema>;

const SNOOZE_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 180, label: "3 hours" },
  { value: 1440, label: "Tomorrow" },
];

const REMINDER_TYPE_ICONS: Record<string, any> = {
  task: CheckSquare,
  site_diary: ClipboardList,
  timesheet: Timer,
  defect: Wrench,
  custom: Bell,
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-orange-500",
};

export default function UserReminders({ user, isOwnPage }: UserRemindersProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [deleteReminder, setDeleteReminder] = useState<Reminder | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "snoozed" | "dismissed">("all");

  const { data: reminders = [], isLoading } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders"],
    queryFn: async () => {
      const response = await fetch('/api/reminders', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch reminders');
      }
      return response.json();
    },
    enabled: isOwnPage,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      reminderType: "custom",
      triggerAt: "",
      priority: "normal",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest("/api/reminders", "POST", {
        ...data,
        triggerAt: new Date(data.triggerAt).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
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
      const payload = { ...data };
      if (data.triggerAt) {
        (payload as any).triggerAt = new Date(data.triggerAt).toISOString();
      }
      return apiRequest(`/api/reminders/${id}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
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
      return apiRequest(`/api/reminders/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
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

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) => {
      return apiRequest(`/api/reminders/${id}/snooze`, "POST", { minutes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      toast({ title: "Reminder snoozed" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to snooze reminder", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/reminders/${id}/dismiss`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      toast({ title: "Reminder dismissed" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to dismiss reminder", 
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

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    const triggerDate = reminder.triggerAt ? new Date(reminder.triggerAt) : new Date();
    form.reset({
      title: reminder.title,
      description: reminder.description || "",
      reminderType: (reminder.reminderType as any) || "custom",
      triggerAt: format(triggerDate, "yyyy-MM-dd'T'HH:mm"),
      priority: (reminder.priority as any) || "normal",
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingReminder(null);
    const defaultTime = addMinutes(new Date(), 30);
    form.reset({
      title: "",
      description: "",
      reminderType: "custom",
      triggerAt: format(defaultTime, "yyyy-MM-dd'T'HH:mm"),
      priority: "normal",
    });
    setIsDialogOpen(true);
  };

  const filteredReminders = reminders.filter(r => {
    if (filterStatus === "all") return true;
    if (filterStatus === "active") return r.status === "pending" || r.status === "sent";
    if (filterStatus === "snoozed") return r.status === "snoozed";
    if (filterStatus === "dismissed") return r.status === "dismissed";
    return true;
  }).sort((a, b) => {
    const aTime = a.triggerAt ? new Date(a.triggerAt).getTime() : 0;
    const bTime = b.triggerAt ? new Date(b.triggerAt).getTime() : 0;
    return aTime - bTime;
  });

  const getReminderTimeStatus = (reminder: Reminder) => {
    if (!reminder.triggerAt) return { label: "No date", color: "text-muted-foreground" };
    const triggerDate = new Date(reminder.triggerAt);
    
    if (reminder.status === "snoozed" && reminder.snoozedUntil) {
      return { 
        label: `Snoozed until ${format(new Date(reminder.snoozedUntil), "MMM d, h:mm a")}`, 
        color: "text-orange-500" 
      };
    }
    
    if (isPast(triggerDate)) {
      return { 
        label: `Overdue (${formatDistanceToNow(triggerDate, { addSuffix: true })})`, 
        color: "text-destructive" 
      };
    }
    
    return { 
      label: formatDistanceToNow(triggerDate, { addSuffix: true }), 
      color: "text-muted-foreground" 
    };
  };

  if (!isOwnPage) {
    return (
      <div className="flex items-center justify-center h-64 text-center">
        <div className="text-muted-foreground">
          Reminders are only visible on your own profile.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground text-sm">Loading reminders...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" data-testid="user-reminders-content">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">My Reminders</h3>
          <Badge variant="secondary" className="text-xs">
            {filteredReminders.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" data-testid="filter-status-dropdown">
                <Filter className="h-3 w-3" />
                <span>{filterStatus === "all" ? "All" : filterStatus}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFilterStatus("all")}>All Reminders</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("active")}>Active</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("snoozed")}>Snoozed</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterStatus("dismissed")}>Dismissed</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            onClick={openCreateDialog}
            className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
            size="sm"
            data-testid="button-create-reminder"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Reminder
          </Button>
        </div>
      </div>

      {filteredReminders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            {filterStatus === "all" ? "No reminders yet" : `No ${filterStatus} reminders`}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create personal reminders to stay on top of your work.
          </p>
          {filterStatus === "all" && (
            <Button 
              onClick={openCreateDialog}
              className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
              data-testid="button-create-first-reminder"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Reminder
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReminders.map((reminder) => {
            const TypeIcon = REMINDER_TYPE_ICONS[reminder.reminderType || "custom"] || Bell;
            const timeStatus = getReminderTimeStatus(reminder);
            const isDismissed = reminder.status === "dismissed";
            const isSnoozed = reminder.status === "snoozed";
            
            return (
              <div
                key={reminder.id}
                className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate ${
                  isDismissed ? "opacity-60" : ""
                }`}
                data-testid={`reminder-item-${reminder.id}`}
              >
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${
                  isDismissed ? "bg-muted" : isSnoozed ? "bg-orange-500/10" : "bg-[#bba7db]/10"
                }`}>
                  {isSnoozed ? (
                    <AlarmClockOff className="h-4 w-4 text-orange-500" />
                  ) : (
                    <TypeIcon className={`h-4 w-4 ${isDismissed ? "text-muted-foreground" : "text-[#bba7db]"}`} />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-medium text-sm truncate ${PRIORITY_COLORS[reminder.priority || "normal"]}`}>
                      {reminder.title}
                    </span>
                    {reminder.priority === "high" && (
                      <AlertTriangle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                    )}
                    {isDismissed && (
                      <Badge variant="outline" className="text-xs">Dismissed</Badge>
                    )}
                    {isSnoozed && (
                      <Badge variant="outline" className="text-xs text-orange-500 border-orange-500/30">Snoozed</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={timeStatus.color}>
                      <Clock className="h-3 w-3 inline mr-1" />
                      {reminder.triggerAt && format(new Date(reminder.triggerAt), "MMM d, h:mm a")}
                    </span>
                    <span className={timeStatus.color}>
                      ({timeStatus.label})
                    </span>
                  </div>
                  {reminder.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{reminder.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {!isDismissed && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`snooze-dropdown-${reminder.id}`}>
                          <AlarmClock className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                          Snooze for...
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {SNOOZE_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => snoozeMutation.mutate({ id: reminder.id, minutes: option.value })}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`actions-dropdown-${reminder.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(reminder)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {!isDismissed && (
                        <DropdownMenuItem onClick={() => dismissMutation.mutate(reminder.id)}>
                          <AlarmClockOff className="h-4 w-4 mr-2" />
                          Dismiss
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setDeleteReminder(reminder)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingReminder ? "Edit Reminder" : "Create Reminder"}</DialogTitle>
            <DialogDescription>
              Set a personal reminder to stay on top of your tasks.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., Review site photos" data-testid="input-reminder-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="triggerAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>When</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-reminder-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="reminderType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-reminder-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="custom">Custom</SelectItem>
                          <SelectItem value="task">Task</SelectItem>
                          <SelectItem value="site_diary">Site Diary</SelectItem>
                          <SelectItem value="timesheet">Timesheet</SelectItem>
                          <SelectItem value="defect">Defect</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-priority">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Add any additional notes..." rows={2} data-testid="input-reminder-notes" />
                    </FormControl>
                    <FormMessage />
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
                  {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editingReminder ? "Update" : "Create"}
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
