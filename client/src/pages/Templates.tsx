import { useState, useEffect } from "react";
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
  insertNoteTemplateSchema, 
  type NoteTemplate, 
  type InsertNoteTemplate,
  type CustomFieldDef
} from "@shared/schema";
import { RichTextEditor } from "@/components/RichTextEditor";
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
  FileText,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Eye,
  Settings,
} from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

// Create dynamic form schema for template custom fields
const createTemplateFormSchema = (customFields: CustomFieldDef[]) => {
  const defaultCustomFieldsSchema: Record<string, any> = {};
  
  customFields.forEach(field => {
    if (field.type === "select") {
      defaultCustomFieldsSchema[field.key] = z.string().optional();
    } else {
      defaultCustomFieldsSchema[field.key] = z.string().optional();
    }
  });

  return insertNoteTemplateSchema.extend({
    defaultCustomFields: z.object(defaultCustomFieldsSchema).optional(),
  });
};

export default function Templates() {
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NoteTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<NoteTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // Fetch custom field definitions for template defaults
  const { data: customFieldDefs = [] } = useQuery<CustomFieldDef[]>({
    queryKey: ["/api/custom-field-defs"],
  });

  // Create dynamic form schema
  const templateFormSchema = createTemplateFormSchema(customFieldDefs);
  type TemplateFormData = z.infer<typeof templateFormSchema>;

  // Form handling
  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      defaultTitle: "",
      contentHtml: "",
      contentText: "",
      defaultCustomFields: customFieldDefs.reduce((acc, field) => {
        acc[field.key] = "";
        return acc;
      }, {} as Record<string, any>),
    },
  });

  // Update form when customFieldDefs change
  useEffect(() => {
    if (customFieldDefs.length > 0) {
      const updatedDefaultCustomFields = customFieldDefs.reduce((acc, field) => {
        acc[field.key] = "";
        return acc;
      }, {} as Record<string, any>);
      
      form.reset({
        name: "",
        description: "",
        defaultTitle: "",
        contentHtml: "",
        contentText: "",
        defaultCustomFields: updatedDefaultCustomFields,
      });
    }
  }, [customFieldDefs, form]);

  // React Query hooks
  const { data: templates = [], isLoading } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates"],
    select: (data: any[]) => data.map(template => ({
      ...template,
      createdAt: new Date(template.createdAt),
      updatedAt: new Date(template.updatedAt),
    })),
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: InsertNoteTemplate) => {
      const response = await apiRequest("POST", "/api/note-templates", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
      toast({ title: "Template created successfully" });
      setIsAddingTemplate(false);
      form.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to create template", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertNoteTemplate> }) => {
      const response = await apiRequest("PATCH", `/api/note-templates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
      toast({ title: "Template updated successfully" });
      setEditingTemplate(null);
      form.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update template", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/note-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-templates"] });
      toast({ title: "Template deleted successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to delete template", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const filteredTemplates = templates.filter(template => {
    const searchableContent = [
      template.name,
      template.description || "",
      template.defaultTitle || "",
      template.contentText || "",
    ].join(" ").toLowerCase();
    
    return searchableContent.includes(searchTerm.toLowerCase());
  });

  const onSubmit = (data: TemplateFormData) => {
    const templateData: InsertNoteTemplate = {
      name: data.name,
      description: data.description,
      defaultTitle: data.defaultTitle,
      contentHtml: data.contentHtml,
      contentText: data.contentText,
      defaultCustomFields: data.defaultCustomFields || {},
    };
    
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateData });
    } else {
      createTemplateMutation.mutate(templateData);
    }
  };

  const handleEditTemplate = (template: NoteTemplate) => {
    setEditingTemplate(template);
    form.reset({
      name: template.name,
      description: template.description || "",
      defaultTitle: template.defaultTitle || "",
      contentHtml: template.contentHtml || "",
      contentText: template.contentText || "",
      defaultCustomFields: template.defaultCustomFields || {},
    });
  };

  const handleDeleteTemplate = (templateId: string) => {
    deleteTemplateMutation.mutate(templateId);
  };

  const TemplateDialog = ({ isEditing }: { isEditing: boolean }) => (
    <Dialog open={isAddingTemplate || !!editingTemplate} onOpenChange={(open) => {
      if (!open) {
        setIsAddingTemplate(false);
        setEditingTemplate(null);
        form.reset();
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Template" : "Add New Template"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Make changes to your template here. Click save when you're done."
              : "Create a new note template with default content and custom field values."
            }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter template name..."
                        {...field}
                        data-testid="template-name-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="defaultTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Note Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Default title for notes..."
                        {...field}
                        value={field.value || ""}
                        data-testid="template-title-input"
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
                    <Input
                      placeholder="Describe this template..."
                      {...field}
                      value={field.value || ""}
                      data-testid="template-description-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Default Custom Fields */}
            {customFieldDefs.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Default Custom Field Values</h4>
                <div className="grid grid-cols-2 gap-4">
                  {customFieldDefs.map((fieldDef) => (
                    <FormField
                      key={fieldDef.id}
                      control={form.control}
                      name={`defaultCustomFields.${fieldDef.key}` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{fieldDef.label}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={`Default ${fieldDef.label.toLowerCase()}...`}
                              {...field}
                              data-testid={`template-${fieldDef.key}-input`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
            
            <FormField
              control={form.control}
              name="contentHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Content</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      content={field.value || ""}
                      onChange={(html, text) => {
                        field.onChange(html);
                        form.setValue("contentText", text);
                      }}
                      placeholder="Enter default content for notes created from this template..."
                      data-testid="template-content-editor"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setIsAddingTemplate(false);
                setEditingTemplate(null);
                form.reset();
              }}>
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                data-testid="template-save-button"
              >
                {createTemplateMutation.isPending || updateTemplateMutation.isPending ? 
                  (isEditing ? "Updating..." : "Creating...") :
                  (isEditing ? "Update Template" : "Create Template")
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );

  const PreviewDialog = () => (
    <Dialog open={!!previewTemplate} onOpenChange={(open) => {
      if (!open) {
        setPreviewTemplate(null);
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Template Preview: {previewTemplate?.name}</DialogTitle>
          <DialogDescription>
            Preview of what notes created from this template will look like
          </DialogDescription>
        </DialogHeader>
        {previewTemplate && (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Default Title</h4>
              <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                {previewTemplate.defaultTitle || "No default title"}
              </p>
            </div>
            
            {Object.keys(previewTemplate.defaultCustomFields || {}).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Default Custom Fields</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(previewTemplate.defaultCustomFields || {}).map(([key, value]) => {
                    const fieldDef = customFieldDefs.find(f => f.key === key);
                    return (
                      <div key={key} className="bg-muted p-2 rounded">
                        <div className="text-xs font-medium">{fieldDef?.label || key}</div>
                        <div className="text-sm">{String(value) || "Not set"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            <div>
              <h4 className="font-medium mb-2">Default Content</h4>
              <div className="bg-muted p-3 rounded min-h-24 text-sm">
                {previewTemplate.contentText || "No default content"}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="p-6 space-y-6" data-testid="templates-page">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Note Templates</h1>
            <p className="text-muted-foreground">
              Create and manage templates to quickly generate notes with predefined content and fields
            </p>
          </div>
          <Button onClick={() => setIsAddingTemplate(true)} data-testid="add-template-button">
            <Plus className="h-4 w-4 mr-2" />
            Add Template
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="templates-search-input"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredTemplates.length}</div>
            <p className="text-xs text-muted-foreground">
              {templates.length !== filteredTemplates.length && `of ${templates.length} total`}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Custom Fields</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customFieldDefs.length}</div>
            <p className="text-xs text-muted-foreground">Available for templates</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredTemplates.filter(template => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return template.createdAt >= weekAgo;
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">Created this week</p>
          </CardContent>
        </Card>
      </div>

      {/* Templates Display */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="text-muted-foreground">Loading templates...</div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {searchTerm ? "No templates found" : "No templates yet"}
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm 
              ? "Try adjusting your search criteria"
              : "Create your first template to get started"
            }
          </p>
          {!searchTerm && (
            <Button onClick={() => setIsAddingTemplate(true)} data-testid="add-first-template-button">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <Card 
              key={template.id} 
              className="hover-elevate"
              data-testid={`template-card-${template.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base line-clamp-2 mb-2">
                      {template.name}
                    </CardTitle>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {template.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {template.defaultTitle && (
                        <Badge variant="secondary" className="text-xs">
                          Default Title
                        </Badge>
                      )}
                      {Object.keys(template.defaultCustomFields || {}).length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {Object.keys(template.defaultCustomFields || {}).length} fields
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
                      <DropdownMenuItem onClick={() => setPreviewTemplate(template)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {template.contentText && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {template.contentText}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created {format(template.createdAt, "MMM d, yyyy")}</span>
                    <span>{format(template.updatedAt, "h:mm a")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog isEditing={!!editingTemplate} />
      <PreviewDialog />
    </div>
  );
}