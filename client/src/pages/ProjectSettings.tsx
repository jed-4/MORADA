import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Settings, Palette, Info, Archive, Users, Plus, Trash2, AlertTriangle, DollarSign, MapPin, Calendar, FileText, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Project, PROJECT_TYPES, ProjectType, PROJECT_ICONS, Client, FieldOption, Estimate } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import CreateClientDialog from "@/components/CreateClientDialog";
import * as LucideIcons from "lucide-react";

export default function ProjectSettings() {
  const { currentProject, setCurrentProject } = useProject();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingProjectType, setIsAddingProjectType] = useState(false);
  const [newProjectType, setNewProjectType] = useState("");
  const [customProjectTypes, setCustomProjectTypes] = useState<string[]>([]);
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  
  // Form state for editing project details
  const [formData, setFormData] = useState({
    name: currentProject?.name || "",
    description: currentProject?.description || "",
    jobNumber: currentProject?.jobNumber || "",
    projectType: currentProject?.projectType || "",
    clientId: currentProject?.clientId || null,
    location: currentProject?.location || "",
    projectStatus: currentProject?.projectStatus || null,
    projectSubStatus: currentProject?.projectSubStatus || null,
    clientBudget: currentProject?.clientBudget || null,
    proposedStartDate: currentProject?.proposedStartDate || null,
    proposedEndDate: currentProject?.proposedEndDate || null,
    contractCost: currentProject?.contractCost || null,
    selectedEstimateId: currentProject?.selectedEstimateId || null,
    color: currentProject?.color || "#3b82f6",
    icon: currentProject?.icon || "Building2",
    isActive: currentProject?.isActive ?? true,
    invoicingMethod: currentProject?.invoicingMethod || "progress_payments",
  });

  // Fetch clients for dropdown
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
  });

  // Fetch field options for project status (hierarchical)
  const { data: allFieldOptions = [] } = useQuery<FieldOption[]>({
    queryKey: ['/api/field-options', 'project.status'],
    queryFn: async () => {
      const categories = await apiRequest('/api/field-categories', 'GET') as any[];
      const statusCategory = categories.find((c: any) => c.key === 'project.status');
      if (!statusCategory) return [];
      return await apiRequest(`/api/field-options?categoryId=${statusCategory.id}`, 'GET') as FieldOption[];
    },
  });

  // Fetch estimates for the current project
  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ['/api/estimates', currentProject?.id],
    enabled: !!currentProject?.id,
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const result = await apiRequest(`/api/estimates?projectId=${currentProject.id}`, 'GET') as Estimate[];
      return result || [];
    },
  });

  // Filter high-level and low-level status options
  const parentStatusOptions = useMemo(() => 
    allFieldOptions.filter(opt => !opt.parentId),
    [allFieldOptions]
  );

  const subStatusOptions = useMemo(() => {
    if (!formData.projectStatus) return [];
    return allFieldOptions.filter(opt => opt.parentId === formData.projectStatus);
  }, [allFieldOptions, formData.projectStatus]);

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
        clientId: currentProject.clientId || null,
        location: currentProject.location || "",
        projectStatus: currentProject.projectStatus || null,
        projectSubStatus: currentProject.projectSubStatus || null,
        clientBudget: currentProject.clientBudget || null,
        proposedStartDate: currentProject.proposedStartDate || null,
        proposedEndDate: currentProject.proposedEndDate || null,
        contractCost: currentProject.contractCost || null,
        selectedEstimateId: currentProject.selectedEstimateId || null,
        color: currentProject.color || "#3b82f6",
        icon: currentProject.icon || "Building2",
        isActive: currentProject.isActive,
        invoicingMethod: currentProject.invoicingMethod || "progress_payments",
      });
    }
  }, [currentProject]);

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      if (!currentProject) throw new Error("No project selected");
      return await apiRequest(`/api/projects/${currentProject.id}`, 'PATCH', data) as Project;
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
        clientId: currentProject.clientId || null,
        location: currentProject.location || "",
        projectStatus: currentProject.projectStatus || null,
        projectSubStatus: currentProject.projectSubStatus || null,
        clientBudget: currentProject.clientBudget || null,
        proposedStartDate: currentProject.proposedStartDate || null,
        proposedEndDate: currentProject.proposedEndDate || null,
        contractCost: currentProject.contractCost || null,
        selectedEstimateId: currentProject.selectedEstimateId || null,
        color: currentProject.color || "#3b82f6",
        icon: currentProject.icon || "Building2",
        isActive: currentProject.isActive,
        invoicingMethod: currentProject.invoicingMethod || "progress_payments",
      });
    }
    setIsEditing(false);
  };

  const handleClientCreated = (client: Client) => {
    queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
    setFormData({ ...formData, clientId: client.id });
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

      {/* Project Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Project Details
          </CardTitle>
          <CardDescription>
            Basic project information and client details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
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
              <Label htmlFor="job-number">Project Number</Label>
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
                  {currentProject.jobNumber || "Not set"}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-type">Project Type</Label>
              {isEditing ? (
                <Select
                  value={formData.projectType || ""}
                  onValueChange={(value) => {
                    if (value === "__add_new__") {
                      setIsAddingProjectType(true);
                    } else {
                      setFormData({ ...formData, projectType: value });
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-project-type">
                    <SelectValue placeholder="Select type" />
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
                  {currentProject.projectType || "Not set"}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              {isEditing ? (
                <Select
                  value={formData.clientId || ""}
                  onValueChange={(value) => {
                    if (value === "__create_new__") {
                      setIsCreateClientOpen(true);
                    } else {
                      setFormData({ ...formData, clientId: value });
                    }
                  }}
                >
                  <SelectTrigger data-testid="select-client">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}{client.company ? ` (${client.company})` : ''}
                      </SelectItem>
                    ))}
                    <SelectItem value="__create_new__" className="text-primary font-medium">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        Create New Client...
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-client">
                  {currentProject.clientId 
                    ? clients.find(c => c.id === currentProject.clientId)?.name || "Unknown client"
                    : "Not set"}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address"><MapPin className="h-3 w-3 inline mr-1" />Address</Label>
            {isEditing ? (
              <Input
                id="address"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="123 Main St, Sydney NSW 2000"
                data-testid="input-address"
              />
            ) : (
              <div className="p-2 bg-muted rounded-md" data-testid="text-address">
                {currentProject.location || "Not set"}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            {isEditing ? (
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Project description..."
                rows={3}
                data-testid="input-description"
              />
            ) : (
              <div className="p-2 bg-muted rounded-md min-h-[80px]" data-testid="text-description">
                {currentProject.description || "No description"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Project Status
          </CardTitle>
          <CardDescription>
            Track project lifecycle and progress stage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-status">Status</Label>
              {isEditing ? (
                <Select
                  value={formData.projectStatus || ""}
                  onValueChange={(value) => {
                    setFormData({ ...formData, projectStatus: value, projectSubStatus: null });
                  }}
                >
                  <SelectTrigger data-testid="select-project-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentStatusOptions.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color || '#gray' }} />
                          {status.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-project-status">
                  {parentStatusOptions.find(s => s.id === currentProject.projectStatus)?.name || "Not set"}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-sub-status">Sub-Status</Label>
              {isEditing ? (
                <Select
                  value={formData.projectSubStatus || ""}
                  onValueChange={(value) => setFormData({ ...formData, projectSubStatus: value })}
                  disabled={!formData.projectStatus}
                >
                  <SelectTrigger data-testid="select-project-sub-status">
                    <SelectValue placeholder={formData.projectStatus ? "Select sub-status" : "Select status first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subStatusOptions.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color || '#gray' }} />
                          {status.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-project-sub-status">
                  {subStatusOptions.find(s => s.id === currentProject.projectSubStatus)?.name || "Not set"}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline & Budget */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Timeline & Budget
          </CardTitle>
          <CardDescription>
            Project schedule and client budget information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="proposed-start">Proposed Start Date</Label>
              {isEditing ? (
                <Input
                  id="proposed-start"
                  type="date"
                  value={formData.proposedStartDate || ""}
                  onChange={(e) => setFormData({ ...formData, proposedStartDate: e.target.value })}
                  data-testid="input-proposed-start"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-proposed-start">
                  {currentProject.proposedStartDate 
                    ? new Date(currentProject.proposedStartDate).toLocaleDateString()
                    : "Not set"}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposed-end">Proposed End Date</Label>
              {isEditing ? (
                <Input
                  id="proposed-end"
                  type="date"
                  value={formData.proposedEndDate || ""}
                  onChange={(e) => setFormData({ ...formData, proposedEndDate: e.target.value })}
                  data-testid="input-proposed-end"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-proposed-end">
                  {currentProject.proposedEndDate 
                    ? new Date(currentProject.proposedEndDate).toLocaleDateString()
                    : "Not set"}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-budget">Client Budget</Label>
            {isEditing ? (
              <Input
                id="client-budget"
                type="number"
                value={formData.clientBudget ? formData.clientBudget / 100 : ""}
                onChange={(e) => setFormData({ ...formData, clientBudget: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                placeholder="0.00"
                step="0.01"
                data-testid="input-client-budget"
              />
            ) : (
              <div className="p-2 bg-muted rounded-md" data-testid="text-client-budget">
                {currentProject.clientBudget 
                  ? `$${(currentProject.clientBudget / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "Not set"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contract */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Contract
          </CardTitle>
          <CardDescription>
            Contract details and estimate selection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contract-cost">Contract Cost</Label>
              {isEditing ? (
                <Input
                  id="contract-cost"
                  type="number"
                  value={formData.contractCost ? formData.contractCost / 100 : ""}
                  onChange={(e) => setFormData({ ...formData, contractCost: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                  placeholder="0.00"
                  step="0.01"
                  data-testid="input-contract-cost"
                />
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-contract-cost">
                  {currentProject.contractCost 
                    ? `$${(currentProject.contractCost / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "Not set"}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="selected-estimate">Selected Estimate</Label>
              {isEditing ? (
                <Select
                  value={formData.selectedEstimateId || ""}
                  onValueChange={(value) => setFormData({ ...formData, selectedEstimateId: value })}
                >
                  <SelectTrigger data-testid="select-estimate">
                    <SelectValue placeholder="Select estimate" />
                  </SelectTrigger>
                  <SelectContent>
                    {estimates.length === 0 ? (
                      <SelectItem value="_none" disabled>No estimates available</SelectItem>
                    ) : (
                      estimates.map((estimate) => (
                        <SelectItem key={estimate.id} value={estimate.id}>
                          {estimate.name || `Estimate ${estimate.number}`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-2 bg-muted rounded-md" data-testid="text-selected-estimate">
                  {currentProject.selectedEstimateId && estimates.find(e => e.id === currentProject.selectedEstimateId)
                    ? estimates.find(e => e.id === currentProject.selectedEstimateId)?.name || "Unknown estimate"
                    : "Not set"}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoicing Method */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Invoicing Method
          </CardTitle>
          <CardDescription>
            Choose how you want to invoice for this project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {isEditing ? (
              <RadioGroup
                value={formData.invoicingMethod}
                onValueChange={(value) => setFormData({ ...formData, invoicingMethod: value })}
                className="space-y-4"
              >
                <div className="flex items-start space-x-3">
                  <RadioGroupItem 
                    value="progress_payments" 
                    id="progress_payments"
                    data-testid="radio-progress-payments"
                  />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="progress_payments" className="font-medium cursor-pointer">
                      Progress Payments
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Invoice based on contract price, variations, and allowances
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem 
                    value="cost_plus" 
                    id="cost_plus"
                    data-testid="radio-cost-plus"
                  />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="cost_plus" className="font-medium cursor-pointer">
                      Cost Plus
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Invoice based on actual costs (bills, timesheets) plus builder's margin
                    </p>
                  </div>
                </div>
              </RadioGroup>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" data-testid="badge-invoicing-method">
                    {currentProject.invoicingMethod === "progress_payments" ? "Progress Payments" : "Cost Plus"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-invoicing-description">
                  {currentProject.invoicingMethod === "progress_payments"
                    ? "Invoice based on contract price, variations, and allowances"
                    : "Invoice based on actual costs (bills, timesheets) plus builder's margin"}
                </p>
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

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that affect this project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-md">
            <div className="space-y-1">
              <Label className="text-base font-semibold">Archive Project</Label>
              <p className="text-sm text-muted-foreground">
                Archive this project to hide it from lists. You can restore it later.
              </p>
            </div>
            <ArchiveProjectButton project={currentProject} />
          </div>

          <div className="flex items-center justify-between p-4 border border-destructive rounded-md">
            <div className="space-y-1">
              <Label className="text-base font-semibold text-destructive">Delete Project</Label>
              <p className="text-sm text-muted-foreground">
                Permanently delete this project and all its data. This cannot be undone.
              </p>
            </div>
            <DeleteProjectButton project={currentProject} />
          </div>
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

      {/* Create Client Dialog */}
      <CreateClientDialog 
        open={isCreateClientOpen}
        onOpenChange={setIsCreateClientOpen}
        onClientCreated={handleClientCreated}
      />
    </div>
  );
}

// Archive Project Button Component
function ArchiveProjectButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { setCurrentProject } = useProject();
  const [, navigate] = useLocation();

  const archiveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${project.id}`, 'PATCH', {
        isArchived: true
      });
    },
    onSuccess: () => {
      // Clear the current project immediately
      setCurrentProject(null);
      setOpen(false);
      
      // Navigate to dashboard immediately
      navigate('/');
      
      // Then invalidate and show toast
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Project Archived",
        description: `${project.name} has been archived.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to archive project.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-archive-project">
          <Archive className="h-4 w-4 mr-2" />
          Archive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive Project?</DialogTitle>
          <DialogDescription>
            This will hide "{project.name}" from your project lists and sidebar. You can restore it later from the Archived Projects page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            data-testid="button-confirm-archive"
          >
            {archiveMutation.isPending ? "Archiving..." : "Archive Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Delete Project Button Component
function DeleteProjectButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const { toast } = useToast();
  const { setCurrentProject } = useProject();
  const [, navigate] = useLocation();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${project.id}`, 'DELETE');
    },
    onSuccess: () => {
      // Clear the current project immediately
      setCurrentProject(null);
      setOpen(false);
      
      // Navigate to dashboard immediately
      navigate('/');
      
      // Then invalidate and show toast
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: "Project Deleted",
        description: `${project.name} has been permanently deleted.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive",
      });
    },
  });

  const isConfirmValid = confirmText === project.name;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" data-testid="button-delete-project">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Project?</DialogTitle>
          <DialogDescription>
            This will permanently delete "{project.name}" and all its data including tasks, notes, estimates, bills, and more. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">
              Type <span className="font-semibold">{project.name}</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={project.name}
              data-testid="input-confirm-delete"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            setOpen(false);
            setConfirmText("");
          }}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={!isConfirmValid || deleteMutation.isPending}
            data-testid="button-confirm-delete"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}