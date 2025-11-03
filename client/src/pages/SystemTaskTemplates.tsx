import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Calendar as CalendarIcon,
  Tag as TagIcon,
  X,
} from "lucide-react";
import type { TaskTemplate, TaskTag, TaskTemplateStatus } from "@shared/schema";

interface RecurringScheduleItem {
  dayOfWeek: number;
  startTime: string;
  duration: number;
}

interface TaskTemplateFormData {
  title: string;
  goal?: string;
  description?: string;
  statusId?: string;
  defaultRoleId?: string;
  tagIds: string[];
  isRecurringTemplate: boolean;
  recurringDays: number[];
  recurringSchedule: RecurringScheduleItem[];
  recurringStartTime?: string; // DEPRECATED
  recurringDuration?: number; // DEPRECATED
  recurringAssigneeId?: string; // DEPRECATED
  estimatedDuration?: number;
  checklist: Array<{ text: string; completed: boolean }>;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun", fullLabel: "Sunday" },
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
];

export default function SystemTaskTemplates() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [formData, setFormData] = useState<TaskTemplateFormData>({
    title: "",
    goal: "",
    description: "",
    statusId: undefined,
    defaultRoleId: undefined,
    tagIds: [],
    isRecurringTemplate: false,
    recurringDays: [],
    recurringSchedule: [],
    recurringStartTime: "",
    recurringDuration: undefined,
    recurringAssigneeId: undefined,
    estimatedDuration: undefined,
    checklist: [],
  });
  const [checklistInput, setChecklistInput] = useState("");

  // Queries
  const { data: templates = [], isLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/task-templates"],
  });

  const { data: tags = [] } = useQuery<TaskTag[]>({ queryKey: ["/api/task-tags"] });
  const { data: statuses = [] } = useQuery<TaskTemplateStatus[]>({
    queryKey: ["/api/task-template-statuses"],
  });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: userRoles = [] } = useQuery<any[]>({ queryKey: ["/api/user-roles"] });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: Partial<TaskTemplateFormData>) =>
      await apiRequest("/api/task-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      toast({
        title: "Template created",
        description: "The task template has been created successfully.",
      });
      handleCloseDialog();
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to create task template.",
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaskTemplateFormData> }) =>
      await apiRequest(`/api/task-templates/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      toast({
        title: "Template updated",
        description: "The task template has been updated successfully.",
      });
      handleCloseDialog();
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to update task template.",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest(`/api/task-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      toast({
        title: "Template deleted",
        description: "The task template has been deleted successfully.",
      });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to delete task template.",
        variant: "destructive",
      }),
  });

  // Handlers
  const handleOpenDialog = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        title: template.title,
        goal: template.goal || "",
        description: template.description || "",
        statusId: template.statusId || undefined,
        defaultRoleId: template.defaultRoleId || undefined,
        tagIds: (template.tagIds as string[]) || [],
        isRecurringTemplate: template.isRecurringTemplate || false,
        recurringDays: (template.recurringDays as number[]) || [],
        recurringSchedule: (template.recurringSchedule as RecurringScheduleItem[]) || [],
        recurringStartTime: template.recurringStartTime || "",
        recurringDuration: template.recurringDuration || undefined,
        recurringAssigneeId: template.recurringAssigneeId || undefined,
        estimatedDuration: template.estimatedDuration || undefined,
        checklist: (template.checklist as Array<{ text: string; completed: boolean }>) || [],
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        title: "",
        goal: "",
        description: "",
        statusId: undefined,
        defaultRoleId: undefined,
        tagIds: [],
        isRecurringTemplate: false,
        recurringDays: [],
        recurringSchedule: [],
        recurringStartTime: "",
        recurringDuration: undefined,
        recurringAssigneeId: undefined,
        estimatedDuration: undefined,
        checklist: [],
      });
    }
    setChecklistInput("");
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({
        title: "Validation error",
        description: "Template title is required.",
        variant: "destructive",
      });
      return;
    }

    const dataToSubmit = {
      title: formData.title,
      goal: formData.goal || undefined,
      description: formData.description || undefined,
      statusId: formData.statusId || undefined,
      defaultRoleId: formData.defaultRoleId || undefined,
      tagIds: formData.tagIds,
      isRecurringTemplate: formData.isRecurringTemplate,
      recurringDays: formData.isRecurringTemplate ? formData.recurringDays : [],
      recurringSchedule: formData.isRecurringTemplate ? formData.recurringSchedule : [],
      estimatedDuration: formData.estimatedDuration || undefined,
      checklist: formData.checklist,
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: dataToSubmit });
    } else {
      createMutation.mutate(dataToSubmit);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this task template?")) {
      deleteMutation.mutate(id);
    }
  };

  const toggleTag = (tagId: string) => {
    setFormData(prev => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter(id => id !== tagId)
        : [...prev.tagIds, tagId],
    }));
  };

  const toggleDay = (day: number) => {
    setFormData(prev => {
      const isSelected = prev.recurringDays.includes(day);
      const newRecurringDays = isSelected
        ? prev.recurringDays.filter(d => d !== day)
        : [...prev.recurringDays, day].sort((a, b) => a - b);
      
      // If deselecting a day, remove its schedule entry
      const newRecurringSchedule = isSelected
        ? prev.recurringSchedule.filter(s => s.dayOfWeek !== day)
        : prev.recurringSchedule;

      return {
        ...prev,
        recurringDays: newRecurringDays,
        recurringSchedule: newRecurringSchedule,
      };
    });
  };

  const updateDaySchedule = (dayOfWeek: number, startTime: string, duration: number) => {
    setFormData(prev => {
      const existingIndex = prev.recurringSchedule.findIndex(s => s.dayOfWeek === dayOfWeek);
      const newRecurringSchedule = [...prev.recurringSchedule];
      
      if (existingIndex >= 0) {
        newRecurringSchedule[existingIndex] = { dayOfWeek, startTime, duration };
      } else {
        newRecurringSchedule.push({ dayOfWeek, startTime, duration });
      }

      return {
        ...prev,
        recurringSchedule: newRecurringSchedule,
      };
    });
  };

  const getDaySchedule = (dayOfWeek: number): RecurringScheduleItem | undefined => {
    return formData.recurringSchedule.find(s => s.dayOfWeek === dayOfWeek);
  };

  const addChecklistItem = () => {
    if (checklistInput.trim()) {
      setFormData(prev => ({
        ...prev,
        checklist: [...prev.checklist, { text: checklistInput.trim(), completed: false }],
      }));
      setChecklistInput("");
    }
  };

  const removeChecklistItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index),
    }));
  };

  const getTagById = (id: string) => tags.find(tag => tag.id === id);
  const getStatusById = (id: string) => statuses.find(status => status.id === id);

  return (
    <div className="flex flex-col h-full" data-testid="system-task-templates">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Task Templates</h1>
              <p className="text-muted-foreground mt-1">
                Create and manage reusable task templates for common workflows and processes.
              </p>
            </div>
            <Button onClick={() => handleOpenDialog()} data-testid="button-create-template">
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 p-6">
                <p className="text-muted-foreground text-center">
                  No task templates yet. Create your first template to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Recurring</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map(template => {
                      const templateTags = (template.tagIds as string[] || [])
                        .map(id => getTagById(id))
                        .filter(Boolean);
                      const templateStatus = template.statusId ? getStatusById(template.statusId) : null;

                      return (
                        <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{template.title}</span>
                              {template.goal && (
                                <span className="text-sm text-muted-foreground">{template.goal}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {templateStatus && (
                              <Badge
                                style={{ backgroundColor: templateStatus.color }}
                                className="text-white"
                                data-testid={`badge-status-${template.id}`}
                              >
                                {templateStatus.name}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {templateTags.map(tag => (
                                <Badge
                                  key={tag.id}
                                  style={{ backgroundColor: tag.color }}
                                  className="text-white text-xs"
                                  data-testid={`badge-tag-${tag.id}-${template.id}`}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {template.isRecurringTemplate && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span>
                                  {(template.recurringDays as number[] || []).length} day(s)
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenDialog(template)}
                                data-testid={`button-edit-${template.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(template.id)}
                                data-testid={`button-delete-${template.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {editingTemplate ? "Edit Task Template" : "Create Task Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the task template details below."
                : "Create a new reusable task template."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Title */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Daily Site Inspection"
                data-testid="input-title"
              />
            </div>

            {/* Goal */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="goal">Goal</Label>
              <Input
                id="goal"
                value={formData.goal}
                onChange={e => setFormData(prev => ({ ...prev, goal: e.target.value }))}
                placeholder="Brief, to-the-point goal"
                data-testid="input-goal"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description..."
                rows={3}
                data-testid="input-description"
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.statusId}
                onValueChange={value => setFormData(prev => ({ ...prev, statusId: value }))}
              >
                <SelectTrigger id="status" data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(status => (
                    <SelectItem key={status.id} value={status.id} data-testid={`status-option-${status.id}`}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-2">
              <Label>
                <TagIcon className="w-4 h-4 inline mr-1" />
                Tags
              </Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[44px]" data-testid="tags-container">
                {tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tags available. Create tags in Task Settings.
                  </p>
                ) : (
                  tags.map(tag => {
                    const isSelected = formData.tagIds.includes(tag.id);
                    return (
                      <Badge
                        key={tag.id}
                        style={{
                          backgroundColor: isSelected ? tag.color : "transparent",
                          borderColor: tag.color,
                          color: isSelected ? "white" : tag.color,
                        }}
                        className="cursor-pointer border-2"
                        onClick={() => toggleTag(tag.id)}
                        data-testid={`tag-${tag.id}`}
                      >
                        {tag.name}
                        {isSelected && <X className="w-3 h-3 ml-1" />}
                      </Badge>
                    );
                  })
                )}
              </div>
            </div>

            {/* Estimated Duration */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="estimatedDuration">Estimated Duration (minutes)</Label>
              <Input
                id="estimatedDuration"
                type="number"
                min="0"
                value={formData.estimatedDuration || ""}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    estimatedDuration: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                placeholder="60"
                data-testid="input-estimated-duration"
              />
            </div>

            {/* Checklist */}
            <div className="flex flex-col gap-2">
              <Label>Checklist Items</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add checklist item..."
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                  data-testid="input-checklist"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addChecklistItem}
                  disabled={!checklistInput.trim()}
                  data-testid="button-add-checklist"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.checklist.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  {formData.checklist.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 border rounded-md bg-muted/30"
                      data-testid={`checklist-item-${index}`}
                    >
                      <span className="flex-1 text-sm">{item.text}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChecklistItem(index)}
                        data-testid={`button-remove-checklist-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recurring Template */}
            <div className="flex flex-col gap-4 p-4 border rounded-md">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRecurringTemplate"
                  checked={formData.isRecurringTemplate}
                  onCheckedChange={checked =>
                    setFormData(prev => ({ ...prev, isRecurringTemplate: checked as boolean }))
                  }
                  data-testid="checkbox-recurring"
                />
                <Label htmlFor="isRecurringTemplate" className="cursor-pointer">
                  <CalendarIcon className="w-4 h-4 inline mr-1" />
                  Enable Recurring Schedule (Perfect Week)
                </Label>
              </div>

              {formData.isRecurringTemplate && (
                <div className="flex flex-col gap-4 pl-6">
                  {/* Days of Week */}
                  <div className="flex flex-col gap-2">
                    <Label>Days of Week</Label>
                    <div className="flex flex-wrap gap-2" data-testid="recurring-days">
                      {DAYS_OF_WEEK.map(day => {
                        const isSelected = formData.recurringDays.includes(day.value);
                        return (
                          <Badge
                            key={day.value}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleDay(day.value)}
                            data-testid={`day-${day.value}`}
                          >
                            {day.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* Day-specific times */}
                  {formData.recurringDays.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <Label>Schedule for Each Day</Label>
                      <div className="flex flex-col gap-2">
                        {formData.recurringDays.map(dayValue => {
                          const day = DAYS_OF_WEEK.find(d => d.value === dayValue);
                          const schedule = getDaySchedule(dayValue);
                          return (
                            <div
                              key={dayValue}
                              className="flex items-center gap-2 p-2 border rounded-md bg-muted/20"
                              data-testid={`day-schedule-${dayValue}`}
                            >
                              <span className="w-16 text-sm font-medium">{day?.fullLabel}</span>
                              <Input
                                type="time"
                                value={schedule?.startTime || "09:00"}
                                onChange={e =>
                                  updateDaySchedule(
                                    dayValue,
                                    e.target.value,
                                    schedule?.duration || 60
                                  )
                                }
                                className="w-32"
                                data-testid={`time-${dayValue}`}
                              />
                              <Input
                                type="number"
                                min="1"
                                value={schedule?.duration || 60}
                                onChange={e =>
                                  updateDaySchedule(
                                    dayValue,
                                    schedule?.startTime || "09:00",
                                    parseInt(e.target.value) || 60
                                  )
                                }
                                placeholder="60"
                                className="w-24"
                                data-testid={`duration-${dayValue}`}
                              />
                              <span className="text-xs text-muted-foreground">min</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Role Assignment */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="defaultRole">Assign to Role</Label>
                    <Select
                      value={formData.defaultRoleId}
                      onValueChange={value =>
                        setFormData(prev => ({ ...prev, defaultRoleId: value }))
                      }
                    >
                      <SelectTrigger id="defaultRole" data-testid="select-role">
                        <SelectValue placeholder="Select role (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {userRoles.map((role: any) => (
                          <SelectItem key={role.id} value={role.id} data-testid={`role-option-${role.id}`}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Tasks will be created for all users with this role
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingTemplate
                  ? "Update Template"
                  : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
