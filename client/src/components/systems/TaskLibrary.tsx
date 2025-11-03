import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, 
  MoreVertical, 
  Trash2, 
  Edit, 
  Power,
  PowerOff,
  X,
  Link,
  CheckSquare,
  Target,
  Calendar as CalendarIcon
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTaskTemplateCategoryOptions } from "@/hooks/useTaskTemplateCategoryOptions";
import type { TaskTemplate, UserRole } from "@shared/schema";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun", fullLabel: "Sunday" },
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
];

export function TaskLibrary() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const { toast } = useToast();
  const { categoryOptions, getCategoryInfo } = useTaskTemplateCategoryOptions();

  // Form state
  const [templateForm, setTemplateForm] = useState({
    title: "",
    goal: "",
    description: "",
    defaultRoleId: "",
    frequency: "once",
    category: "",
    estimatedDuration: 0,
    status: "active" as "active" | "draft" | "archived",
    isActive: true,
    dueTime: "",
    dueDayOfWeek: [] as number[],
    dueDayOfMonth: 1,
    checklist: [] as Array<{ text: string; completed: boolean }>,
    externalLinks: [] as string[],
    isRecurringTemplate: false,
    recurringDays: [] as number[],
    recurringSchedule: [] as Array<{ dayOfWeek: number; startTime: string; duration: number }>,
  });

  // Fetch task templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/systems/task-templates"],
  });

  // Fetch user roles
  const { data: roles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/user-roles"],
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/systems/task-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Task template created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create task template", variant: "destructive" });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/systems/task-templates/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      setShowDialog(false);
      setEditingTemplate(null);
      resetForm();
      toast({ title: "Task template updated successfully" });
    },
    onError: (error: any) => {
      console.error("Update error:", error);
      const errorMessage = error?.message || error?.details || "Failed to update task template";
      toast({ title: errorMessage, variant: "destructive" });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/task-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      toast({ title: "Task template deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete task template", variant: "destructive" });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => 
      apiRequest(`/api/systems/task-templates/${id}`, "PATCH", { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/task-templates"] });
      toast({ title: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTemplateForm({
      title: "",
      goal: "",
      description: "",
      defaultRoleId: "",
      frequency: "once",
      category: "",
      estimatedDuration: 0,
      status: "active",
      isActive: true,
      dueTime: "",
      dueDayOfWeek: [],
      dueDayOfMonth: 1,
      checklist: [],
      externalLinks: [],
      isRecurringTemplate: false,
      recurringDays: [],
      recurringSchedule: [],
    });
  };

  const openNewTemplateDialog = () => {
    setEditingTemplate(null);
    resetForm();
    setShowDialog(true);
  };

  const openEditTemplateDialog = (template: TaskTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      title: template.title,
      goal: template.goal || "",
      description: template.description || "",
      defaultRoleId: template.defaultRoleId || "",
      frequency: template.frequency || "once",
      category: template.category || "",
      estimatedDuration: template.estimatedDuration || 0,
      status: (template.status as "active" | "draft" | "archived") || "active",
      isActive: template.isActive,
      dueTime: template.dueTime || "",
      dueDayOfWeek: template.dueDayOfWeek ? (Array.isArray(template.dueDayOfWeek) ? template.dueDayOfWeek : JSON.parse(template.dueDayOfWeek as string)) : [],
      dueDayOfMonth: template.dueDayOfMonth || 1,
      checklist: template.checklist ? (Array.isArray(template.checklist) ? template.checklist : JSON.parse(template.checklist as string)) : [],
      externalLinks: template.externalLinks ? (Array.isArray(template.externalLinks) ? template.externalLinks : JSON.parse(template.externalLinks as string)) : [],
      isRecurringTemplate: template.isRecurringTemplate || false,
      recurringDays: template.recurringDays ? (Array.isArray(template.recurringDays) ? template.recurringDays : JSON.parse(template.recurringDays as string)) : [],
      recurringSchedule: template.recurringSchedule ? (Array.isArray(template.recurringSchedule) ? template.recurringSchedule : JSON.parse(template.recurringSchedule as string)) : [],
    });
    setShowDialog(true);
  };

  const handleSaveTemplate = () => {
    // Clean up the data before sending
    const cleanedData = {
      ...templateForm,
      // Remove empty external links
      externalLinks: templateForm.externalLinks.filter(link => link.trim() !== ""),
      // Only include recurring fields if enabled
      ...(templateForm.isRecurringTemplate ? {
        isRecurringTemplate: true,
        // Filter out schedule items with empty startTime
        recurringSchedule: templateForm.recurringSchedule.filter(
          schedule => schedule.startTime && schedule.startTime.trim() !== ""
        ),
        defaultRoleId: templateForm.defaultRoleId || null,
      } : {
        isRecurringTemplate: false,
        recurringSchedule: [],
        recurringDays: [],
      }),
    };

    console.log("Saving template with data:", cleanedData);

    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: cleanedData });
    } else {
      createTemplateMutation.mutate(cleanedData);
    }
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return "-";
    const role = roles.find((r) => r.id === roleId);
    return role?.name || "Unknown";
  };

  const getFrequencyLabel = (template: TaskTemplate) => {
    const freq = template.frequency || "once";
    let label = freq.charAt(0).toUpperCase() + freq.slice(1);
    
    if (freq === "daily" && template.dueTime) {
      label += ` at ${template.dueTime}`;
    } else if (freq === "weekly" && template.dueDayOfWeek) {
      const days = typeof template.dueDayOfWeek === 'string' ? JSON.parse(template.dueDayOfWeek) : template.dueDayOfWeek;
      if (Array.isArray(days) && days.length > 0) {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        label += ` (${days.map((d: number) => dayNames[d]).join(", ")})`;
      }
    } else if (freq === "monthly" && template.dueDayOfMonth) {
      label += ` on day ${template.dueDayOfMonth}`;
    }
    
    return label;
  };

  const toggleDayOfWeek = (day: number) => {
    setTemplateForm((prev) => ({
      ...prev,
      dueDayOfWeek: prev.dueDayOfWeek.includes(day)
        ? prev.dueDayOfWeek.filter((d) => d !== day)
        : [...prev.dueDayOfWeek, day].sort()
    }));
  };

  // Recurring schedule helper functions
  const toggleDay = (day: number) => {
    setTemplateForm(prev => {
      const isSelected = prev.recurringDays.includes(day);
      const newRecurringDays = isSelected
        ? prev.recurringDays.filter(d => d !== day)
        : [...prev.recurringDays, day].sort((a, b) => a - b);
      
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
    setTemplateForm(prev => {
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

  const getDaySchedule = (dayOfWeek: number): { dayOfWeek: number; startTime: string; duration: number } | undefined => {
    return templateForm.recurringSchedule.find(s => s.dayOfWeek === dayOfWeek);
  };

  // Checklist management
  const addChecklistItem = () => {
    setTemplateForm((prev) => ({
      ...prev,
      checklist: [...prev.checklist, { text: "", completed: false }]
    }));
  };

  const updateChecklistItem = (index: number, text: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      checklist: prev.checklist.map((item, i) => 
        i === index ? { ...item, text } : item
      )
    }));
  };

  const removeChecklistItem = (index: number) => {
    setTemplateForm((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index)
    }));
  };

  // External links management
  const addExternalLink = () => {
    setTemplateForm((prev) => ({
      ...prev,
      externalLinks: [...prev.externalLinks, ""]
    }));
  };

  const updateExternalLink = (index: number, value: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      externalLinks: prev.externalLinks.map((link, i) => 
        i === index ? value : link
      )
    }));
  };

  const removeExternalLink = (index: number) => {
    setTemplateForm((prev) => ({
      ...prev,
      externalLinks: prev.externalLinks.filter((_, i) => i !== index)
    }));
  };

  if (templatesLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading...</div>
      </Card>
    );
  }

  const activeTemplates = templates.filter((t) => t.isActive);
  const inactiveTemplates = templates.filter((t) => !t.isActive);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <Power className="h-3 w-3 text-green-600" />
            {activeTemplates.length} Active
          </Badge>
          <Badge variant="outline" className="gap-1">
            <PowerOff className="h-3 w-3 text-muted-foreground" />
            {inactiveTemplates.length} Inactive
          </Badge>
        </div>
        <Button onClick={openNewTemplateDialog} data-testid="button-new-template">
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {templates.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              No task templates yet. Create your first template to get started.
            </div>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Title & Goal</TableHead>
                  <TableHead className="w-[200px]">Info</TableHead>
                  <TableHead className="w-[150px]">Role</TableHead>
                  <TableHead className="w-[150px]">Frequency</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => {
                  const checklistCount = Array.isArray(template.checklist) ? template.checklist.length : 0;
                  const linksCount = Array.isArray(template.externalLinks) ? template.externalLinks.length : 0;
                  const hasGoal = !!template.goal;
                  
                  return (
                    <TableRow key={template.id} data-testid={`template-row-${template.id}`}>
                      <TableCell>
                        <div className="font-medium">{template.title}</div>
                        {hasGoal && (
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {template.goal}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {template.status && (
                            <Badge variant={template.status === 'active' ? 'default' : template.status === 'draft' ? 'secondary' : 'outline'}>
                              {template.status}
                            </Badge>
                          )}
                          {template.category && (() => {
                            const categoryInfo = getCategoryInfo(template.category);
                            return (
                              <Badge 
                                variant="outline" 
                                style={{ 
                                  borderColor: categoryInfo?.color || '#6B7280',
                                  color: categoryInfo?.color || '#6B7280'
                                }}
                              >
                                {categoryInfo?.name || template.category}
                              </Badge>
                            );
                          })()}
                          {checklistCount > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <CheckSquare className="h-3 w-3" />
                              {checklistCount}
                            </Badge>
                          )}
                          {linksCount > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <Link className="h-3 w-3" />
                              {linksCount}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getRoleName(template.defaultRoleId)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getFrequencyLabel(template)}
                      </TableCell>
                      <TableCell>
                        {template.isActive ? (
                          <Badge variant="outline" className="gap-1">
                            <Power className="h-3 w-3 text-green-600" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <PowerOff className="h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`template-menu-${template.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditTemplateDialog(template)} data-testid="menu-edit-template">
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => toggleActiveMutation.mutate({ 
                                id: template.id, 
                                isActive: !template.isActive 
                              })}
                              data-testid={template.isActive ? "menu-deactivate-template" : "menu-activate-template"}
                            >
                              {template.isActive ? (
                                <>
                                  <PowerOff className="h-4 w-4 mr-2" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <Power className="h-4 w-4 mr-2" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteTemplateMutation.mutate(template.id)}
                              className="text-destructive"
                              data-testid="menu-delete-template"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Template Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) {
          setEditingTemplate(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-template">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Task Template"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 max-h-[calc(90vh-150px)] overflow-y-auto pr-2">
            <div>
              <Label>
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={templateForm.title}
                onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                placeholder="Task template title"
                data-testid="input-template-title"
                required
              />
            </div>
            <div>
              <Label>Goal</Label>
              <Input
                value={templateForm.goal}
                onChange={(e) => setTemplateForm({ ...templateForm, goal: e.target.value })}
                placeholder="Brief, to-the-point goal"
                data-testid="input-template-goal"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Detailed description"
                data-testid="input-template-description"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={templateForm.status}
                onValueChange={(value: "active" | "draft" | "archived") => setTemplateForm({ ...templateForm, status: value })}
              >
                <SelectTrigger data-testid="select-template-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recurring Schedule Section */}
            <div className="border-2 rounded-md p-4 bg-muted/5">
              <div className="flex items-center gap-2 mb-3">
                <Checkbox
                  id="recurring-template"
                  checked={templateForm.isRecurringTemplate}
                  onCheckedChange={(checked) => 
                    setTemplateForm({ ...templateForm, isRecurringTemplate: checked as boolean })
                  }
                  data-testid="checkbox-recurring-template"
                />
                <Label htmlFor="recurring-template" className="flex items-center gap-2 cursor-pointer font-semibold">
                  <CalendarIcon className="h-4 w-4" />
                  Enable Recurring Schedule (Perfect Week)
                </Label>
              </div>

              {templateForm.isRecurringTemplate && (
                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Select Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <Badge
                          key={day.value}
                          variant={templateForm.recurringDays.includes(day.value) ? "default" : "outline"}
                          className="cursor-pointer hover-elevate active-elevate-2"
                          onClick={() => toggleDay(day.value)}
                          data-testid={`badge-recurring-day-${day.label.toLowerCase()}`}
                        >
                          {day.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {templateForm.recurringDays.length > 0 && (
                    <>
                      <div>
                        <Label>Default Role Assignment</Label>
                        <Select
                          value={templateForm.defaultRoleId}
                          onValueChange={(value) => setTemplateForm({ ...templateForm, defaultRoleId: value })}
                        >
                          <SelectTrigger data-testid="select-recurring-role">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        <Label>Day Schedules</Label>
                        {templateForm.recurringDays.map((dayValue) => {
                          const day = DAYS_OF_WEEK.find(d => d.value === dayValue);
                          const schedule = getDaySchedule(dayValue);
                          
                          return (
                            <div key={dayValue} className="border-2 rounded-md p-3">
                              <div className="font-medium mb-2">{day?.fullLabel}</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Start Time</Label>
                                  <Input
                                    type="time"
                                    value={schedule?.startTime || ""}
                                    onChange={(e) => updateDaySchedule(dayValue, e.target.value, schedule?.duration || 60)}
                                    data-testid={`input-recurring-time-${day?.label.toLowerCase()}`}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Duration (min)</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={schedule?.duration || ""}
                                    onChange={(e) => updateDaySchedule(dayValue, schedule?.startTime || "", parseInt(e.target.value) || 60)}
                                    placeholder="60"
                                    data-testid={`input-recurring-duration-${day?.label.toLowerCase()}`}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label>Frequency</Label>
              <Select
                value={templateForm.frequency}
                onValueChange={(value) => setTemplateForm({ ...templateForm, frequency: value })}
              >
                <SelectTrigger data-testid="select-template-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Conditional frequency fields */}
            {templateForm.frequency === "daily" && (
              <div>
                <Label>Time</Label>
                <Input
                  type="time"
                  value={templateForm.dueTime}
                  onChange={(e) => setTemplateForm({ ...templateForm, dueTime: e.target.value })}
                  data-testid="input-template-time"
                />
              </div>
            )}
            
            {templateForm.frequency === "weekly" && (
              <div>
                <Label>Days of Week</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
                    <Button
                      key={day}
                      type="button"
                      variant={templateForm.dueDayOfWeek.includes(index) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleDayOfWeek(index)}
                      data-testid={`button-day-${day.toLowerCase()}`}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            {templateForm.frequency === "monthly" && (
              <div>
                <Label>Day of Month</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={templateForm.dueDayOfMonth}
                  onChange={(e) => setTemplateForm({ ...templateForm, dueDayOfMonth: parseInt(e.target.value) || 1 })}
                  placeholder="1-31"
                  data-testid="input-template-day-of-month"
                />
              </div>
            )}
            
            <div>
              <Label>Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(value) => setTemplateForm({ ...templateForm, category: value })}
              >
                <SelectTrigger data-testid="select-template-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimated Duration (minutes)</Label>
              <Input
                type="number"
                value={templateForm.estimatedDuration}
                onChange={(e) => setTemplateForm({ ...templateForm, estimatedDuration: parseInt(e.target.value) || 0 })}
                placeholder="60"
                data-testid="input-template-duration"
              />
            </div>
            
            {/* Checklist */}
            <div>
              <Label className="flex items-center justify-between">
                <span>Checklist</span>
                <Button type="button" variant="outline" size="sm" onClick={addChecklistItem} data-testid="button-add-checklist">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Item
                </Button>
              </Label>
              {templateForm.checklist.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {templateForm.checklist.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={item.text}
                        onChange={(e) => updateChecklistItem(index, e.target.value)}
                        placeholder="Checklist item"
                        data-testid={`input-checklist-${index}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeChecklistItem(index)}
                        data-testid={`button-remove-checklist-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">No checklist items</div>
              )}
            </div>

            {/* External Links */}
            <div>
              <Label className="flex items-center justify-between">
                <span>External Links</span>
                <Button type="button" variant="outline" size="sm" onClick={addExternalLink} data-testid="button-add-link">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Link
                </Button>
              </Label>
              {templateForm.externalLinks.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {templateForm.externalLinks.map((link, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={link}
                        onChange={(e) => updateExternalLink(index, e.target.value)}
                        placeholder="https://example.com"
                        type="url"
                        data-testid={`input-link-${index}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExternalLink(index)}
                        data-testid={`button-remove-link-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">No external links</div>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={templateForm.isActive}
                onCheckedChange={(checked) => setTemplateForm({ ...templateForm, isActive: checked })}
                data-testid="switch-template-active"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-cancel-template">
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} data-testid="button-save-template">
              {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
