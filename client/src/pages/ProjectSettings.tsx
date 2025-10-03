import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Settings, Palette, Info, Archive, Users, Plus, Code, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Project, PROJECT_TYPES, ProjectType, PROJECT_ICONS } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import * as LucideIcons from "lucide-react";

export default function ProjectSettings() {
  const { currentProject, setCurrentProject } = useProject();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingProjectType, setIsAddingProjectType] = useState(false);
  const [newProjectType, setNewProjectType] = useState("");
  const [customProjectTypes, setCustomProjectTypes] = useState<string[]>([]);
  
  // Form state for editing project details
  const [formData, setFormData] = useState({
    name: currentProject?.name || "",
    description: currentProject?.description || "",
    jobNumber: currentProject?.jobNumber || "",
    projectType: currentProject?.projectType || "",
    color: currentProject?.color || "#3b82f6",
    icon: currentProject?.icon || "Building2",
    isActive: currentProject?.isActive ?? true,
    isBusiness: currentProject?.isBusiness ?? false,
  });

  // Load custom project types from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('customProjectTypes');
    if (saved) {
      try {
        setCustomProjectTypes(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to parse custom project types:', error);
      }
    }
  }, []);

  // Update form when current project changes
  useEffect(() => {
    if (currentProject) {
      setFormData({
        name: currentProject.name,
        description: currentProject.description || "",
        jobNumber: currentProject.jobNumber || "",
        projectType: currentProject.projectType || "",
        color: currentProject.color || "#3b82f6",
        icon: currentProject.icon || "Building2",
        isActive: currentProject.isActive,
        isBusiness: currentProject.isBusiness,
      });
    }
  }, [currentProject]);

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      if (!currentProject) throw new Error("No project selected");
      const response = await apiRequest('PATCH', `/api/projects/${currentProject.id}`, data);
      const updatedProject = await response.json();
      return updatedProject as Project;
    },
    onSuccess: (updatedProject: Project) => {
      setCurrentProject(updatedProject);
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', currentProject?.id] });
      setIsEditing(false);
      toast({
        title: "Project Updated",
        description: "Project settings have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update project settings.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateProjectMutation.mutate(formData);
  };

  const handleCancel = () => {
    if (currentProject) {
      setFormData({
        name: currentProject.name,
        description: currentProject.description || "",
        jobNumber: currentProject.jobNumber || "",
        projectType: currentProject.projectType || "",
        color: currentProject.color || "#3b82f6",
        icon: currentProject.icon || "Building2",
        isActive: currentProject.isActive,
        isBusiness: currentProject.isBusiness,
      });
    }
    setIsEditing(false);
  };

  const handleAddProjectType = () => {
    if (newProjectType.trim() && !allProjectTypes.includes(newProjectType.trim())) {
      const updated = [...customProjectTypes, newProjectType.trim()];
      setCustomProjectTypes(updated);
      localStorage.setItem('customProjectTypes', JSON.stringify(updated));
      setFormData({ ...formData, projectType: newProjectType.trim() });
      setNewProjectType("");
      setIsAddingProjectType(false);
      toast({
        title: "Project Type Added",
        description: `"${newProjectType.trim()}" has been added to your project types.`,
      });
    }
  };

  // Combine built-in and custom project types
  const allProjectTypes = [...PROJECT_TYPES, ...customProjectTypes];

  if (!currentProject) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Project Selected</h3>
              <p>Please select a project to view and edit its settings.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const colorOptions = [
    "#3b82f6", // Blue
    "#10b981", // Green
    "#f59e0b", // Yellow
    "#ef4444", // Red
    "#8b5cf6", // Purple
    "#06b6d4", // Cyan
    "#f97316", // Orange
    "#84cc16", // Lime
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Project Settings
          </h1>
          <p className="text-muted-foreground">
            Manage settings and configuration for "{currentProject.name}"
          </p>
        </div>
        
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} data-testid="button-edit-project">
            <Settings className="h-4 w-4 mr-2" />
            Edit Project
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleCancel}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateProjectMutation.isPending}
              data-testid="button-save-project"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      {/* Project Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Project Information
          </CardTitle>
          <CardDescription>
            Basic details and description for this project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              {isEditing ? (
                <Input
                  id="project-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="input-project-name"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-project-name">
                  {currentProject.name}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="job-number">Job Number</Label>
              {isEditing ? (
                <Input
                  id="job-number"
                  value={formData.jobNumber}
                  onChange={(e) => setFormData({ ...formData, jobNumber: e.target.value })}
                  placeholder="e.g., 2024-001, SMITH-EXT"
                  data-testid="input-job-number"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-job-number">
                  {currentProject.jobNumber || "No job number set"}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-type">Project Type</Label>
              {isEditing ? (
                <Select
                  value={formData.projectType}
                  onValueChange={(value) => {
                    if (value === "__add_new__") {
                      setIsAddingProjectType(true);
                    } else {
                      setFormData({ ...formData, projectType: value });
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-project-type">
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProjectTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                    <SelectItem value="__add_new__" className="text-primary font-medium">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Add New Type...
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-project-type">
                  {currentProject.projectType || "No project type set"}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {/* Empty column for now - could add more fields later */}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            {isEditing ? (
              <Textarea
                id="project-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter project description..."
                rows={3}
                data-testid="input-project-description"
              />
            ) : (
              <div className="p-2 bg-muted rounded-md min-h-[80px]" data-testid="text-project-description">
                {currentProject.description || "No description provided"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>
            Customize the visual appearance of this project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Project Color</Label>
            {isEditing ? (
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-md border-2 ${
                      formData.color === color ? 'border-foreground' : 'border-border'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                    data-testid={`button-color-${color}`}
                  />
                ))}
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-8 p-1"
                  data-testid="input-custom-color"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md border border-border"
                  style={{ backgroundColor: currentProject.color || "#3b82f6" }}
                  data-testid="color-preview"
                />
                <span className="text-sm font-mono" data-testid="text-project-color">
                  {currentProject.color || "#3b82f6"}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Project Icon</Label>
            {isEditing ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                  <ProjectIcon icon={formData.icon} color={formData.color} className="w-8 h-8" />
                  <div className="text-sm">
                    <div className="font-medium">Preview</div>
                    <div className="text-muted-foreground">
                      {PROJECT_ICONS.find(i => i.name === formData.icon)?.label || "Icon"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {PROJECT_ICONS.map((iconOption) => {
                    const IconComponent = (LucideIcons as any)[iconOption.name];
                    return (
                      <button
                        key={iconOption.name}
                        className={`p-3 rounded-md border-2 hover-elevate active-elevate-2 ${
                          formData.icon === iconOption.name ? 'border-foreground' : 'border-border'
                        }`}
                        onClick={() => setFormData({ ...formData, icon: iconOption.name })}
                        title={iconOption.label}
                        data-testid={`button-icon-${iconOption.name}`}
                      >
                        {IconComponent && (
                          <IconComponent 
                            className="w-6 h-6 mx-auto" 
                            style={{ color: formData.color }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                <ProjectIcon 
                  icon={currentProject.icon} 
                  color={currentProject.color} 
                  className="w-6 h-6" 
                />
                <span className="text-sm" data-testid="text-project-icon">
                  {PROJECT_ICONS.find(i => i.name === currentProject.icon)?.label || "Building"}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Project Status
          </CardTitle>
          <CardDescription>
            Manage project status and type settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Active Status</Label>
              <p className="text-sm text-muted-foreground">
                Whether this project is currently active and visible
              </p>
            </div>
            {isEditing ? (
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                data-testid="switch-is-active"
              />
            ) : (
              <Badge variant={currentProject.isActive ? "default" : "secondary"} data-testid="badge-is-active">
                {currentProject.isActive ? "Active" : "Inactive"}
              </Badge>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Business Project</Label>
              <p className="text-sm text-muted-foreground">
                Whether this is a business-wide project or client project
              </p>
            </div>
            {isEditing ? (
              <Switch
                checked={formData.isBusiness}
                onCheckedChange={(checked) => setFormData({ ...formData, isBusiness: checked })}
                data-testid="switch-is-business"
              />
            ) : (
              <Badge variant={currentProject.isBusiness ? "default" : "outline"} data-testid="badge-is-business">
                {currentProject.isBusiness ? "Business Project" : "Client Project"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cost Codes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Cost Codes
          </CardTitle>
          <CardDescription>
            Manage cost codes used for organizing estimate items
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CostCodesManager projectId={currentProject.id} />
        </CardContent>
      </Card>

      {/* Project Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Project Details
          </CardTitle>
          <CardDescription>
            Additional project information and metadata
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Created Date</Label>
              <div className="p-2 bg-muted rounded-md text-sm" data-testid="text-created-date">
                {new Date(currentProject.createdAt).toLocaleDateString()}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Last Updated</Label>
              <div className="p-2 bg-muted rounded-md text-sm" data-testid="text-updated-date">
                {new Date(currentProject.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {currentProject.ownerId && (
            <div className="space-y-2">
              <Label>Owner ID</Label>
              <div className="p-2 bg-muted rounded-md font-mono text-sm" data-testid="text-owner-id">
                {currentProject.ownerId}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add New Project Type Dialog */}
      <Dialog open={isAddingProjectType} onOpenChange={setIsAddingProjectType}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Project Type</DialogTitle>
            <DialogDescription>
              Create a custom project type that you can use for this and future projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-type">Project Type Name</Label>
              <Input
                id="new-project-type"
                value={newProjectType}
                onChange={(e) => setNewProjectType(e.target.value)}
                placeholder="e.g., Pool Installation, Deck Construction"
                data-testid="input-new-project-type"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddingProjectType(false);
                setNewProjectType("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddProjectType}
              disabled={!newProjectType.trim() || allProjectTypes.includes(newProjectType.trim())}
              data-testid="button-add-project-type"
            >
              Add Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Cost Codes Manager Component
function CostCodesManager({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [editingCode, setEditingCode] = useState<any>(null);
  const [newCode, setNewCode] = useState({ code: "", title: "", description: "" });

  // Fetch cost codes
  const { data: costCodes = [], isLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/cost-codes`],
  });

  // Create cost code
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/cost-codes`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/cost-codes`] });
      toast({ title: "Cost code created successfully" });
      setIsAdding(false);
      setNewCode({ code: "", title: "", description: "" });
    },
    onError: () => {
      toast({ title: "Failed to create cost code", variant: "destructive" });
    },
  });

  // Update cost code
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/cost-codes/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/cost-codes`] });
      toast({ title: "Cost code updated successfully" });
      setEditingCode(null);
    },
    onError: () => {
      toast({ title: "Failed to update cost code", variant: "destructive" });
    },
  });

  // Delete cost code
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/cost-codes/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/cost-codes`] });
      toast({ title: "Cost code deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete cost code", variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading cost codes...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {costCodes.length} cost code{costCodes.length !== 1 ? 's' : ''}
        </p>
        <Button
          onClick={() => setIsAdding(true)}
          size="sm"
          data-testid="button-add-cost-code"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Cost Code
        </Button>
      </div>

      {costCodes.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-muted-foreground">
          <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No cost codes yet. Add your first cost code to get started.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Code</th>
                <th className="text-left p-3 text-sm font-medium">Title</th>
                <th className="text-left p-3 text-sm font-medium">Description</th>
                <th className="text-right p-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isAdding && (
                <tr className="border-t bg-muted/20">
                  <td className="p-2">
                    <Input
                      value={newCode.code}
                      onChange={(e) => setNewCode({ ...newCode, code: e.target.value })}
                      placeholder="e.g., FLRT"
                      className="h-8"
                      data-testid="input-new-code"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={newCode.title}
                      onChange={(e) => setNewCode({ ...newCode, title: e.target.value })}
                      placeholder="e.g., Flat rate"
                      className="h-8"
                      data-testid="input-new-title"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={newCode.description}
                      onChange={(e) => setNewCode({ ...newCode, description: e.target.value })}
                      placeholder="Optional description"
                      className="h-8"
                      data-testid="input-new-description"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsAdding(false);
                          setNewCode({ code: "", title: "", description: "" });
                        }}
                        className="h-8"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => createMutation.mutate(newCode)}
                        disabled={!newCode.code.trim() || !newCode.title.trim() || createMutation.isPending}
                        className="h-8"
                        data-testid="button-save-cost-code"
                      >
                        Save
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {costCodes.map((code: any) => (
                <tr key={code.id} className="border-t" data-testid={`row-cost-code-${code.id}`}>
                  {editingCode?.id === code.id ? (
                    <>
                      <td className="p-2">
                        <Input
                          value={editingCode.code}
                          onChange={(e) => setEditingCode({ ...editingCode, code: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={editingCode.title}
                          onChange={(e) => setEditingCode({ ...editingCode, title: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={editingCode.description || ""}
                          onChange={(e) => setEditingCode({ ...editingCode, description: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingCode(null)}
                            className="h-8"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: code.id, data: editingCode })}
                            disabled={updateMutation.isPending}
                            className="h-8"
                          >
                            Save
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-mono text-sm">{code.code}</td>
                      <td className="p-3 text-sm">{code.title}</td>
                      <td className="p-3 text-sm text-muted-foreground">{code.description || '—'}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingCode(code)}
                            data-testid={`button-edit-${code.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this cost code?')) {
                                deleteMutation.mutate(code.id);
                              }
                            }}
                            data-testid={`button-delete-${code.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}