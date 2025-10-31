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
  PowerOff
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { TaskTemplate, UserRole } from "@shared/schema";

export function TaskLibrary() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const { toast } = useToast();

  // Form state
  const [templateForm, setTemplateForm] = useState({
    title: "",
    description: "",
    defaultRoleId: "",
    frequency: "once",
    category: "",
    estimatedDuration: 0,
    isActive: true,
    dueTime: "",
    dueDayOfWeek: [] as number[],
    dueDayOfMonth: 1,
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
    onError: () => {
      toast({ title: "Failed to update task template", variant: "destructive" });
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
      description: "",
      defaultRoleId: "",
      frequency: "once",
      category: "",
      estimatedDuration: 0,
      isActive: true,
      dueTime: "",
      dueDayOfWeek: [],
      dueDayOfMonth: 1,
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
      description: template.description || "",
      defaultRoleId: template.defaultRoleId || "",
      frequency: template.frequency || "once",
      category: template.category || "",
      estimatedDuration: template.estimatedDuration || 0,
      isActive: template.isActive,
      dueTime: template.dueTime || "",
      dueDayOfWeek: template.dueDayOfWeek ? (typeof template.dueDayOfWeek === 'string' ? JSON.parse(template.dueDayOfWeek) : template.dueDayOfWeek) : [],
      dueDayOfMonth: template.dueDayOfMonth || 1,
    });
    setShowDialog(true);
  };

  const handleSaveTemplate = () => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateForm });
    } else {
      createTemplateMutation.mutate(templateForm);
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

      <div className="flex-1 overflow-auto space-y-3">
        {templates.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              No task templates yet. Create your first template to get started.
            </div>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="p-3" data-testid={`template-card-${template.id}`}>
              <div className="flex items-center gap-4">
                <div className="flex-1 grid grid-cols-7 gap-3 items-center">
                  <div className="col-span-2 font-medium truncate">{template.title}</div>
                  <div className="col-span-2 text-sm text-muted-foreground truncate">
                    {template.description || "-"}
                  </div>
                  <div className="text-sm">{getRoleName(template.defaultRoleId)}</div>
                  <div className="text-sm">{getFrequencyLabel(template)}</div>
                  <div className="text-sm">
                    {template.category ? (
                      <Badge variant="secondary">{template.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                  <div className="text-sm">
                    {template.estimatedDuration ? `${template.estimatedDuration} min` : "-"}
                  </div>
                  <div>
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
                  </div>
                </div>

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
              </div>
            </Card>
          ))
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
        <DialogContent data-testid="dialog-template">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Task Template"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label>Title</Label>
              <Input
                value={templateForm.title}
                onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                placeholder="Task template title"
                data-testid="input-template-title"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-template-description"
              />
            </div>
            <div>
              <Label>Default Role</Label>
              <Select
                value={templateForm.defaultRoleId}
                onValueChange={(value) => setTemplateForm({ ...templateForm, defaultRoleId: value })}
              >
                <SelectTrigger data-testid="select-template-role">
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
              <Input
                value={templateForm.category}
                onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                placeholder="e.g., Admin, Finance, Operations"
                data-testid="input-template-category"
              />
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
