import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProject } from "@/contexts/ProjectContext";
import { useSelectionStatusOptions } from "@/hooks/useSelectionStatusOptions";
import { 
  insertSelectionOptionSchema, 
  insertSelectionSchema,
  type SelectionWithOptions,
  type SelectionOption,
  type InsertSelectionOption,
  type InsertSelection,
  type FieldCategoryWithOptions
} from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Calendar as CalendarIcon,
  MapPin,
  Settings,
  Loader2,
  Save,
  Eye,
  EyeOff,
  LockOpen,
  Lock,
  LayoutList,
  LayoutGrid,
  ExternalLink,
  Users,
  Truck,
  HardHat,
  MessageSquare,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export default function SelectionDetail() {
  const { id, projectId } = useParams<{ id: string; projectId?: string }>();
  const [, setLocation] = useLocation();
  const { currentProject } = useProject();
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("options");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [optionsView, setOptionsView] = useState<"table" | "grid">("table");
  const { toast } = useToast();
  const { statusOptions, getStatusInfo, getStatusLabel } = useSelectionStatusOptions();

  const effectiveProjectId = projectId || currentProject?.id;

  const { data: selectionCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
  });

  const { data: locationCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.room"],
  });

  const { data: selection, isLoading } = useQuery<SelectionWithOptions>({
    queryKey: ["/api/selections", id],
    enabled: !!id,
  });

  const selectionForm = useForm<InsertSelection>({
    resolver: zodResolver(insertSelectionSchema),
    defaultValues: {
      projectId: effectiveProjectId || "",
      name: "",
      description: "",
      category: "",
      room: "",
      selectionType: "selection",
      status: "draft",
      deadline: undefined,
      allowance: undefined,
      clientCanChange: true,
      clientCanSeePrice: false,
    },
  });

  useEffect(() => {
    if (selection) {
      selectionForm.reset({
        projectId: selection.projectId,
        name: selection.name,
        description: selection.description || "",
        category: selection.category || "",
        room: selection.room || "",
        selectionType: (selection as any).selectionType || "selection",
        status: selection.status,
        deadline: selection.deadline || undefined,
        allowance: selection.allowance || undefined,
        clientCanChange: selection.clientCanChange,
        clientCanSeePrice: selection.clientCanSeePrice,
      });
    }
  }, [selection]);

  useEffect(() => {
    const subscription = selectionForm.watch(() => {
      setHasUnsavedChanges(true);
    });
    return () => subscription.unsubscribe();
  }, [selectionForm.watch]);

  const updateSelectionMutation = useMutation({
    mutationFn: async (data: Partial<InsertSelection>) => {
      return await apiRequest(`/api/selections/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/selections", effectiveProjectId] });
      setHasUnsavedChanges(false);
      toast({
        title: "Selection updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createOptionMutation = useMutation({
    mutationFn: async (option: InsertSelectionOption) => {
      return await apiRequest(`/api/selections/${id}/options`, "POST", option);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      setIsAddingOption(false);
      toast({
        title: "Option added",
        description: "The selection option has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateOptionMutation = useMutation({
    mutationFn: async ({ optionId, data }: { optionId: string; data: Partial<InsertSelectionOption> }) => {
      return await apiRequest(`/api/selection-options/${optionId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      setEditingOption(null);
      toast({
        title: "Option updated",
        description: "The selection option has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (optionId: string) => {
      await apiRequest(`/api/selection-options/${optionId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", id] });
      toast({
        title: "Option deleted",
        description: "The selection option has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete option. Please try again.",
        variant: "destructive",
      });
    },
  });

  const [gstInclusive, setGstInclusive] = useState<boolean>(false);

  const optionForm = useForm<InsertSelectionOption>({
    resolver: zodResolver(insertSelectionOptionSchema),
    defaultValues: {
      selectionId: id || "",
      name: "",
      description: "",
      sku: "",
      brand: "",
      category: "",
      subcategory: "",
      unitCost: undefined,
      unitTax: undefined,
      gstInclusive: false,
      markupPercent: undefined,
      totalCost: undefined,
      quantity: 1,
      unitType: "ea",
      url: "",
      visibleToClient: true,
      isSelectedByClient: false,
      sortOrder: 0,
    },
  });

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setIsAddingOption(false);
      setEditingOption(null);
      setGstInclusive(false);
      optionForm.reset({
        selectionId: id || "",
        name: "",
        description: "",
        sku: "",
        brand: "",
        category: "",
        subcategory: "",
        unitCost: undefined,
        unitTax: undefined,
        gstInclusive: false,
        markupPercent: undefined,
        totalCost: undefined,
        quantity: 1,
        unitType: "ea",
        url: "",
        visibleToClient: true,
        isSelectedByClient: false,
        sortOrder: 0,
      });
    }
  };

  const onOptionSubmit = (data: InsertSelectionOption) => {
    if (editingOption) {
      updateOptionMutation.mutate({ optionId: editingOption.id, data });
    } else {
      createOptionMutation.mutate({
        ...data,
        selectionId: id || "",
      });
    }
  };

  const handleEditOption = (option: SelectionOption) => {
    setEditingOption(option);
    setGstInclusive(option.gstInclusive || false);
    
    optionForm.reset({
      selectionId: option.selectionId,
      name: option.name,
      description: option.description || "",
      sku: option.sku || "",
      brand: option.brand || "",
      category: option.category || "",
      subcategory: option.subcategory || "",
      unitCost: option.unitCost || undefined,
      unitTax: option.unitTax || undefined,
      gstInclusive: option.gstInclusive || false,
      markupPercent: option.markupPercent || undefined,
      totalCost: option.totalCost || undefined,
      quantity: option.quantity,
      unitType: option.unitType,
      url: option.url || "",
      visibleToClient: option.visibleToClient,
      isSelectedByClient: option.isSelectedByClient,
      sortOrder: option.sortOrder,
    });
  };

  const handleAddOption = () => {
    setIsAddingOption(true);
    setEditingOption(null);
    setGstInclusive(false);
    optionForm.reset({
      selectionId: id || "",
      name: "",
      description: "",
      sku: "",
      brand: "",
      category: "",
      subcategory: "",
      unitCost: undefined,
      unitTax: undefined,
      gstInclusive: false,
      markupPercent: undefined,
      totalCost: undefined,
      quantity: 1,
      unitType: "ea",
      url: "",
      visibleToClient: true,
      isSelectedByClient: false,
      sortOrder: 0,
    });
  };

  const calculateGst = (unitCost: number | undefined, inclusive: boolean): number => {
    if (!unitCost || unitCost <= 0) return 0;
    const gstRate = 0.1;
    
    if (inclusive) {
      return Math.round((unitCost * gstRate) / (1 + gstRate));
    } else {
      return Math.round(unitCost * gstRate);
    }
  };

  const handleGstChange = (inclusive: boolean) => {
    setGstInclusive(inclusive);
    optionForm.setValue("gstInclusive", inclusive);
    const currentUnitCost = optionForm.getValues("unitCost");
    if (currentUnitCost) {
      const newTax = calculateGst(currentUnitCost, inclusive);
      optionForm.setValue("unitTax", newTax);
    }
  };

  const handleUnitCostChange = (value: number | undefined) => {
    if (value && gstInclusive) {
      const newTax = calculateGst(value, gstInclusive);
      optionForm.setValue("unitTax", newTax);
    } else if (!gstInclusive) {
      optionForm.setValue("unitTax", value ? calculateGst(value, false) : undefined);
    }
  };

  const filteredOptions = (selection?.options || []).filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveSelection = () => {
    const data = selectionForm.getValues();
    updateSelectionMutation.mutate(data);
  };


  const goBack = () => {
    if (effectiveProjectId) {
      setLocation(`/projects/${effectiveProjectId}/selections`);
    } else {
      setLocation("/selections");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selection) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Selection not found.</p>
          <Button 
            variant="outline" 
            onClick={goBack}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Selections
          </Button>
        </div>
      </div>
    );
  }

  const currentStatus = getStatusInfo(selection.status);
  const StatusIcon = currentStatus.icon;

  // Calculate selected price from options (ensure we have valid numbers)
  const selectedOption = selection.options?.find(opt => opt.isSelectedByClient);
  const selectedPrice = Number(selectedOption?.totalCost) || 0;
  const allowanceAmount = Number(selection.allowance) || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header Row 1 - Back + Title + Status + Financial Summary */}
      <div className="h-10 px-4 flex items-center justify-between border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">{selection.name}</h1>
            <Badge 
              variant="outline" 
              className={cn("text-xs capitalize px-2 py-0.5", currentStatus.bgClass, currentStatus.textClass)}
            >
              {currentStatus.name}
            </Badge>
          </div>
        </div>
        
        {/* Right side: Financial Summary */}
        <div className="flex items-center gap-6">
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
          )}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Allowance</div>
              <div className="text-sm font-semibold">${(allowanceAmount / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Selected price</div>
              <div className="text-sm font-semibold text-[#bba7db]">${(selectedPrice / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Header Row 2 - Tabs + Actions */}
      <div className="h-9 px-4 flex items-center justify-between border-b bg-background shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsList className="h-7 bg-transparent p-0 gap-1">
            <TabsTrigger 
              value="options" 
              className="h-6 px-3 text-xs data-[state=active]:bg-[#bba7db] data-[state=active]:text-white"
              data-testid="tab-options"
            >
              <Package className="w-3 h-3 mr-1" />
              Options ({selection.options?.length || 0})
            </TabsTrigger>
            <TabsTrigger 
              value="details" 
              className="h-6 px-3 text-xs data-[state=active]:bg-[#bba7db] data-[state=active]:text-white"
              data-testid="tab-details"
            >
              <Settings className="w-3 h-3 mr-1" />
              Details
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {activeTab === "options" && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex items-center border rounded-md">
                  <button
                    onClick={() => setOptionsView("table")}
                    className={cn(
                      "h-6 w-6 flex items-center justify-center rounded-l-md transition-colors",
                      optionsView === "table" ? "bg-[#bba7db] text-white" : "hover-elevate"
                    )}
                    data-testid="button-view-table"
                  >
                    <LayoutList className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setOptionsView("grid")}
                    className={cn(
                      "h-6 w-6 flex items-center justify-center rounded-r-md transition-colors",
                      optionsView === "grid" ? "bg-[#bba7db] text-white" : "hover-elevate"
                    )}
                    data-testid="button-view-grid"
                  >
                    <LayoutGrid className="w-3 h-3" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    placeholder="Search options..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-6 pl-7 w-[180px] text-xs"
                    data-testid="input-search-options"
                  />
                </div>
              </div>
              <Button 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={handleAddOption}
                data-testid="button-add-option"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Option
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "options" ? (
          <div className="p-4">
            {filteredOptions.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No options found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? "Try adjusting your search terms." : "Add your first option to get started."}
                </p>
                {!searchTerm && (
                  <Button onClick={handleAddOption} data-testid="button-add-first-option">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Option
                  </Button>
                )}
              </div>
            ) : optionsView === "table" ? (
              /* Table View */
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Image</th>
                      <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Option</th>
                      <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">SKU</th>
                      <th className="text-center px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Qty</th>
                      <th className="text-right px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Unit Price</th>
                      <th className="text-right px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Amount</th>
                      <th className="text-center px-3 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOptions.map((option, idx) => (
                      <tr 
                        key={option.id}
                        className={cn(
                          "border-b hover-elevate cursor-pointer",
                          idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                        )}
                        onClick={() => handleEditOption(option)}
                        data-testid={`row-option-${option.id}`}
                      >
                        <td className="px-3 py-2">
                          <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                            <Package className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{option.name}</span>
                            {option.brand && (
                              <span className="text-xs text-muted-foreground">{option.brand}</span>
                            )}
                            {option.productUrl && (
                              <a 
                                href={option.productUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View product
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-muted-foreground">{option.sku || "-"}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-sm">{option.quantity} {option.unitType}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-sm">${((option.unitCost || 0) / 100).toFixed(2)}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-sm font-semibold">${((option.totalCost || 0) / 100).toFixed(2)}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {option.isSelectedByClient ? (
                            <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Selected
                            </Badge>
                          ) : !option.visibleToClient ? (
                            <Badge variant="outline" className="text-xs bg-red-50 border-red-200 text-red-700">
                              <EyeOff className="w-3 h-3 mr-1" />
                              Hidden
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Eye className="w-3 h-3 mr-1" />
                              Visible
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6"
                                data-testid={`button-option-menu-${option.id}`}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditOption(option); }}>
                                <Edit3 className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); deleteOptionMutation.mutate(option.id); }}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Grid View */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOptions.map((option) => (
                  <Card key={option.id} className="hover-elevate transition-all duration-200 group" data-testid={`card-option-${option.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1 min-w-0">
                          <CardTitle className="text-base leading-tight font-semibold group-hover:text-primary transition-colors">
                            {option.name}
                          </CardTitle>
                          <div className="flex items-center gap-2 flex-wrap">
                            {option.brand && (
                              <Badge variant="secondary" className="text-xs">
                                {option.brand}
                              </Badge>
                            )}
                            {option.category && (
                              <Badge variant="outline" className="text-xs">
                                {option.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 shrink-0 opacity-60 group-hover:opacity-100"
                              data-testid={`button-option-menu-${option.id}`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditOption(option)}>
                              <Edit3 className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteOptionMutation.mutate(option.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      {option.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {option.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between border-t pt-3">
                        <div className="flex flex-col gap-0.5">
                          {option.sku && (
                            <span className="text-xs text-muted-foreground font-mono">
                              SKU: {option.sku}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Qty: {option.quantity} {option.unitType}
                          </span>
                        </div>
                        {option.totalCost != null && (
                          <div className="text-right">
                            <span className="text-lg font-semibold">
                              ${(option.totalCost / 100).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap">
                        {option.isSelectedByClient && (
                          <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Selected
                          </Badge>
                        )}
                        {!option.visibleToClient && (
                          <Badge variant="outline" className="text-xs bg-red-50 border-red-200 text-red-700">
                            <EyeOff className="w-3 h-3 mr-1" />
                            Hidden
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Details Tab */
          <div className="p-4 pb-20">
            <Form {...selectionForm}>
              <form className="space-y-6 max-w-3xl">
                {/* Basic Info Section - Buildern-style grid */}
                <Card>
                  <CardContent className="pt-6 space-y-5">
                    {/* Name - Full width */}
                    <FormField
                      control={selectionForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground uppercase tracking-wide">Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Kitchen Splashback Tiles"
                              {...field}
                              data-testid="input-selection-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Grid: Link to | Deadline */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground uppercase tracking-wide">Link to</FormLabel>
                        <Select disabled>
                          <SelectTrigger data-testid="select-link-to">
                            <SelectValue placeholder="Select task or schedule item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No linked item</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Link to a task or schedule item</p>
                      </FormItem>

                      <FormField
                        control={selectionForm.control}
                        name="deadline"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground uppercase tracking-wide">Deadline</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-deadline"
                                  >
                                    {field.value ? (
                                      format(new Date(field.value), "dd/MM/yyyy")
                                    ) : (
                                      <span>Select date</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value ? new Date(field.value) : undefined}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Grid: Category | Location */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={selectionForm.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground uppercase tracking-wide">Category</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-category">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {selectionCategories?.options?.map((opt) => (
                                  <SelectItem key={opt.key} value={opt.name}>
                                    {opt.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={selectionForm.control}
                        name="room"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground uppercase tracking-wide">Location</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-room">
                                  <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {locationCategories?.options?.map((opt) => (
                                  <SelectItem key={opt.key} value={opt.name}>
                                    {opt.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Description */}
                    <FormField
                      control={selectionForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground uppercase tracking-wide">Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Add notes about this selection..."
                              rows={3}
                              {...field}
                              value={field.value || ""}
                              data-testid="input-selection-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Pricing Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Pricing</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={selectionForm.control}
                      name="allowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground uppercase tracking-wide">Allowance</FormLabel>
                          <FormControl>
                            <div className="relative max-w-xs">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                              <Input 
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                className="pl-7"
                                value={field.value ? (field.value / 100).toFixed(2) : ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value ? Math.round(parseFloat(value) * 100) : undefined);
                                }}
                                data-testid="input-allowance"
                              />
                            </div>
                          </FormControl>
                          <FormDescription className="text-xs">
                            Budget allocated for this selection
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium">Pricing affects contract price</FormLabel>
                        <FormDescription className="text-xs">
                          Changes to this selection will update the contract value
                        </FormDescription>
                      </div>
                      <Switch
                        checked={true}
                        disabled
                        data-testid="switch-affects-contract"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Status Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={selectionForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {statusOptions.map((status) => {
                              const Icon = status.icon;
                              const isSelected = field.value === status.key;
                              return (
                                <button
                                  key={status.key}
                                  type="button"
                                  onClick={() => field.onChange(status.key)}
                                  className={cn(
                                    "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                                    isSelected 
                                      ? "bg-[#bba7db] text-white border-[#bba7db]" 
                                      : "hover-elevate border-border"
                                  )}
                                  data-testid={`status-${status.key}`}
                                >
                                  <Icon className="w-5 h-5" />
                                  <span className="text-sm font-medium">{status.name}</span>
                                  <span className={cn(
                                    "text-[10px] text-center",
                                    isSelected ? "text-white/80" : "text-muted-foreground"
                                  )}>
                                    {status.description}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Permissions Accordion */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Permissions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="multiple" defaultValue={["client"]} className="w-full">
                      {/* Client Permissions */}
                      <AccordionItem value="client" className="border-b">
                        <AccordionTrigger className="py-3 hover:no-underline" data-testid="accordion-client">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-[#bba7db]" />
                            <span className="text-sm font-medium">Client</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4 space-y-3">
                          <FormField
                            control={selectionForm.control}
                            name="clientCanChange"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-sm">Allow Changes</FormLabel>
                                  <FormDescription className="text-xs">
                                    Client can change their selection after choosing
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-client-can-change"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={selectionForm.control}
                            name="clientCanSeePrice"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-sm">Show Pricing</FormLabel>
                                  <FormDescription className="text-xs">
                                    Client can see pricing information for options
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-client-can-see-price"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </AccordionContent>
                      </AccordionItem>

                      {/* Vendors Permissions */}
                      <AccordionItem value="vendors" className="border-b">
                        <AccordionTrigger className="py-3 hover:no-underline" data-testid="accordion-vendors">
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-[#bba7db]" />
                            <span className="text-sm font-medium">Vendors</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4 space-y-3">
                          <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm">Can View Selection</FormLabel>
                              <FormDescription className="text-xs">
                                Vendors can see this selection and its options
                              </FormDescription>
                            </div>
                            <Switch checked={true} disabled data-testid="switch-vendor-view" />
                          </div>
                          <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm">Can Submit Options</FormLabel>
                              <FormDescription className="text-xs">
                                Vendors can submit new options for consideration
                              </FormDescription>
                            </div>
                            <Switch checked={false} disabled data-testid="switch-vendor-submit" />
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Installer Permissions */}
                      <AccordionItem value="installer" className="border-0">
                        <AccordionTrigger className="py-3 hover:no-underline" data-testid="accordion-installer">
                          <div className="flex items-center gap-2">
                            <HardHat className="w-4 h-4 text-[#bba7db]" />
                            <span className="text-sm font-medium">Installer</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pb-4 space-y-3">
                          <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm">Can View Final Selection</FormLabel>
                              <FormDescription className="text-xs">
                                Installer can see the approved selection details
                              </FormDescription>
                            </div>
                            <Switch checked={true} disabled data-testid="switch-installer-view" />
                          </div>
                          <div className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel className="text-sm">Notify on Approval</FormLabel>
                              <FormDescription className="text-xs">
                                Send notification when selection is approved
                              </FormDescription>
                            </div>
                            <Switch checked={true} disabled data-testid="switch-installer-notify" />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>

                {/* Comments Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Comments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Empty state */}
                      <div className="text-center py-6 text-muted-foreground">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No comments yet</p>
                        <p className="text-xs">Be the first to add a comment</p>
                      </div>
                      
                      {/* Comment input */}
                      <div className="flex items-start gap-2 pt-2 border-t">
                        <Textarea
                          placeholder="Add a comment..."
                          className="flex-1 min-h-[60px] text-sm"
                          data-testid="input-comment"
                        />
                        <Button size="icon" className="h-8 w-8" disabled data-testid="button-send-comment">
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </form>
            </Form>
          </div>
        )}
      </div>

      {/* Sticky Footer - Only show on Details tab */}
      {activeTab === "details" && (
        <div className="sticky bottom-0 left-0 right-0 bg-background border-t px-4 py-3 flex items-center justify-end gap-2 z-10">
          <Button
            variant="outline"
            onClick={goBack}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveSelection}
            disabled={updateSelectionMutation.isPending || !hasUnsavedChanges}
            data-testid="button-save-selection"
          >
            {updateSelectionMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      )}

      {/* Add/Edit Option Dialog */}
      <Dialog 
        open={isAddingOption || !!editingOption} 
        onOpenChange={handleDialogChange}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[95vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingOption ? "Edit Option" : "Add New Option"}
            </DialogTitle>
            <DialogDescription>
              {editingOption 
                ? "Update the option details below."
                : "Add a new option for clients to choose from."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <Form {...optionForm}>
              <form onSubmit={optionForm.handleSubmit(onOptionSubmit)} className="space-y-4 pr-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={optionForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Option Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Subway Tile White"
                            {...field}
                            data-testid="input-option-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={optionForm.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Concept Tile"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-option-brand"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={optionForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe this option..."
                          rows={2}
                          {...field}
                          value={field.value || ""}
                          data-testid="input-option-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={optionForm.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Product code"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-option-sku"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={optionForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <FormControl>
                          <Input 
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            data-testid="input-option-quantity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={optionForm.control}
                    name="unitType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Type</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="ea, m2, linear_m"
                            {...field}
                            data-testid="input-option-unit-type"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Pricing Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Pricing</h3>
                    <Select
                      value={gstInclusive ? "inc" : "ex"}
                      onValueChange={(value) => handleGstChange(value === "inc")}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="GST on expenses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ex">GST exclusive</SelectItem>
                        <SelectItem value="inc">GST inclusive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={optionForm.control}
                      name="unitCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit Cost</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                              <Input 
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                className="pl-10"
                                value={field.value ? (field.value / 100).toFixed(2) : ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const centValue = value ? Math.round(parseFloat(value) * 100) : undefined;
                                  field.onChange(centValue);
                                  handleUnitCostChange(centValue);
                                }}
                                data-testid="input-option-unit-cost"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={optionForm.control}
                      name="markupPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Markup %</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type="number"
                                placeholder="0"
                                min="0"
                                className="pr-8"
                                value={field.value || ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value ? parseInt(value) : undefined);
                                }}
                                data-testid="input-option-markup"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={optionForm.control}
                      name="totalCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Cost</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                              <Input 
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                className="pl-10"
                                value={field.value ? (field.value / 100).toFixed(2) : ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value ? Math.round(parseFloat(value) * 100) : undefined);
                                }}
                                data-testid="input-option-total-cost"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={optionForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product URL</FormLabel>
                      <FormControl>
                        <Input 
                          type="url"
                          placeholder="https://..."
                          {...field}
                          value={field.value || ""}
                          data-testid="input-option-url"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-end space-x-3 pt-4 mt-6 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => handleDialogChange(false)}
                    data-testid="button-cancel-option"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createOptionMutation.isPending || updateOptionMutation.isPending}
                    data-testid="button-save-option"
                  >
                    {(createOptionMutation.isPending || updateOptionMutation.isPending) && (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    )}
                    {editingOption ? "Update Option" : "Add Option"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
