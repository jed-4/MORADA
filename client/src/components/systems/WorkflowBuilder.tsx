import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Plus, 
  MoreVertical, 
  Trash2, 
  Edit, 
  Play,
  Power,
  PowerOff,
  ArrowRight
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
import type { WorkflowTemplate, TaskTemplate } from "@shared/schema";

export function WorkflowBuilder() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const { toast } = useToast();

  // Form state
  const [workflowForm, setWorkflowForm] = useState({
    name: "",
    description: "",
    triggerType: "stage_change",
    triggerStage: "",
    triggerStatus: "",
    taskTemplateIds: [] as string[],
    isActive: true,
  });

  // Fetch workflow templates
  const { data: workflows = [], isLoading: workflowsLoading } = useQuery<WorkflowTemplate[]>({
    queryKey: ["/api/systems/workflow-templates"],
  });

  // Fetch task templates for selection
  const { data: taskTemplates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/systems/task-templates"],
  });

  // Create workflow mutation
  const createWorkflowMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/systems/workflow-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/workflow-templates"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Workflow created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create workflow", variant: "destructive" });
    },
  });

  // Update workflow mutation
  const updateWorkflowMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/systems/workflow-templates/${id}`, "PATCH", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/workflow-templates"] });
      setShowDialog(false);
      setEditingWorkflow(null);
      resetForm();
      toast({ title: "Workflow updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update workflow", variant: "destructive" });
    },
  });

  // Delete workflow mutation
  const deleteWorkflowMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/workflow-templates/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/workflow-templates"] });
      toast({ title: "Workflow deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete workflow", variant: "destructive" });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => 
      apiRequest(`/api/systems/workflow-templates/${id}`, "PATCH", { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/workflow-templates"] });
      toast({ title: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setWorkflowForm({
      name: "",
      description: "",
      triggerType: "stage_change",
      triggerStage: "",
      triggerStatus: "",
      taskTemplateIds: [],
      isActive: true,
    });
  };

  const openNewWorkflowDialog = () => {
    setEditingWorkflow(null);
    resetForm();
    setShowDialog(true);
  };

  const openEditWorkflowDialog = (workflow: WorkflowTemplate) => {
    setEditingWorkflow(workflow);
    setWorkflowForm({
      name: workflow.name,
      description: workflow.description || "",
      triggerType: workflow.triggerType || "stage_change",
      triggerStage: workflow.triggerStage || "",
      triggerStatus: workflow.triggerStatus || "",
      taskTemplateIds: (workflow.taskTemplateIds as string[]) || [],
      isActive: workflow.isActive,
    });
    setShowDialog(true);
  };

  const handleSaveWorkflow = () => {
    if (editingWorkflow) {
      updateWorkflowMutation.mutate({ id: editingWorkflow.id, data: workflowForm });
    } else {
      createWorkflowMutation.mutate(workflowForm);
    }
  };

  const toggleTaskTemplate = (templateId: string) => {
    setWorkflowForm((prev) => ({
      ...prev,
      taskTemplateIds: prev.taskTemplateIds.includes(templateId)
        ? prev.taskTemplateIds.filter((id) => id !== templateId)
        : [...prev.taskTemplateIds, templateId],
    }));
  };

  const getTaskTemplateName = (templateId: string) => {
    const template = taskTemplates.find((t) => t.id === templateId);
    return template?.title || "Unknown";
  };

  const getTriggerLabel = (workflow: WorkflowTemplate) => {
    if (workflow.triggerType === "stage_change" && workflow.triggerStage) {
      return `When stage changes to "${workflow.triggerStage}"`;
    }
    if (workflow.triggerType === "status_change" && workflow.triggerStatus) {
      return `When status changes to "${workflow.triggerStatus}"`;
    }
    return "Manual trigger";
  };

  if (workflowsLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading...</div>
      </Card>
    );
  }

  const activeWorkflows = workflows.filter((w) => w.isActive);
  const inactiveWorkflows = workflows.filter((w) => !w.isActive);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto space-y-4 p-3">
        {activeWorkflows.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Active Workflows</h3>
            <div className="grid gap-3">
              {activeWorkflows.map((workflow) => (
                <Card key={workflow.id} className="p-4" data-testid={`workflow-card-${workflow.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{workflow.name}</h4>
                        <Badge variant="outline" className="gap-1">
                          <Power className="h-3 w-3 text-green-600" />
                          Active
                        </Badge>
                      </div>
                      {workflow.description && (
                        <p className="text-sm text-muted-foreground mb-2">{workflow.description}</p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Play className="h-3 w-3" />
                        <span>{getTriggerLabel(workflow)}</span>
                      </div>
                      {workflow.taskTemplateIds && (workflow.taskTemplateIds as string[]).length > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Creates:</span>
                          <div className="flex flex-wrap gap-1">
                            {(workflow.taskTemplateIds as string[]).map((templateId, index) => (
                              <div key={templateId} className="flex items-center gap-1">
                                <Badge variant="secondary">{getTaskTemplateName(templateId)}</Badge>
                                {index < (workflow.taskTemplateIds as string[]).length - 1 && (
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`workflow-menu-${workflow.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditWorkflowDialog(workflow)} data-testid="menu-edit-workflow">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => toggleActiveMutation.mutate({ id: workflow.id, isActive: false })}
                          data-testid="menu-deactivate-workflow"
                        >
                          <PowerOff className="h-4 w-4 mr-2" />
                          Deactivate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteWorkflowMutation.mutate(workflow.id)}
                          className="text-destructive"
                          data-testid="menu-delete-workflow"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {inactiveWorkflows.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Inactive Workflows</h3>
            <div className="grid gap-3">
              {inactiveWorkflows.map((workflow) => (
                <Card key={workflow.id} className="p-4 opacity-60" data-testid={`workflow-card-${workflow.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{workflow.name}</h4>
                        <Badge variant="outline" className="gap-1">
                          <PowerOff className="h-3 w-3" />
                          Inactive
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Play className="h-3 w-3" />
                        <span>{getTriggerLabel(workflow)}</span>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`workflow-menu-${workflow.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => toggleActiveMutation.mutate({ id: workflow.id, isActive: true })}
                          data-testid="menu-activate-workflow"
                        >
                          <Power className="h-4 w-4 mr-2" />
                          Activate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditWorkflowDialog(workflow)} data-testid="menu-edit-workflow">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteWorkflowMutation.mutate(workflow.id)}
                          className="text-destructive"
                          data-testid="menu-delete-workflow"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {workflows.length === 0 && (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              No workflows yet. Create your first workflow to automate task creation.
            </div>
          </Card>
        )}
      </div>

      {/* Workflow Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) {
          setEditingWorkflow(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-workflow">
          <DialogHeader>
            <DialogTitle>{editingWorkflow ? "Edit Workflow" : "New Workflow"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Name</Label>
              <Input
                value={workflowForm.name}
                onChange={(e) => setWorkflowForm({ ...workflowForm, name: e.target.value })}
                placeholder="Workflow name"
                data-testid="input-workflow-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={workflowForm.description}
                onChange={(e) => setWorkflowForm({ ...workflowForm, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-workflow-description"
              />
            </div>
            <div>
              <Label>Trigger Type</Label>
              <Select
                value={workflowForm.triggerType}
                onValueChange={(value) => setWorkflowForm({ ...workflowForm, triggerType: value })}
              >
                <SelectTrigger data-testid="select-workflow-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stage_change">Stage Change</SelectItem>
                  <SelectItem value="status_change">Status Change</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {workflowForm.triggerType === "stage_change" && (
              <div>
                <Label>Trigger Stage</Label>
                <Input
                  value={workflowForm.triggerStage}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, triggerStage: e.target.value })}
                  placeholder="e.g., Contract Signed, Pre-Construction, etc."
                  data-testid="input-workflow-trigger-stage"
                />
              </div>
            )}
            {workflowForm.triggerType === "status_change" && (
              <div>
                <Label>Trigger Status</Label>
                <Input
                  value={workflowForm.triggerStatus}
                  onChange={(e) => setWorkflowForm({ ...workflowForm, triggerStatus: e.target.value })}
                  placeholder="e.g., Active, On Hold, Completed"
                  data-testid="input-workflow-trigger-status"
                />
              </div>
            )}
            <div>
              <Label>Task Templates to Create</Label>
              <Card className="p-3 mt-1 max-h-[200px] overflow-y-auto">
                {taskTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No task templates available. Create task templates first.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {taskTemplates.map((template) => (
                      <label
                        key={template.id}
                        className="flex items-center gap-2 p-2 hover-elevate rounded-md cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={workflowForm.taskTemplateIds.includes(template.id)}
                          onChange={() => toggleTaskTemplate(template.id)}
                          className="h-4 w-4"
                          data-testid={`checkbox-template-${template.id}`}
                        />
                        <span className="text-sm flex-1">{template.title}</span>
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
                      </label>
                    ))}
                  </div>
                )}
              </Card>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={workflowForm.isActive}
                onCheckedChange={(checked) => setWorkflowForm({ ...workflowForm, isActive: checked })}
                data-testid="switch-workflow-active"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-cancel-workflow">
              Cancel
            </Button>
            <Button onClick={handleSaveWorkflow} data-testid="button-save-workflow">
              {editingWorkflow ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
