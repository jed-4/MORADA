import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Lock, 
  Unlock, 
  FileText, 
  Calculator,
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  FolderPlus,
  Loader2
} from "lucide-react";
import { type Estimate, type EstimateItem, type EstimateSummary, type Project, type InsertEstimateItem, insertEstimateItemSchema, type EstimateGroup, type InsertEstimateGroup, insertEstimateGroupSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface EstimateDetailParams {
  id: string;
}

export default function EstimateDetail() {
  const { id } = useParams<EstimateDetailParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Check if we're creating a new estimate
  const isNewEstimate = id === 'new';
  
  // Get project ID from query params for new estimates
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdFromQuery = urlParams.get('projectId');
  
  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isEditingMarkup, setIsEditingMarkup] = useState(false);
  const [editingMarkup, setEditingMarkup] = useState("");
  
  // Add item modal state
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  
  // Add group modal state
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  
  // New estimate creation state
  const [newEstimateName, setNewEstimateName] = useState("");

  if (!id) {
    return <div>Invalid estimate ID</div>;
  }
  
  // Fetch all projects for project selection (needed before early return)
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isNewEstimate && !projectIdFromQuery,
  });
  
  // For new estimates without project ID, show project selection
  if (isNewEstimate && !projectIdFromQuery) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <h1 className="text-2xl font-semibold">New Estimate</h1>
          </div>
        </div>
        
        <div className="flex-1 p-6">
          <div className="max-w-md mx-auto">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium mb-2">Select Project</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose which project to create the estimate for.
                </p>
              </div>
              
              <div className="space-y-3">
                {projectsLoading ? (
                  <div className="text-center py-4">
                    <div className="text-muted-foreground">Loading projects...</div>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-muted-foreground">No projects available</div>
                  </div>
                ) : (
                  projects.map((project) => (
                    <Card 
                      key={project.id}
                      className="hover-elevate cursor-pointer p-4"
                      onClick={() => setLocation(`/estimates/new?projectId=${project.id}`)}
                      data-testid={`button-select-project-${project.id}`}
                    >
                      <div className="font-medium">{project.name}</div>
                      <div className="text-sm text-muted-foreground">{project.description || 'No description'}</div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mutation for creating new estimate
  const createEstimateMutation = useMutation({
    mutationFn: async (data: { name: string; projectId: string }) => {
      const response = await apiRequest("POST", `/api/estimates`, data);
      return response.json();
    },
    onSuccess: (newEstimate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "New estimate created successfully.",
      });
      // Redirect to the newly created estimate
      setLocation(`/estimates/${newEstimate.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create estimate.",
        variant: "destructive",
      });
    },
  });


  // Handler for creating new estimate
  const handleCreateEstimate = () => {
    if (!newEstimateName.trim() || !projectIdFromQuery) return;
    
    createEstimateMutation.mutate({
      name: newEstimateName.trim(),
      projectId: projectIdFromQuery
    });
  };

  // Mutation for updating estimate name
  const updateEstimateMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("PATCH", `/api/estimates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Estimate name updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update estimate name.",
        variant: "destructive",
      });
      // Reset to original name on error
      setEditingName(estimate?.name || "");
    },
  });

  // Mutation for updating markup percentage
  const updateMarkupMutation = useMutation({
    mutationFn: async (data: { projectMarkupPercent: number }) => {
      const response = await apiRequest("PATCH", `/api/estimates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Markup percentage updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update markup percentage.",
        variant: "destructive",
      });
      // Reset to original markup on error
      setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    },
  });

  // Mutation for adding estimate items
  const addItemMutation = useMutation({
    mutationFn: async (data: InsertEstimateItem) => {
      const response = await apiRequest("POST", `/api/estimates/${id}/items`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      setIsAddItemOpen(false);
      toast({
        title: "Success",
        description: "Estimate item added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add estimate item.",
        variant: "destructive",
      });
    },
  });

  // Mutation for adding estimate groups
  const addGroupMutation = useMutation({
    mutationFn: async (data: InsertEstimateGroup) => {
      const response = await apiRequest("POST", `/api/estimates/${id}/groups`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      setIsAddGroupOpen(false);
      groupForm.reset();
      toast({
        title: "Success",
        description: "Estimate group added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add estimate group.",
        variant: "destructive",
      });
    },
  });

  // Mutation for toggling estimate lock status
  const toggleLockMutation = useMutation({
    mutationFn: async () => {
      const endpoint = estimate?.isLocked ? "unlock" : "lock";
      console.log(`Making ${endpoint} request for estimate ${id}`);
      const response = await apiRequest("POST", `/api/estimates/${id}/${endpoint}`);
      const data = await response.json();
      console.log(`${endpoint} response:`, data);
      return data;
    },
    onSuccess: (updatedEstimate: Estimate) => {
      console.log("Lock mutation success, invalidating queries...");
      console.log("Updated estimate:", updatedEstimate);
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: updatedEstimate.isLocked ? "Estimate locked successfully." : "Estimate unlocked successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Lock mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to toggle estimate lock status.",
        variant: "destructive",
      });
    },
  });

  // Handlers for inline name editing
  const handleNameEdit = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setEditingName(estimate?.name || "");
    setIsEditingName(true);
  };

  const handleNameSave = () => {
    if (!isEditingName || !estimate) return;
    
    const trimmedName = editingName.trim();
    if (trimmedName === estimate.name) {
      // No changes, just exit edit mode
      setIsEditingName(false);
      return;
    }
    
    if (trimmedName === "") {
      toast({
        title: "Invalid Name",
        description: "Estimate name cannot be empty.",
        variant: "destructive",
      });
      setEditingName(estimate.name);
      return;
    }
    
    // Optimistic update
    setIsEditingName(false);
    updateEstimateMutation.mutate({ name: trimmedName });
  };

  const handleNameCancel = () => {
    setEditingName(estimate?.name || "");
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleNameCancel();
    }
  };

  // Handlers for inline markup editing
  const handleMarkupEdit = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    setIsEditingMarkup(true);
  };

  const handleMarkupSave = () => {
    if (!isEditingMarkup || !estimate) return;
    
    const trimmedMarkup = editingMarkup.trim();
    const markupNumber = parseFloat(trimmedMarkup);
    
    // Validation
    if (trimmedMarkup === "" || isNaN(markupNumber)) {
      toast({
        title: "Invalid Percentage",
        description: "Please enter a valid number for markup percentage.",
        variant: "destructive",
      });
      setEditingMarkup(estimate.projectMarkupPercent?.toString() || "0");
      return;
    }
    
    if (markupNumber < 0 || markupNumber > 100) {
      toast({
        title: "Invalid Range",
        description: "Markup percentage must be between 0 and 100.",
        variant: "destructive",
      });
      setEditingMarkup(estimate.projectMarkupPercent?.toString() || "0");
      return;
    }
    
    if (markupNumber === estimate.projectMarkupPercent) {
      // No changes, just exit edit mode
      setIsEditingMarkup(false);
      return;
    }
    
    // Optimistic update
    setIsEditingMarkup(false);
    updateMarkupMutation.mutate({ projectMarkupPercent: markupNumber });
  };

  const handleMarkupCancel = () => {
    setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    setIsEditingMarkup(false);
  };

  const handleMarkupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleMarkupSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleMarkupCancel();
    }
  };

  // Form setup for adding items
  const addItemFormSchema = insertEstimateItemSchema.omit({ 
    estimateId: true 
  }).extend({
    priceExTax: z.number().min(0, "Price must be positive"),
    quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  });

  const form = useForm<z.infer<typeof addItemFormSchema>>({
    resolver: zodResolver(addItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "material",
      quantity: 1,
      unitType: "each",
      priceExTax: 0,
      status: "pending",
    },
  });

  // Form setup for adding groups
  const addGroupFormSchema = insertEstimateGroupSchema.omit({ 
    estimateId: true 
  });

  const groupForm = useForm<z.infer<typeof addGroupFormSchema>>({
    resolver: zodResolver(addGroupFormSchema),
    defaultValues: {
      name: "",
      description: "",
      order: 0,
      isCollapsed: false,
    },
  });

  // Handlers for adding items
  const handleAddItem = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Add Item",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setIsAddItemOpen(true);
  };

  const handleSubmitItem = (data: z.infer<typeof addItemFormSchema>) => {
    if (!estimate) return;
    
    const itemData: InsertEstimateItem = {
      ...data,
      estimateId: estimate.id,
    };
    
    addItemMutation.mutate(itemData);
  };

  const handleCloseAddItem = () => {
    setIsAddItemOpen(false);
    form.reset();
  };

  // Handlers for adding groups
  const handleAddGroup = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Add Group",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setIsAddGroupOpen(true);
  };

  // Handler for toggling lock status
  const handleToggleLock = () => {
    if (!estimate) return;
    toggleLockMutation.mutate();
  };

  const handleSubmitGroup = (data: z.infer<typeof addGroupFormSchema>) => {
    if (!estimate) return;
    
    const groupData: InsertEstimateGroup = {
      ...data,
      estimateId: estimate.id,
    };
    
    addGroupMutation.mutate(groupData);
  };

  const handleCloseAddGroup = () => {
    setIsAddGroupOpen(false);
    groupForm.reset();
  };

  // Fetch estimate details
  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery<Estimate>({
    queryKey: ["/api/estimates", id],
    enabled: !isNewEstimate,
  });

  // Fetch estimate items
  const { data: items = [], isLoading: itemsLoading } = useQuery<EstimateItem[]>({
    queryKey: ["/api/estimates", id, "items"],
    enabled: !!id && !isNewEstimate,
  });

  // Fetch estimate summary
  const { data: summary } = useQuery<EstimateSummary>({
    queryKey: ["/api/estimates", id, "summary"],
    enabled: !!id && !isNewEstimate,
  });

  // Fetch project details
  const projectId = isNewEstimate ? projectIdFromQuery : estimate?.projectId;
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch estimate groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery<EstimateGroup[]>({
    queryKey: ["/api/estimates", id, "groups"],
    enabled: !!id && !isNewEstimate,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };

  const formatQuantity = (quantity: number, unitType: string | null) => {
    return `${quantity}${unitType ? ` ${unitType}` : ''}`;
  };

  // Organize items by groups for display
  const organizeItemsByGroups = () => {
    const groupedItems: { [key: string]: EstimateItem[] } = {};
    const ungroupedItems: EstimateItem[] = [];

    // Sort groups by order
    const sortedGroups = [...groups].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Initialize group containers
    sortedGroups.forEach(group => {
      groupedItems[group.id] = [];
    });

    // Organize items
    items.forEach(item => {
      if (item.groupId && groupedItems[item.groupId]) {
        groupedItems[item.groupId].push(item);
      } else {
        ungroupedItems.push(item);
      }
    });

    // Sort items within each group by order
    Object.keys(groupedItems).forEach(groupId => {
      groupedItems[groupId].sort((a, b) => (a.order || 0) - (b.order || 0));
    });

    // Sort ungrouped items by order
    ungroupedItems.sort((a, b) => (a.order || 0) - (b.order || 0));

    return { sortedGroups, groupedItems, ungroupedItems };
  };

  if (estimateLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <div className="h-6 bg-gray-300 rounded w-48 animate-pulse"></div>
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-300 rounded"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if ((estimateError || !estimate) && !isNewEstimate) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Estimate Not Found</h2>
            <p className="text-muted-foreground">
              The estimate you're looking for doesn't exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle new estimate creation
  if (isNewEstimate) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <h1 className="text-2xl font-semibold">New Estimate</h1>
          </div>
        </div>

        {/* Creation Form */}
        <div className="flex-1 p-6">
          <div className="max-w-md mx-auto">
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Project</label>
                <p className="text-base font-medium text-muted-foreground">
                  {project?.name || 'Loading project...'}
                </p>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="estimate-name" className="text-sm font-medium block">
                  Estimate Name *
                </label>
                <Input
                  id="estimate-name"
                  placeholder="Enter estimate name..."
                  value={newEstimateName}
                  onChange={(e) => setNewEstimateName(e.target.value)}
                  data-testid="input-new-estimate-name"
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={handleCreateEstimate}
                  disabled={!newEstimateName.trim() || createEstimateMutation.isPending}
                  data-testid="button-create-estimate"
                >
                  {createEstimateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Estimate
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setLocation("/estimates")} data-testid="button-cancel-create-estimate">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (estimate: Estimate) => {
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Lock className="w-3 h-3 mr-1" />Locked v{estimate.version}</Badge>;
    }
    return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />Draft v{estimate.version}</Badge>;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")} data-testid="button-back-to-estimates">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <div>
              {isEditingName ? (
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  onBlur={handleNameSave}
                  className="text-2xl font-semibold bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  data-testid="input-estimate-name"
                  autoFocus
                />
              ) : (
                <h1 
                  className="text-2xl font-semibold cursor-pointer hover:text-blue-600 transition-colors" 
                  data-testid="text-estimate-title"
                  onClick={handleNameEdit}
                  title="Click to edit estimate name"
                >
                  {estimate?.name || 'Loading...'}
                </h1>
              )}
              <p className="text-sm text-muted-foreground" data-testid="text-project-name">
                Project: {project?.name || 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {estimate && getStatusBadge(estimate)}
            <Button variant="outline" size="sm" data-testid="button-edit-estimate">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            {estimate && (
              <Button 
                variant={estimate.isLocked ? "destructive" : "outline"} 
                size="sm" 
                data-testid="button-toggle-lock"
                onClick={handleToggleLock}
                disabled={toggleLockMutation.isPending}
              >
                {estimate.isLocked ? (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  {toggleLockMutation.isPending ? "Unlocking..." : "Unlock"}
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  {toggleLockMutation.isPending ? "Locking..." : "Lock"}
                </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-6">
          {/* Summary Cards */}
          {summary && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Subtotal</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-subtotal">
                    {formatCurrency(summary.subtotal)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ex-tax
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Markup (
                    {isEditingMarkup ? (
                      <Input
                        value={editingMarkup}
                        onChange={(e) => setEditingMarkup(e.target.value)}
                        onKeyDown={handleMarkupKeyDown}
                        onBlur={handleMarkupSave}
                        className="inline-block w-16 h-5 text-xs bg-transparent border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        data-testid="input-markup-percentage"
                        autoFocus
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    ) : (
                      <span 
                        className="cursor-pointer hover:text-blue-600 transition-colors underline decoration-dotted"
                        onClick={handleMarkupEdit}
                        title="Click to edit markup percentage"
                        data-testid="text-markup-percentage"
                      >
                        {estimate?.projectMarkupPercent || 0}
                      </span>
                    )}
                    %)
                  </CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-markup">
                    {formatCurrency(summary.markupAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {estimate?.projectMarkupPercent || 0}% of subtotal
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">GST ({estimate?.taxRate || 10}%)</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-tax">
                    {formatCurrency(summary.taxAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {estimate?.taxRate || 10}% on marked-up total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-total">
                    {formatCurrency(summary.total)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Final amount
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Items Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Estimate Items ({items.length})
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Button 
                  size="sm" 
                  data-testid="button-add-group" 
                  onClick={handleAddGroup}
                  disabled={estimate?.isLocked}
                  variant={estimate?.isLocked ? "secondary" : "outline"}
                >
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Add Group
                </Button>
                <Button 
                  size="sm" 
                  data-testid="button-add-item" 
                  onClick={handleAddItem}
                  disabled={estimate?.isLocked}
                  variant={estimate?.isLocked ? "secondary" : "default"}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="animate-pulse space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-300 rounded"></div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No items added yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Add your first estimate item to start building this estimate.
                  </p>
                  <Button 
                    data-testid="button-add-first-item" 
                    onClick={handleAddItem}
                    disabled={estimate?.isLocked}
                    variant={estimate?.isLocked ? "secondary" : "default"}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create first estimate item
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="h-8">
                      <TableHead className="py-1 text-xs font-medium">Item</TableHead>
                      <TableHead className="py-1 text-xs font-medium">Type</TableHead>
                      <TableHead className="py-1 text-xs font-medium">Quantity</TableHead>
                      <TableHead className="py-1 text-xs font-medium">Price Ex-Tax</TableHead>
                      <TableHead className="py-1 text-xs font-medium">Tax</TableHead>
                      <TableHead className="py-1 text-xs font-medium">Total Inc-Tax</TableHead>
                      <TableHead className="py-1 text-xs font-medium">Status</TableHead>
                      <TableHead className="py-1 text-xs font-medium w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
{(() => {
                      const { sortedGroups, groupedItems, ungroupedItems } = organizeItemsByGroups();
                      
                      return (
                        <>
                          {/* Render grouped items */}
                          {sortedGroups.map((group) => (
                            <React.Fragment key={`group-${group.id}`}>
                              {/* Group header row */}
                              <TableRow className="bg-muted/50 hover:bg-muted/50" data-testid={`row-group-${group.id}`}>
                                <TableCell colSpan={8} className="py-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <Badge variant="secondary" className="text-xs font-medium">
                                        Group
                                      </Badge>
                                      <span className="font-medium text-sm">{group.name}</span>
                                      {group.description && (
                                        <span className="text-xs text-muted-foreground">- {group.description}</span>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {groupedItems[group.id]?.length || 0} items
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                              
                              {/* Render items in this group */}
                              {groupedItems[group.id]?.map((item) => (
                                <TableRow key={item.id} data-testid={`row-item-${item.id}`} className="min-h-8">
                                  <TableCell className="py-0.5 pl-8">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="font-medium text-sm truncate cursor-help max-w-[180px] block">
                                            {item.name}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="max-w-[300px]">
                                            <p className="font-medium">{item.name}</p>
                                            {item.description && (
                                              <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </TableCell>
                                  <TableCell className="py-0.5">
                                    <Badge variant="outline" className="text-xs h-5">{item.type}</Badge>
                                  </TableCell>
                                  <TableCell className="py-0.5 text-sm">{formatQuantity(item.quantity, item.unitType)}</TableCell>
                                  <TableCell className="py-0.5 text-sm">{formatCurrency(item.priceExTax)}</TableCell>
                                  <TableCell className="py-0.5 text-sm">{formatCurrency(item.taxAmount)}</TableCell>
                                  <TableCell className="py-0.5 text-sm font-medium">{formatCurrency(item.priceIncTax)}</TableCell>
                                  <TableCell className="py-0.5">
                                    <Badge 
                                      variant={item.status === 'confirmed' ? 'default' : 'secondary'}
                                      className="text-xs h-5"
                                    >
                                      {item.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-0.5">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-8 w-8 p-0" 
                                          data-testid={`button-actions-${item.id}`}
                                          disabled={estimate?.isLocked}
                                        >
                                          <MoreHorizontal className="w-4 h-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem 
                                          data-testid={`button-edit-item-${item.id}`}
                                          disabled={estimate?.isLocked}
                                        >
                                          <Edit className="w-4 h-4 mr-2" />
                                          Edit Item
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                          data-testid={`button-delete-item-${item.id}`} 
                                          className="text-destructive"
                                          disabled={estimate?.isLocked}
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Delete Item
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </React.Fragment>
                          ))}
                          
                          {/* Render ungrouped items */}
                          {ungroupedItems.length > 0 && (
                            <>
                              {sortedGroups.length > 0 && (
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableCell colSpan={8} className="py-2">
                                    <div className="flex items-center space-x-2">
                                      <Badge variant="outline" className="text-xs">
                                        Ungrouped Items
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {ungroupedItems.length} items
                                      </span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                              
                              {ungroupedItems.map((item) => (
                                <TableRow key={item.id} data-testid={`row-item-${item.id}`} className="min-h-8">
                                  <TableCell className="py-0.5">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="font-medium text-sm truncate cursor-help max-w-[200px] block">
                                            {item.name}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="max-w-[300px]">
                                            <p className="font-medium">{item.name}</p>
                                            {item.description && (
                                              <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </TableCell>
                                  <TableCell className="py-0.5">
                                    <Badge variant="outline" className="text-xs h-5">{item.type}</Badge>
                                  </TableCell>
                                  <TableCell className="py-0.5 text-sm">{formatQuantity(item.quantity, item.unitType)}</TableCell>
                                  <TableCell className="py-0.5 text-sm">{formatCurrency(item.priceExTax)}</TableCell>
                                  <TableCell className="py-0.5 text-sm">{formatCurrency(item.taxAmount)}</TableCell>
                                  <TableCell className="py-0.5 text-sm font-medium">{formatCurrency(item.priceIncTax)}</TableCell>
                                  <TableCell className="py-0.5">
                                    <Badge 
                                      variant={item.status === 'confirmed' ? 'default' : 'secondary'}
                                      className="text-xs h-5"
                                    >
                                      {item.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-0.5">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-8 w-8 p-0" 
                                          data-testid={`button-actions-${item.id}`}
                                          disabled={estimate?.isLocked}
                                        >
                                          <MoreHorizontal className="w-4 h-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem 
                                          data-testid={`button-edit-item-${item.id}`}
                                          disabled={estimate?.isLocked}
                                        >
                                          <Edit className="w-4 h-4 mr-2" />
                                          Edit Item
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                          data-testid={`button-delete-item-${item.id}`} 
                                          className="text-destructive"
                                          disabled={estimate?.isLocked}
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Delete Item
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Estimate Item</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitItem)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Premium Kitchen Cabinets" {...field} data-testid="input-item-name" />
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
                      <Textarea placeholder="Additional details about this item..." {...field} value={field.value || ""} data-testid="input-item-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="material">Material</SelectItem>
                          <SelectItem value="labour">Labour</SelectItem>
                          <SelectItem value="equipment">Equipment</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="quoted">Quoted</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0.01"
                          placeholder="1"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-item-quantity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-unit">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="each">each</SelectItem>
                          <SelectItem value="set">set</SelectItem>
                          <SelectItem value="m">m</SelectItem>
                          <SelectItem value="m²">m²</SelectItem>
                          <SelectItem value="hours">hours</SelectItem>
                          <SelectItem value="days">days</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priceExTax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (Ex-Tax)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-item-price"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseAddItem} data-testid="button-cancel-add-item">
                  Cancel
                </Button>
                <Button type="submit" disabled={addItemMutation.isPending} data-testid="button-submit-add-item">
                  {addItemMutation.isPending ? "Adding..." : "New item"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Group Dialog */}
      <Dialog open={isAddGroupOpen} onOpenChange={setIsAddGroupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Estimate Group</DialogTitle>
          </DialogHeader>
          <Form {...groupForm}>
            <form onSubmit={groupForm.handleSubmit(handleSubmitGroup)} className="space-y-4">
              <FormField
                control={groupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Kitchen Work" {...field} data-testid="input-group-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={groupForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional details about this group..." {...field} value={field.value || ""} data-testid="input-group-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={groupForm.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-group-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseAddGroup} data-testid="button-cancel-add-group">
                  Cancel
                </Button>
                <Button type="submit" disabled={addGroupMutation.isPending} data-testid="button-submit-add-group">
                  {addGroupMutation.isPending ? "Adding..." : "Add Group"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}