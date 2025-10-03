import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  GripVertical,
  Filter
} from "lucide-react";
import { type Estimate, type EstimateItem, type EstimateSummary, type Project, type InsertEstimateItem, insertEstimateItemSchema, type EstimateGroup, type InsertEstimateGroup, insertEstimateGroupSchema, type FieldCategoryWithOptions } from "@shared/schema";
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
import { Separator } from "@/components/ui/separator";

interface EstimateDetailParams {
  id?: string;
  estimateId?: string;
  projectId?: string;
}

export default function EstimateDetail() {
  const { id, estimateId, projectId: projectIdFromParams } = useParams<EstimateDetailParams>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Normalize estimate ID - prioritize estimateId (from project-scoped routes), fall back to id (from global routes)
  const effectiveEstimateId = estimateId || id;
  
  // Check if we're creating a new estimate (check location path since /estimates/new doesn't have :id param)
  const isNewEstimate = location === '/estimates/new' || location.includes('/estimates/new') || effectiveEstimateId === 'new';
  
  // Get project ID - prioritize route params for project-scoped routes, fall back to query params for backwards compatibility
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdFromQuery = urlParams.get('projectId');
  const effectiveProjectId = projectIdFromParams || projectIdFromQuery;
  
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

  // Inline editing state for table cells
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<any>("");

  // Column configuration state
  type ColumnConfig = { id: string; label: string; visible: boolean; widthPx: number };
  const defaultColumns: ColumnConfig[] = [
    { id: 'item', label: 'Item', visible: true, widthPx: 180 },
    { id: 'type', label: 'Type', visible: true, widthPx: 100 },
    { id: 'quantity', label: 'Quantity', visible: true, widthPx: 100 },
    { id: 'priceExTax', label: 'Price Ex-Tax', visible: true, widthPx: 120 },
    { id: 'tax', label: 'Tax', visible: true, widthPx: 100 },
    { id: 'totalIncTax', label: 'Total Inc-Tax', visible: true, widthPx: 120 },
    { id: 'status', label: 'Status', visible: true, widthPx: 120 },
  ];
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);

  // Filter state
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');

  // Resizing state
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Load column config from localStorage
  React.useEffect(() => {
    if (effectiveEstimateId && !isNewEstimate) {
      const savedColumns = localStorage.getItem(`estimateTable_${effectiveEstimateId}_columns`);
      if (savedColumns) {
        try {
          setColumns(JSON.parse(savedColumns));
        } catch (e) {
          console.error('Failed to parse saved column config:', e);
        }
      }

      const savedFilters = localStorage.getItem(`estimateTable_${effectiveEstimateId}_filters`);
      if (savedFilters) {
        try {
          const filters = JSON.parse(savedFilters);
          setFilterType(filters.type || 'all');
          setFilterStatus(filters.status || 'all');
          setFilterGroup(filters.group || 'all');
        } catch (e) {
          console.error('Failed to parse saved filters:', e);
        }
      }
    }
  }, [effectiveEstimateId, isNewEstimate]);

  // Save column config to localStorage (skip during active resizing)
  React.useEffect(() => {
    if (effectiveEstimateId && !isNewEstimate && !resizingColumn) {
      localStorage.setItem(`estimateTable_${effectiveEstimateId}_columns`, JSON.stringify(columns));
    }
  }, [columns, effectiveEstimateId, isNewEstimate, resizingColumn]);

  // Save filters to localStorage
  React.useEffect(() => {
    if (effectiveEstimateId && !isNewEstimate) {
      localStorage.setItem(`estimateTable_${effectiveEstimateId}_filters`, JSON.stringify({
        type: filterType,
        status: filterStatus,
        group: filterGroup
      }));
    }
  }, [filterType, filterStatus, filterGroup, effectiveEstimateId, isNewEstimate]);

  // Early validation - show error if invalid ID for non-new estimates
  if (!effectiveEstimateId && !isNewEstimate) {
    return <div>Invalid estimate ID</div>;
  }

  // Fetch all projects for project selection
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isNewEstimate && !effectiveProjectId,
  });

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
    if (!newEstimateName.trim() || !effectiveProjectId) return;
    
    createEstimateMutation.mutate({
      name: newEstimateName.trim(),
      projectId: effectiveProjectId
    });
  };

  // For new estimates without project ID, show project selection
  if (isNewEstimate && !effectiveProjectId) {
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

  // Mutation for updating estimate name
  const updateEstimateMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiRequest("PATCH", `/api/estimates/${effectiveEstimateId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
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
      const response = await apiRequest("PATCH", `/api/estimates/${effectiveEstimateId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
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
      const response = await apiRequest("POST", `/api/estimates/${effectiveEstimateId}/items`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
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
      const response = await apiRequest("POST", `/api/estimates/${effectiveEstimateId}/groups`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
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
      console.log(`Making ${endpoint} request for estimate ${effectiveEstimateId}`);
      const response = await apiRequest("POST", `/api/estimates/${effectiveEstimateId}/${endpoint}`);
      const data = await response.json();
      console.log(`${endpoint} response:`, data);
      return data;
    },
    onSuccess: (updatedEstimate: Estimate) => {
      console.log("Lock mutation success, invalidating queries...");
      console.log("Updated estimate:", updatedEstimate);
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
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

  // Mutation for toggling group collapse state
  const toggleGroupCollapseMutation = useMutation({
    mutationFn: async ({ groupId, isCollapsed }: { groupId: string; isCollapsed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/estimate-groups/${groupId}`, { isCollapsed });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to toggle group collapse state.",
        variant: "destructive",
      });
    },
  });

  // Mutation for updating estimate items
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<InsertEstimateItem> }) => {
      const response = await apiRequest("PATCH", `/api/estimate-items/${itemId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Item updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update item.",
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

  // Handlers for inline cell editing
  const handleCellEdit = (item: EstimateItem, field: string) => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    
    setEditingCell({ itemId: item.id, field });
    
    // Set initial value based on field type
    switch (field) {
      case 'quantity':
        setEditingValue(item.quantity);
        break;
      case 'priceExTax':
        // Convert cents to dollars for display
        setEditingValue((item.priceExTax / 100).toFixed(2));
        break;
      case 'priceIncTax':
        // Convert cents to dollars for display
        setEditingValue((item.priceIncTax / 100).toFixed(2));
        break;
      case 'type':
        setEditingValue(item.type);
        break;
      case 'status':
        setEditingValue(item.status);
        break;
      case 'name':
        setEditingValue(item.name);
        break;
      default:
        setEditingValue('');
    }
  };

  const handleCellSave = (item: EstimateItem, field: string) => {
    if (!editingCell) return;
    
    // Validate based on field type
    if (field === 'quantity' || field === 'priceExTax' || field === 'priceIncTax') {
      const numValue = parseFloat(editingValue);
      if (isNaN(numValue) || numValue < 0) {
        toast({
          title: "Invalid Value",
          description: "Please enter a valid positive number.",
          variant: "destructive",
        });
        // Reset to original value in dollars for price fields
        if (field === 'priceExTax' || field === 'priceIncTax') {
          setEditingValue(((item as any)[field] / 100).toFixed(2));
        } else {
          setEditingValue((item as any)[field]);
        }
        return;
      }
    }
    
    if (field === 'name' && !editingValue.trim()) {
      toast({
        title: "Invalid Name",
        description: "Item name cannot be empty.",
        variant: "destructive",
      });
      setEditingValue(item.name);
      return;
    }
    
    // Prepare update data
    let valueToSave: any;
    if (field === 'priceExTax' || field === 'priceIncTax') {
      // Convert dollars to cents
      valueToSave = Math.round(parseFloat(editingValue) * 100);
      
      // Check if value actually changed (compare cents to cents)
      if (valueToSave === (item as any)[field]) {
        setEditingCell(null);
        return;
      }
    } else if (field === 'quantity') {
      valueToSave = parseFloat(editingValue);
      if (valueToSave === item.quantity) {
        setEditingCell(null);
        return;
      }
    } else {
      valueToSave = editingValue;
      if (valueToSave === (item as any)[field]) {
        setEditingCell(null);
        return;
      }
    }
    
    const updateData: Partial<InsertEstimateItem> = {
      [field]: valueToSave
    };
    
    // If updating prices, recalculate tax
    if (field === 'priceExTax' || field === 'priceIncTax') {
      const priceExTax = field === 'priceExTax' ? valueToSave : item.priceExTax;
      const priceIncTax = field === 'priceIncTax' ? valueToSave : item.priceIncTax;
      updateData.taxAmount = priceIncTax - priceExTax;
    }
    
    // Clear editing state first (optimistic update)
    setEditingCell(null);
    
    // Update the item
    updateItemMutation.mutate({ itemId: item.id, data: updateData });
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, item: EstimateItem, field: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCellSave(item, field);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCellCancel();
    }
  };

  // Form setup for adding items
  const addItemFormSchema = insertEstimateItemSchema.omit({ 
    estimateId: true,
    taxAmount: true, // Calculated field
  }).extend({
    priceExTax: z.number().min(0, "Price must be positive"),
    priceIncTax: z.number().min(0, "Price must be positive"),
    quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  });

  const form = useForm<z.infer<typeof addItemFormSchema>>({
    resolver: zodResolver(addItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      notes: "",
      type: "material",
      quantity: 1,
      unitType: "each",
      priceExTax: 0,
      priceIncTax: 0,
      status: "pending",
      groupId: undefined,
      costCode: undefined,
      allowance: "None",
      attachmentUrl: "",
      requestForQuote: false,
      isSelection: false,
      visibleInProposal: true,
      showAsInProposal: "price",
      order: 0,
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
    
    // Calculate tax amount from the difference
    const taxAmount = data.priceIncTax - data.priceExTax;
    
    const itemData: InsertEstimateItem = {
      ...data,
      estimateId: estimate.id,
      taxAmount,
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

  // Handler for toggling group collapse
  const handleToggleGroupCollapse = (groupId: string, currentIsCollapsed: boolean) => {
    toggleGroupCollapseMutation.mutate({ 
      groupId, 
      isCollapsed: !currentIsCollapsed 
    });
  };

  // Handler for collapse/expand all groups
  const handleToggleAllGroups = async () => {
    if (!estimate || groups.length === 0) return;
    
    // Determine if we should collapse all or expand all
    // If any group is expanded, collapse all. Otherwise, expand all.
    const anyExpanded = groups.some(group => !group.isCollapsed);
    const targetState = anyExpanded; // true = collapse all, false = expand all
    
    // Update all groups
    const updatePromises = groups.map(group => 
      apiRequest("PATCH", `/api/estimate-groups/${group.id}`, { isCollapsed: targetState })
    );
    
    try {
      await Promise.all(updatePromises);
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      toast({
        title: "Success",
        description: targetState ? "All groups collapsed." : "All groups expanded.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update groups.",
        variant: "destructive",
      });
    }
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

  // Column visibility toggle handler
  const toggleColumn = (columnId: string) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };

  // Column resize handlers
  const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    const currentWidth = columns.find(col => col.id === columnId)?.widthPx || 100;
    
    setResizingColumn(columnId);
    setResizeStartX(e.clientX);
    setResizeStartWidth(currentWidth);
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  // Handle resize effect
  React.useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(80, resizeStartWidth + diff);
      
      setColumns(prev => prev.map(col => {
        if (col.id === resizingColumn) {
          return { ...col, widthPx: newWidth };
        }
        return col;
      }));
    };

    const handleMouseUp = () => {
      // Clear resizing state - this will trigger the localStorage save via useEffect
      setResizingColumn(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  // Fetch estimate details
  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery<Estimate>({
    queryKey: ["/api/estimates", effectiveEstimateId],
    enabled: !isNewEstimate,
  });

  // Fetch estimate items
  const { data: items = [], isLoading: itemsLoading } = useQuery<EstimateItem[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "items"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch estimate summary
  const { data: summary } = useQuery<EstimateSummary>({
    queryKey: ["/api/estimates", effectiveEstimateId, "summary"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch project details
  const projectId = isNewEstimate ? effectiveProjectId : estimate?.projectId;
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch estimate groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery<EstimateGroup[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "groups"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch estimate item status field category options
  const { data: estimateItemStatusCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.status"],
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

  // Filter items based on current filter state
  const getFilteredItems = () => {
    return items.filter(item => {
      // Type filter
      if (filterType !== 'all' && item.type !== filterType) return false;
      
      // Status filter
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      
      // Group filter
      if (filterGroup !== 'all') {
        if (filterGroup === 'ungrouped' && item.groupId) return false;
        if (filterGroup !== 'ungrouped' && item.groupId !== filterGroup) return false;
      }
      
      return true;
    });
  };

  // Organize items by groups for display
  const organizeItemsByGroups = () => {
    const filteredItems = getFilteredItems();
    const groupedItems: { [key: string]: EstimateItem[] } = {};
    const ungroupedItems: EstimateItem[] = [];

    // Sort groups by order
    const sortedGroups = [...groups].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Initialize group containers
    sortedGroups.forEach(group => {
      groupedItems[group.id] = [];
    });

    // Organize items
    filteredItems.forEach(item => {
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

  // Render cell based on column ID
  const renderCell = (item: EstimateItem, columnId: string) => {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === columnId;
    const isLocked = estimate?.isLocked;

    switch (columnId) {
      case 'item':
        if (isEditing) {
          return (
            <TableCell className="py-0.5 pl-8">
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'name')}
                onBlur={() => handleCellSave(item, 'name')}
                className="h-7 text-sm border-primary"
                autoFocus
                data-testid={`input-edit-name-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 pl-8 ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'name')}
            data-testid={`cell-name-${item.id}`}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-medium text-sm truncate max-w-[180px] block">
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
        );
      case 'type':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Select 
                value={editingValue} 
                onValueChange={(value) => {
                  setEditingValue(value);
                  // Auto-save on selection change
                  setTimeout(() => {
                    updateItemMutation.mutate({ 
                      itemId: item.id, 
                      data: { type: value } 
                    });
                    setEditingCell(null);
                  }, 0);
                }}
              >
                <SelectTrigger className="h-7 text-xs border-primary" data-testid={`select-edit-type-${item.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="labour">Labour</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="fee">Fee</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'type')}
            data-testid={`cell-type-${item.id}`}
          >
            <Badge variant="outline" className="text-xs h-5">{item.type}</Badge>
          </TableCell>
        );
      case 'quantity':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'quantity')}
                onBlur={() => handleCellSave(item, 'quantity')}
                className="h-7 text-sm border-primary"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-quantity-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'quantity')}
            data-testid={`cell-quantity-${item.id}`}
          >
            {formatQuantity(item.quantity, item.unitType)}
          </TableCell>
        );
      case 'priceExTax':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'priceExTax')}
                onBlur={() => handleCellSave(item, 'priceExTax')}
                className="h-7 text-sm border-primary"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-priceExTax-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'priceExTax')}
            data-testid={`cell-priceExTax-${item.id}`}
          >
            {formatCurrency(item.priceExTax)}
          </TableCell>
        );
      case 'tax':
        return (
          <TableCell className="py-0.5 text-sm" data-testid={`cell-tax-${item.id}`}>
            {formatCurrency(item.taxAmount)}
          </TableCell>
        );
      case 'totalIncTax':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'priceIncTax')}
                onBlur={() => handleCellSave(item, 'priceIncTax')}
                className="h-7 text-sm border-primary font-medium"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-priceIncTax-${item.id}`}
              />
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 text-sm font-medium ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'priceIncTax')}
            data-testid={`cell-priceIncTax-${item.id}`}
          >
            {formatCurrency(item.priceIncTax)}
          </TableCell>
        );
      case 'status':
        if (isEditing) {
          return (
            <TableCell className="py-0.5">
              <Select 
                value={editingValue} 
                onValueChange={(value) => {
                  setEditingValue(value);
                  // Auto-save on selection change
                  setTimeout(() => {
                    updateItemMutation.mutate({ 
                      itemId: item.id, 
                      data: { status: value } 
                    });
                    setEditingCell(null);
                  }, 0);
                }}
              >
                <SelectTrigger className="h-7 text-xs border-primary" data-testid={`select-edit-status-${item.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((opt: any) => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          );
        }
        return (
          <TableCell 
            className={`py-0.5 ${!isLocked ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => !isLocked && handleCellEdit(item, 'status')}
            data-testid={`cell-status-${item.id}`}
          >
            <Badge 
              variant="outline"
              className="text-xs h-5"
              style={{
                backgroundColor: estimateItemStatusCategory?.options?.find((opt: any) => opt.key === item.status)?.color || '#6B7280',
                color: '#FFFFFF',
                borderColor: estimateItemStatusCategory?.options?.find((opt: any) => opt.key === item.status)?.color || '#6B7280'
              }}
            >
              {estimateItemStatusCategory?.options?.find((opt: any) => opt.key === item.status)?.name || item.status}
            </Badge>
          </TableCell>
        );
      default:
        return <TableCell className="py-0.5"></TableCell>;
    }
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
        <div className="space-y-6 min-w-0">
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
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Estimate Items ({items.length})
              </CardTitle>
              <div className="flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-column-visibility"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5 text-sm font-semibold">Show columns</div>
                    {columns.map(column => (
                      <DropdownMenuItem 
                        key={column.id}
                        onClick={(e) => {
                          e.preventDefault();
                          toggleColumn(column.id);
                        }}
                      >
                        <Checkbox
                          checked={column.visible}
                          onCheckedChange={() => toggleColumn(column.id)}
                          className="mr-2"
                        />
                        {column.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
            
            {/* Filter Bar */}
            <div className="px-6 py-3 border-b flex items-center gap-3">
              {groups.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={handleToggleAllGroups}
                    data-testid="button-toggle-all-groups"
                  >
                    {groups.some(group => !group.isCollapsed) ? (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2" />
                        Collapse All
                      </>
                    ) : (
                      <>
                        <ChevronRight className="h-4 w-4 mr-2" />
                        Expand All
                      </>
                    )}
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                </>
              )}
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Array.from(new Set(items.map(item => item.type))).map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((opt: any) => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-[140px] h-8" data-testid="filter-group">
                  <SelectValue placeholder="Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  <SelectItem value="ungrouped">Ungrouped</SelectItem>
                  {groups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {(filterType !== 'all' || filterStatus !== 'all' || filterGroup !== 'all') && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8"
                  onClick={() => {
                    setFilterType('all');
                    setFilterStatus('all');
                    setFilterGroup('all');
                  }}
                  data-testid="button-clear-filters"
                >
                  Clear All
                </Button>
              )}
            </div>
            
            <CardContent className="p-0 overflow-x-auto">
              {itemsLoading || groupsLoading ? (
                <div className="animate-pulse space-y-2 p-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-300 rounded"></div>
                  ))}
                </div>
              ) : items.length === 0 && groups.length === 0 ? (
                <div className="text-center py-8 px-6">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No items or groups added yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Add a group to organize items, or add items directly.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button 
                      data-testid="button-add-first-group" 
                      onClick={handleAddGroup}
                      disabled={estimate?.isLocked}
                      variant={estimate?.isLocked ? "secondary" : "outline"}
                    >
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Add Group
                    </Button>
                    <Button 
                      data-testid="button-add-first-item" 
                      onClick={handleAddItem}
                      disabled={estimate?.isLocked}
                      variant={estimate?.isLocked ? "secondary" : "default"}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                </div>
              ) : (
                  <Table style={{ 
                    display: 'table',
                    tableLayout: 'fixed',
                    width: `${columns.filter(col => col.visible).reduce((sum, col) => sum + col.widthPx, 0) + 80}px`,
                    minWidth: `${columns.filter(col => col.visible).reduce((sum, col) => sum + col.widthPx, 0) + 80}px`
                  }}>
                    <colgroup>
                      {columns.filter(col => col.visible).map(column => (
                        <col key={column.id} style={{ width: `${column.widthPx}px`, minWidth: `${column.widthPx}px` }} />
                      ))}
                      <col style={{ width: '80px' }} />
                    </colgroup>
                  <TableHeader>
                    <TableRow className="h-8">
                      {columns.filter(col => col.visible).map(column => (
                        <TableHead 
                          key={column.id}
                          className="py-1 text-xs font-medium relative group"
                          style={{ width: `${column.widthPx}px` }}
                        >
                          <div className="flex items-center gap-1">
                            <span>{column.label}</span>
                          </div>
                          {/* Resize handle */}
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            style={{ pointerEvents: 'auto', touchAction: 'none' }}
                            onMouseDown={(e) => handleResizeStart(e, column.id)}
                            data-testid={`resize-handle-${column.id}`}
                          />
                        </TableHead>
                      ))}
                      <TableHead className="py-1 text-xs font-medium">Actions</TableHead>
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
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => handleToggleGroupCollapse(group.id, group.isCollapsed || false)}
                                        data-testid={`button-toggle-group-${group.id}`}
                                      >
                                        {group.isCollapsed ? (
                                          <ChevronRight className="h-4 w-4" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4" />
                                        )}
                                      </Button>
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
                              
                              {/* Render items in this group - only if not collapsed */}
                              {!group.isCollapsed && groupedItems[group.id]?.map((item) => (
                                <TableRow key={item.id} data-testid={`row-item-${item.id}`} className="min-h-8">
                                  {columns.filter(col => col.visible).map(column => (
                                    <React.Fragment key={column.id}>
                                      {renderCell(item, column.id)}
                                    </React.Fragment>
                                  ))}
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
                                  {columns.filter(col => col.visible).map(column => (
                                    <React.Fragment key={column.id}>
                                      {renderCell(item, column.id)}
                                    </React.Fragment>
                                  ))}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  name="groupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-item-group">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None (ungrouped)</SelectItem>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
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
                  name="costCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Code (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined} disabled>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-costcode">
                            <SelectValue placeholder="Not configured" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                          {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((option: any) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="quoted">Quoted</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priceExTax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price Ex Tax</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          placeholder="0.00"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          {...field}
                          onChange={(e) => {
                            const exTax = parseFloat(e.target.value) || 0;
                            field.onChange(exTax);
                            // Auto-calculate price inc tax using tax rate from estimate
                            const taxRate = (estimate?.taxRate || 10) / 100;
                            const incTax = exTax * (1 + taxRate);
                            form.setValue('priceIncTax', incTax);
                          }}
                          data-testid="input-item-price-ex-tax"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priceIncTax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price Inc Tax</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0"
                          placeholder="0.00"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          {...field}
                          onChange={(e) => {
                            const incTax = parseFloat(e.target.value) || 0;
                            field.onChange(incTax);
                            // Auto-calculate price ex tax using tax rate from estimate
                            const taxRate = (estimate?.taxRate || 10) / 100;
                            const exTax = incTax / (1 + taxRate);
                            form.setValue('priceExTax', exTax);
                          }}
                          data-testid="input-item-price-inc-tax"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Internal notes for the team..." {...field} value={field.value || ""} data-testid="input-item-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowance</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-item-allowance">
                          <SelectValue placeholder="Select allowance type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="None">None</SelectItem>
                        <SelectItem value="Prime Cost">Prime Cost</SelectItem>
                        <SelectItem value="Provisional Sum">Provisional Sum</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attachmentUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attachment URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} value={field.value || ""} data-testid="input-item-attachment" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="requestForQuote"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-request-for-quote"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Request for Quote</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isSelection"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-is-selection"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Link to Selections</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Proposal Settings</h4>
                
                <FormField
                  control={form.control}
                  name="visibleInProposal"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-visible-in-proposal"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Show in client proposal</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="showAsInProposal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show as in proposal</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-show-as-in-proposal">
                            <SelectValue placeholder="Select display format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="empty">Empty (no price)</SelectItem>
                          <SelectItem value="price">Show price</SelectItem>
                          <SelectItem value="included">Included</SelectItem>
                          <SelectItem value="excluded">Excluded</SelectItem>
                        </SelectContent>
                      </Select>
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