import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  insertCustomFieldDefSchema, 
  insertCustomFieldOptionSchema,
  type CustomFieldDef, 
  type InsertCustomFieldDef,
  type CustomFieldOption,
  type InsertCustomFieldOption
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Settings as SettingsIcon,
  Plus,
  MoreVertical,
  Edit3,
  Trash2,
  Type,
  List,
  Palette,
} from "lucide-react";
import { z } from "zod";

export default function Settings() {
  const [isAddingField, setIsAddingField] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [managingOptions, setManagingOptions] = useState<CustomFieldDef | null>(null);
  const [isAddingOption, setIsAddingOption] = useState(false);
  const { toast } = useToast();

  // Form for custom field definitions
  const fieldForm = useForm<z.infer<typeof insertCustomFieldDefSchema>>({
    resolver: zodResolver(insertCustomFieldDefSchema),
    defaultValues: {
      key: "",
      label: "",
      type: "text",
      required: false,
    },
  });

  // Form for custom field options
  const optionForm = useForm<z.infer<typeof insertCustomFieldOptionSchema>>({
    resolver: zodResolver(insertCustomFieldOptionSchema),
    defaultValues: {
      fieldDefId: "",
      value: "",
      label: "",
      color: "#000000",
    },
  });

  // Fetch custom field definitions
  const { data: customFieldDefs = [], isLoading } = useQuery<CustomFieldDef[]>({
    queryKey: ["/api/custom-field-defs"],
  });

  // Fetch options for a specific field
  const { data: fieldOptions = {} } = useQuery<Record<string, CustomFieldOption[]>>({
    queryKey: ["/api/custom-field-options", customFieldDefs.map(f => f.id)],
    queryFn: async () => {
      const selectFields = customFieldDefs.filter(field => field.type === "select");
      if (selectFields.length === 0) return {};
      
      const optionsMap: Record<string, CustomFieldOption[]> = {};
      
      for (const field of selectFields) {
        const response = await fetch(`/api/custom-field-defs/${field.id}/options`);
        const options = await response.json();
        optionsMap[field.id] = options;
      }
      
      return optionsMap;
    },
    enabled: customFieldDefs.length > 0,
  });

  // Mutations for custom field definitions
  const createFieldMutation = useMutation({
    mutationFn: async (data: InsertCustomFieldDef) => {
      const response = await apiRequest("POST", "/api/custom-field-defs", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-defs"] });
      toast({ title: "Custom field created successfully" });
      setIsAddingField(false);
      fieldForm.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to create custom field", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCustomFieldDef> }) => {
      const response = await apiRequest("PATCH", `/api/custom-field-defs/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-defs"] });
      toast({ title: "Custom field updated successfully" });
      setEditingField(null);
      fieldForm.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update custom field", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/custom-field-defs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-defs"] });
      toast({ title: "Custom field deleted successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to delete custom field", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Mutations for custom field options
  const createOptionMutation = useMutation({
    mutationFn: async (data: InsertCustomFieldOption) => {
      const response = await apiRequest("POST", "/api/custom-field-options", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-options"] });
      toast({ title: "Option created successfully" });
      setIsAddingOption(false);
      optionForm.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to create option", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/custom-field-options/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-options"] });
      toast({ title: "Option deleted successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to delete option", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onSubmitField = (data: z.infer<typeof insertCustomFieldDefSchema>) => {
    if (editingField) {
      updateFieldMutation.mutate({ id: editingField.id, data });
    } else {
      createFieldMutation.mutate(data);
    }
  };

  const onSubmitOption = (data: z.infer<typeof insertCustomFieldOptionSchema>) => {
    if (managingOptions) {
      createOptionMutation.mutate({
        ...data,
        fieldDefId: managingOptions.id,
      });
    }
  };

  const handleEditField = (field: CustomFieldDef) => {
    setEditingField(field);
    fieldForm.reset({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
    });
  };

  const handleDeleteField = (fieldId: string) => {
    deleteFieldMutation.mutate(fieldId);
  };

  const handleManageOptions = (field: CustomFieldDef) => {
    setManagingOptions(field);
    optionForm.reset({
      fieldDefId: field.id,
      value: "",
      label: "",
      color: "#3b82f6",
    });
  };

  const handleDeleteOption = (optionId: string) => {
    deleteOptionMutation.mutate(optionId);
  };

  const FieldDialog = ({ isEditing }: { isEditing: boolean }) => (
    <Dialog open={isAddingField || !!editingField} onOpenChange={(open) => {
      if (!open) {
        setIsAddingField(false);
        setEditingField(null);
        fieldForm.reset();
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Custom Field" : "Add Custom Field"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Make changes to your custom field here."
              : `Create a new custom field for notes. You can have up to 4 custom fields.`
            }
          </DialogDescription>
        </DialogHeader>
        <Form {...fieldForm}>
          <form onSubmit={fieldForm.handleSubmit(onSubmitField)} className="space-y-4">
            <FormField
              control={fieldForm.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field Key</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., status, priority, department"
                      {...field}
                      data-testid="field-key-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={fieldForm.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Status, Priority, Department"
                      {...field}
                      data-testid="field-label-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={fieldForm.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Field Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="field-type-select">
                        <SelectValue placeholder="Select field type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="select">Select (Dropdown)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={fieldForm.control}
              name="required"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="field-required-checkbox"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Required Field</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      This field must be filled when creating notes
                    </p>
                  </div>
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setIsAddingField(false);
                setEditingField(null);
                fieldForm.reset();
              }}>
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createFieldMutation.isPending || updateFieldMutation.isPending}
                data-testid="field-save-button"
              >
                {createFieldMutation.isPending || updateFieldMutation.isPending ? 
                  (isEditing ? "Updating..." : "Creating...") :
                  (isEditing ? "Update Field" : "Create Field")
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );

  const OptionsDialog = () => (
    <Dialog open={!!managingOptions} onOpenChange={(open) => {
      if (!open) {
        setManagingOptions(null);
        setIsAddingOption(false);
        optionForm.reset();
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Manage Options: {managingOptions?.label}
          </DialogTitle>
          <DialogDescription>
            Add and manage dropdown options for this select field. Each option can have a custom color.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Existing Options */}
          <div>
            <h4 className="font-medium mb-3">Current Options</h4>
            <div className="space-y-2">
              {managingOptions && fieldOptions[managingOptions.id]?.map((option) => (
                <div key={option.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: option.color || "#000000" }}
                    />
                    <span className="font-medium">{option.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {option.value}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteOption(option.id)}
                    data-testid={`delete-option-${option.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {managingOptions && (!fieldOptions[managingOptions.id] || fieldOptions[managingOptions.id]?.length === 0) && (
                <p className="text-muted-foreground text-sm">No options yet. Add some below.</p>
              )}
            </div>
          </div>
          
          {/* Add New Option */}
          <div>
            <h4 className="font-medium mb-3">Add New Option</h4>
            <Form {...optionForm}>
              <form onSubmit={optionForm.handleSubmit(onSubmitOption)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={optionForm.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Value</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., high, medium, low"
                            {...field}
                            data-testid="option-value-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={optionForm.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Label</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., High Priority"
                            {...field}
                            data-testid="option-label-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={optionForm.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            {...field}
                            value={field.value || "#3b82f6"}
                            className="w-16 h-10"
                            data-testid="option-color-input"
                          />
                          <Input
                            placeholder="#3b82f6"
                            {...field}
                            value={field.value || ""}
                            className="flex-1"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit"
                  disabled={createOptionMutation.isPending}
                  data-testid="option-save-button"
                >
                  {createOptionMutation.isPending ? "Adding..." : "Add Option"}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="p-6 space-y-6" data-testid="settings-page">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">
              Manage your notes configuration and custom fields
            </p>
          </div>
        </div>
      </div>

      {/* Notes Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Notes Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Custom Fields Management */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium">Custom Fields</h3>
                <p className="text-sm text-muted-foreground">
                  Add up to 4 custom fields to capture additional information in your notes
                </p>
              </div>
              <Button 
                onClick={() => setIsAddingField(true)} 
                disabled={customFieldDefs.length >= 4}
                data-testid="add-custom-field-button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Field {customFieldDefs.length >= 4 && "(Max 4)"}
              </Button>
            </div>
            
            {/* Custom Fields List */}
            {isLoading ? (
              <div className="text-center py-4">
                <div className="text-muted-foreground">Loading custom fields...</div>
              </div>
            ) : customFieldDefs.length === 0 ? (
              <Card className="p-6 text-center">
                <Type className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <h4 className="font-medium mb-1">No custom fields yet</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Add custom fields to capture specific information in your notes
                </p>
                <Button onClick={() => setIsAddingField(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Field
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {customFieldDefs.map((field) => (
                  <Card key={field.id} data-testid={`custom-field-${field.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{field.label}</h4>
                            <Badge variant="outline" className="text-xs">
                              {field.key}
                            </Badge>
                            {field.required && (
                              <Badge variant="secondary" className="text-xs">
                                Required
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {field.type === "text" ? (
                              <Type className="h-4 w-4" />
                            ) : (
                              <List className="h-4 w-4" />
                            )}
                            <span className="capitalize">{field.type}</span>
                            {field.type === "select" && fieldOptions[field.id] && (
                              <span>({fieldOptions[field.id].length} options)</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {field.type === "select" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleManageOptions(field)}
                              data-testid={`manage-options-${field.id}`}
                            >
                              <Palette className="h-4 w-4 mr-2" />
                              Options
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`field-menu-${field.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditField(field)}>
                                <Edit3 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteField(field.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <FieldDialog isEditing={!!editingField} />
      <OptionsDialog />
    </div>
  );
}