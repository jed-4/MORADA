import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  insertSelectionOptionSchema, 
  type SelectionWithOptions,
  type SelectionOption,
  type InsertSelectionOption
} from "@shared/schema";
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
} from "lucide-react";
import { format } from "date-fns";

export default function SelectionDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [editingOption, setEditingOption] = useState<SelectionOption | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // Fetch selection with options
  const { data: selection, isLoading } = useQuery<SelectionWithOptions>({
    queryKey: ["/api/selections", id],
    enabled: !!id,
  });

  // Create option mutation
  const createOptionMutation = useMutation({
    mutationFn: async (option: InsertSelectionOption) => {
      const response = await apiRequest("POST", `/api/selections/${id}/options`, option);
      return response.json();
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

  // Update option mutation
  const updateOptionMutation = useMutation({
    mutationFn: async ({ optionId, data }: { optionId: string; data: Partial<InsertSelectionOption> }) => {
      const response = await apiRequest("PATCH", `/api/selection-options/${optionId}`, data);
      return response.json();
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

  // Delete option mutation
  const deleteOptionMutation = useMutation({
    mutationFn: async (optionId: string) => {
      await apiRequest("DELETE", `/api/selection-options/${optionId}`);
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

  // Form for creating/editing options
  const form = useForm<InsertSelectionOption>({
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

  // Handle dialog changes
  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setIsAddingOption(false);
      setEditingOption(null);
      form.reset();
    }
  };

  // Handle form submission
  const onSubmit = (data: InsertSelectionOption) => {
    if (editingOption) {
      updateOptionMutation.mutate({ optionId: editingOption.id, data });
    } else {
      createOptionMutation.mutate({
        ...data,
        selectionId: id || "",
      });
    }
  };

  // Handle editing
  const handleEdit = (option: SelectionOption) => {
    setEditingOption(option);
    form.reset({
      name: option.name,
      description: option.description || "",
      sku: option.sku || "",
      brand: option.brand || "",
      category: option.category || "",
      subcategory: option.subcategory || "",
      unitCost: option.unitCost || undefined,
      unitTax: option.unitTax || undefined,
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

  // Filter options based on search
  const filteredOptions = (selection?.options || []).filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      draft: { icon: Clock, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
      pending: { icon: AlertCircle, color: "text-blue-600 bg-blue-50 border-blue-200" },
      approved: { icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
      completed: { icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
    };
    
    const { icon: Icon, color } = config[status as keyof typeof config] || config.draft;
    
    return (
      <Badge variant="outline" className={`${color} capitalize`}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/2"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
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
            onClick={() => setLocation("/selections")}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Selections
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setLocation("/selections")}
            data-testid="button-back-to-selections"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{selection.name}</h1>
            <p className="text-muted-foreground mt-1">
              Manage options for this selection
            </p>
          </div>
        </div>
        <Button 
          onClick={() => setIsAddingOption(true)}
          data-testid="button-add-option"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Option
        </Button>
      </div>

      {/* Selection Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="flex items-center space-x-2">
                <StatusBadge status={selection.status} />
                {selection.category && (
                  <Badge variant="secondary">{selection.category}</Badge>
                )}
                {!selection.clientCanChange && (
                  <Badge variant="outline" className="text-xs">Fixed</Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selection.description && (
            <p className="text-muted-foreground">{selection.description}</p>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {selection.room && (
              <div className="flex items-center space-x-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Room:</span>
                <span>{selection.room}</span>
              </div>
            )}
            
            {selection.deadline && (
              <div className="flex items-center space-x-2 text-sm">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Deadline:</span>
                <span>{format(new Date(selection.deadline), "MMM d, yyyy")}</span>
              </div>
            )}
            
            {selection.allowance && (
              <div className="flex items-center space-x-2 text-sm">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Budget:</span>
                <span>${(selection.allowance / 100).toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex items-center space-x-2 text-sm">
              <Package className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Options:</span>
              <span>{selection.options?.length || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Options Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Selection Options</h2>
          
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search options..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-options"
            />
          </div>
        </div>

        {/* Options Grid */}
        {filteredOptions.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No options found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? "Try adjusting your search terms." : "Add your first option to get started."}
            </p>
            {!searchTerm && (
              <Button onClick={() => setIsAddingOption(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Option
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOptions.map((option) => (
              <Card key={option.id} className="hover-elevate" data-testid={`card-option-${option.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-lg leading-tight">{option.name}</CardTitle>
                      {option.brand && (
                        <Badge variant="secondary" className="text-xs">
                          {option.brand}
                        </Badge>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 shrink-0"
                          data-testid={`button-option-menu-${option.id}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(option)}>
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
                  
                  <div className="flex items-center justify-between text-sm">
                    {option.sku && (
                      <span className="text-muted-foreground">SKU: {option.sku}</span>
                    )}
                    {option.totalCost && (
                      <span className="font-medium">${(option.totalCost / 100).toFixed(2)}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {option.isSelectedByClient && (
                      <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-600">
                        Selected
                      </Badge>
                    )}
                    {!option.visibleToClient && (
                      <Badge variant="outline" className="text-xs bg-red-50 border-red-200 text-red-600">
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

      {/* Add/Edit Option Dialog */}
      <Dialog 
        open={isAddingOption || !!editingOption} 
        onOpenChange={handleDialogChange}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
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

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
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
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Concept Tile & Timber"
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
                control={form.control}
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
                  control={form.control}
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
                  control={form.control}
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
                  control={form.control}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="unitCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Cost</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                          <Input 
                            type="number"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="pl-10"
                            {...field}
                            value={field.value ? (field.value / 100).toFixed(2) : ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value ? Math.round(parseFloat(value) * 100) : undefined);
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
                  control={form.control}
                  name="totalCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Cost</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                          <Input 
                            type="number"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="pl-10"
                            {...field}
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

              <div className="flex items-center justify-end space-x-3 pt-4">
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
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  )}
                  {editingOption ? "Update Option" : "Add Option"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}