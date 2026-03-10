import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addMinutes, addHours, addDays } from "date-fns";
import { Bell, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface PendingReminderData {
  title: string;
  description?: string;
  triggerAt: string;
  priority: "low" | "normal" | "high";
  targetUserId?: string;
}

interface SetReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedItemType?: "task" | "site_diary" | "timesheet" | "defect";
  linkedItemId?: string;
  linkedItemTitle?: string;
  projectId?: string;
  targetUserId?: string;
  onPendingReminder?: (data: PendingReminderData) => void;
}

const QUICK_OPTIONS = [
  { value: "15min", label: "In 15 minutes", getTime: () => addMinutes(new Date(), 15) },
  { value: "1hour", label: "In 1 hour", getTime: () => addHours(new Date(), 1) },
  { value: "3hours", label: "In 3 hours", getTime: () => addHours(new Date(), 3) },
  { value: "tomorrow", label: "Tomorrow morning", getTime: () => {
    const tomorrow = addDays(new Date(), 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }},
  { value: "custom", label: "Custom time...", getTime: () => addHours(new Date(), 1) },
];

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  triggerAt: z.string().min(1, "Date and time is required"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

type FormValues = z.infer<typeof formSchema>;

export function SetReminderDialog({
  open,
  onOpenChange,
  linkedItemType,
  linkedItemId,
  linkedItemTitle,
  projectId,
  targetUserId,
  onPendingReminder,
}: SetReminderDialogProps) {
  const { toast } = useToast();
  const [quickOption, setQuickOption] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: linkedItemTitle ? `Reminder: ${linkedItemTitle}` : "",
      description: "",
      triggerAt: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"),
      priority: "normal",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const payload: any = {
        title: data.title,
        description: data.description,
        dueAt: new Date(data.triggerAt).toISOString(),
        priority: data.priority,
        reminderType: linkedItemType || "custom",
      };

      if (linkedItemId) {
        payload.linkedItemType = linkedItemType;
        payload.linkedItemId = linkedItemId;
        
        if (linkedItemType === "task") payload.taskId = linkedItemId;
        else if (linkedItemType === "defect") payload.defectId = linkedItemId;
        else if (linkedItemType === "site_diary") payload.siteDiaryId = linkedItemId;
        else if (linkedItemType === "timesheet") payload.timesheetId = linkedItemId;
      }

      if (projectId) {
        payload.projectId = projectId;
      }

      if (targetUserId) {
        payload.targetUserId = targetUserId;
      }

      return apiRequest("/api/reminders", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      // Invalidate task-specific reminders query if this reminder is linked to a task
      if (linkedItemType === "task" && linkedItemId) {
        queryClient.invalidateQueries({ queryKey: ["/api/reminders/for-item", "task", linkedItemId] });
      }
      toast({ title: "Reminder set successfully" });
      onOpenChange(false);
      form.reset();
      setQuickOption(null);
      setShowCustom(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create reminder", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleQuickOptionSelect = (value: string) => {
    setQuickOption(value);
    if (value === "custom") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      const option = QUICK_OPTIONS.find(o => o.value === value);
      if (option) {
        const time = option.getTime();
        form.setValue("triggerAt", format(time, "yyyy-MM-dd'T'HH:mm"));
      }
    }
  };

  const onSubmit = (data: FormValues) => {
    if (onPendingReminder && !linkedItemId) {
      onPendingReminder({
        title: data.title,
        description: data.description,
        triggerAt: data.triggerAt,
        priority: data.priority,
        targetUserId: targetUserId,
      });
      onOpenChange(false);
      form.reset();
      setQuickOption(null);
      setShowCustom(false);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#bba7db]" />
            Set Reminder
          </DialogTitle>
          <DialogDescription>
            {linkedItemTitle 
              ? `Create a reminder for "${linkedItemTitle}"`
              : "Create a personal reminder"
            }
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
                    <Input {...field} placeholder="What to remember..." data-testid="input-reminder-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>When</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={quickOption === option.value ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs justify-start"
                    onClick={() => handleQuickOptionSelect(option.value)}
                    data-testid={`quick-option-${option.value}`}
                  >
                    <Clock className="h-3 w-3 mr-1.5" />
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {showCustom && (
              <FormField
                control={form.control}
                name="triggerAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-custom-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Add any notes..." rows={2} data-testid="input-reminder-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || !quickOption}
                className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
                data-testid="button-set-reminder"
              >
                {createMutation.isPending ? "Setting..." : "Set Reminder"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
