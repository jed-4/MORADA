import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProject } from "@/contexts/ProjectContext";
import { 
  insertSelectionSchema, 
  type Selection, 
  type InsertSelection
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
  Package,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Settings,
  CheckCircle,
  Clock,
  AlertCircle,
  CalendarIcon,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Selections() {
  const [isAddingSelection, setIsAddingSelection] = useState(false);
  const [editingSelection, setEditingSelection] = useState<Selection | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { currentProject } = useProject();

  // Fetch selections for the current project
  const { data: selections = [], isLoading } = useQuery<Selection[]>({
    queryKey: ["/api/selections", currentProject?.id],
    enabled: !!currentProject?.id,
  });

  // Create selection mutation
  const createSelectionMutation = useMutation({
    mutationFn: async (selection: InsertSelection) => {
      const response = await apiRequest("POST", "/api/selections", selection);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", currentProject?.id] });
      setIsAddingSelection(false);
      toast({
        title: "Selection created",
        description: "Your new selection has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update selection mutation
  const updateSelectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSelection> }) => {
      const response = await apiRequest("PATCH", `/api/selections/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", currentProject?.id] });
      setEditingSelection(null);
      toast({
        title: "Selection updated",
        description: "Your selection has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete selection mutation
  const deleteSelectionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/selections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", currentProject?.id] });
      toast({
        title: "Selection deleted",
        description: "The selection has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Form for creating/editing selections
  const form = useForm<InsertSelection>({
    resolver: zodResolver(insertSelectionSchema),
    defaultValues: {
      projectId: currentProject?.id || "",
      name: "",
      description: "",
      category: "",
      room: "",
      status: "draft",
      deadline: undefined,
      allowance: undefined,
      clientCanChange: true,
      clientCanSeePrice: false,
    },
  });

  // Reset form when dialog opens/closes
  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setIsAddingSelection(false);
      setEditingSelection(null);
      form.reset();
    }
  };

  // Handle form submission
  const onSubmit = (data: InsertSelection) => {
    if (editingSelection) {
      updateSelectionMutation.mutate({ id: editingSelection.id, data });
    } else {
      createSelectionMutation.mutate({
        ...data,
        projectId: currentProject?.id || "",
      });
    }
  };

  // Handle editing
  const handleEdit = (selection: Selection) => {
    setEditingSelection(selection);
    form.reset({
      name: selection.name,
      description: selection.description || "",
      category: selection.category || "",
      room: selection.room || "",
      status: selection.status,
      deadline: selection.deadline || undefined,
      allowance: selection.allowance || undefined,
      clientCanChange: selection.clientCanChange,
      clientCanSeePrice: selection.clientCanSeePrice,
    });
  };

  // Filter selections based on search
  const filteredSelections = (selections || []).filter((selection: Selection) =>
    selection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    selection.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    selection.category?.toLowerCase().includes(searchTerm.toLowerCase())
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

  if (!currentProject) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Please select a project to view selections.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Selections</h1>
          <p className="text-muted-foreground mt-1">
            Manage product selections and allowances for {currentProject.name}
          </p>
        </div>
        <Button 
          onClick={() => setIsAddingSelection(true)}
          data-testid="button-add-selection"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Selection
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search selections..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="input-search-selections"
        />
      </div>

      {/* Selections Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-3 bg-muted rounded w-full mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredSelections.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">No selections found</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm ? "Try adjusting your search terms." : "Create your first selection to get started."}
          </p>
          {!searchTerm && (
            <Button onClick={() => setIsAddingSelection(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Selection
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSelections.map((selection) => (
            <Card key={selection.id} className="hover-elevate" data-testid={`card-selection-${selection.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="text-lg leading-tight">{selection.name}</CardTitle>
                    {selection.category && (
                      <Badge variant="secondary" className="text-xs">
                        {selection.category}
                      </Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 shrink-0"
                        data-testid={`button-selection-menu-${selection.id}`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(selection)}>
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deleteSelectionMutation.mutate(selection.id)}
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
                {selection.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {selection.description}
                  </p>
                )}
                
                <div className="flex items-center justify-between">
                  <StatusBadge status={selection.status} />
                  {!selection.clientCanChange && (
                    <Badge variant="outline" className="text-xs">
                      Fixed
                    </Badge>
                  )}
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Created {format(new Date(selection.createdAt), "MMM d, yyyy")}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Selection Dialog */}
      <Dialog 
        open={isAddingSelection || !!editingSelection} 
        onOpenChange={handleDialogChange}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingSelection ? "Edit Selection" : "Create New Selection"}
            </DialogTitle>
            <DialogDescription>
              {editingSelection 
                ? "Update the selection details below."
                : "Create a new selection for your project. You can add options and details later."
              }
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selection Name</FormLabel>
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

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Kitchen, Bathroom, Flooring"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-selection-category"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="room"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room/Location</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Master Bathroom, Kitchen, Living Room"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-selection-room"
                      />
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe what this selection is for..."
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-selection-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Decision Deadline</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-selection-deadline"
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date(new Date().setHours(0, 0, 0, 0))
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When does the client need to make their selection?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="allowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Allowance</FormLabel>
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
                          data-testid="input-selection-allowance"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Budget allocated for this selection (in AUD)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 rounded-lg border p-4">
                <h4 className="font-medium">Client Permissions</h4>
                
                <FormField
                  control={form.control}
                  name="clientCanChange"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Allow Changes
                        </FormLabel>
                        <FormDescription>
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
                  control={form.control}
                  name="clientCanSeePrice"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Show Pricing
                        </FormLabel>
                        <FormDescription>
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
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleDialogChange(false)}
                  data-testid="button-cancel-selection"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createSelectionMutation.isPending || updateSelectionMutation.isPending}
                  data-testid="button-save-selection"
                >
                  {(createSelectionMutation.isPending || updateSelectionMutation.isPending) && (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  )}
                  {editingSelection ? "Update Selection" : "Create Selection"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}