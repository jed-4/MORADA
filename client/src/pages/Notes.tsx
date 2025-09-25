import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProject } from "@/contexts/ProjectContext";
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
  insertNoteSchema, 
  type Note, 
  type InsertNote,
  type CustomFieldDef,
  type CustomFieldOption,
  type NoteTemplate
} from "@shared/schema";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Filter,
  Calendar,
  User,
  FileText as FileTemplate,
  Settings,
} from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

// Create dynamic form schema based on custom fields
const createNoteFormSchema = (customFields: CustomFieldDef[]) => {
  const customFieldsSchema: Record<string, z.ZodTypeAny> = {};
  
  customFields.forEach(field => {
    if (field.type === "select") {
      customFieldsSchema[field.key] = field.required ? z.string().min(1, "This field is required") : z.string().optional();
    } else {
      customFieldsSchema[field.key] = field.required ? z.string().min(1, "This field is required") : z.string().optional();
    }
  });

  return z.object({
    title: z.string().min(1, "Title is required"),
    content: z.string(),
    contentHtml: z.string().optional(),
    contentText: z.string().optional(),
    author: z.string(),
    ownerId: z.string().optional(),
    ownerName: z.string().optional(),
    projectId: z.string().optional(),
    customFields: z.object(customFieldsSchema).optional(),
    templateId: z.string().optional(),
  });
};

export default function Notes() {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedField, setSelectedField] = useState("All");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const { toast } = useToast();
  const { currentProject } = useProject();

  // Fetch custom field definitions and templates
  const { data: customFieldDefs = [], isLoading: isLoadingFields } = useQuery<CustomFieldDef[]>({
    queryKey: ["/api/custom-field-defs"],
  });

  const { data: noteTemplates = [], isLoading: isLoadingTemplates } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates"],
  });

  // Fetch custom field options for select fields
  const { data: customFieldOptions = {} } = useQuery<Record<string, CustomFieldOption[]>>({
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

  // Create dynamic form schema based on custom fields
  const noteFormSchema = createNoteFormSchema(customFieldDefs);
  
  // Use proper z.infer type
  type NoteFormData = z.infer<typeof noteFormSchema>;

  // Form handling - declare form after schema is available
  const form = useForm<NoteFormData>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      title: "",
      content: "",
      contentHtml: "",
      contentText: "",
      author: "Current User", // todo: get from auth context
      ownerId: undefined,
      ownerName: "Current User",
      customFields: customFieldDefs.reduce((acc, field) => {
        acc[field.key] = "";
        return acc;
      }, {} as Record<string, string>),
    },
  });

  // React Query hooks - fetch notes filtered by current project
  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/notes?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    select: (data: any[]) => data.map(note => ({
      ...note,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    })),
    enabled: !!currentProject?.id,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: InsertNote) => {
      const response = await apiRequest("POST", "/api/notes", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", currentProject?.id] });
      toast({ title: "Note created successfully" });
      setIsAddingNote(false);
      form.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to create note", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertNote> }) => {
      const response = await apiRequest("PATCH", `/api/notes/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", currentProject?.id] });
      toast({ title: "Note updated successfully" });
      setEditingNote(null);
      form.reset();
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update note", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({ title: "Note deleted successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to delete note", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });


  const filteredNotes = notes.filter(note => {
    const searchableContent = [
      note.title,
      note.content,
      note.contentText || "",
      note.author,
      note.ownerName || "",
      ...Object.values(note.customFields || {}),
    ].join(" ").toLowerCase();
    
    const matchesSearch = searchableContent.includes(searchTerm.toLowerCase());
    
    // Filter by category
    const matchesCategory = selectedCategory === "All" || note.category === selectedCategory;
    
    // Filter by custom fields if a specific field value is selected
    const matchesField = selectedField === "All" || 
      Object.values(note.customFields || {}).some(value => 
        String(value).toLowerCase().includes(selectedField.toLowerCase())
      ) ||
      // Legacy support for category field
      note.category === selectedField ||
      note.priority === selectedField;
      
    return matchesSearch && matchesCategory && matchesField;
  });

  const onSubmit = (data: NoteFormData) => {
    // Transform form data to include rich text fields and custom fields
    const noteData = {
      title: data.title || "",
      content: data.contentText || data.content || "",
      contentHtml: data.contentHtml || undefined,
      contentText: data.contentText || undefined,
      author: data.author || "Current User",
      ownerId: data.ownerId || undefined,
      ownerName: data.ownerName || undefined,
      projectId: data.projectId || undefined,
      customFields: data.customFields || {},
      // Legacy fields for backward compatibility
      category: (data.customFields as Record<string, string>)?.category || "General",
      priority: (data.customFields as Record<string, string>)?.priority || "medium",
    } as InsertNote;
    
    if (editingNote) {
      updateNoteMutation.mutate({ id: editingNote.id, data: noteData });
    } else {
      createNoteMutation.mutate(noteData);
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    form.reset({
      title: note.title,
      content: note.content,
      contentHtml: note.contentHtml || "",
      contentText: note.contentText || "",
      author: note.author,
      ownerId: note.ownerId || undefined,
      ownerName: note.ownerName || undefined,
      projectId: note.projectId || undefined,
      customFields: note.customFields as Record<string, string> || {},
    });
  };

  // Helper function to apply template data to form
  const applyTemplate = (template: NoteTemplate) => {
    const currentFormData = form.getValues();
    form.reset({
      ...currentFormData,
      title: template.defaultTitle || currentFormData.title,
      content: template.contentText || "",
      contentHtml: template.contentHtml || "",
      contentText: template.contentText || "",
      customFields: {
        ...(currentFormData.customFields as Record<string, string>),
        ...(template.defaultCustomFields as Record<string, string>),
      },
    });
    setSelectedTemplate(template.id);
  };


  const handleDeleteNote = (noteId: string) => {
    deleteNoteMutation.mutate(noteId);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const NoteDialog = ({ isEditing }: { isEditing: boolean }) => (
    <Dialog open={isAddingNote || !!editingNote} onOpenChange={(open) => {
      if (!open) {
        setIsAddingNote(false);
        setEditingNote(null);
        form.reset();
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Note" : "Add New Note"}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Make changes to your note here. Click save when you're done."
              : "Create a new project note. Add a title, category, content and priority level."
            }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter note title..."
                      {...field}
                      data-testid="note-title-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Template Selector */}
            {!isEditing && noteTemplates.length > 0 && (
              <div>
                <label className="text-sm font-medium">Apply Template</label>
                <Select 
                  value={selectedTemplate || ""} 
                  onValueChange={(value) => {
                    if (value) {
                      const template = noteTemplates.find(t => t.id === value);
                      if (template) applyTemplate(template);
                    } else {
                      setSelectedTemplate(null);
                    }
                  }}
                >
                  <SelectTrigger data-testid="note-template-select">
                    <FileTemplate className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No template</SelectItem>
                    {noteTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dynamic Custom Fields */}
            {customFieldDefs.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {customFieldDefs.map((fieldDef) => {
                  const fieldOptions = customFieldOptions[fieldDef.id] || [];
                  
                  return (
                    <FormField
                      key={fieldDef.id}
                      control={form.control}
                      name={`customFields.${fieldDef.key}` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {fieldDef.label}
                            {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                          </FormLabel>
                          <FormControl>
                            {fieldDef.type === "select" ? (
                              <Select value={field.value || ""} onValueChange={field.onChange}>
                                <SelectTrigger data-testid={`note-${fieldDef.key}-select`}>
                                  <SelectValue placeholder={`Select ${fieldDef.label.toLowerCase()}...`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {fieldOptions.map((option: CustomFieldOption) => (
                                    <SelectItem key={option.id} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                placeholder={`Enter ${fieldDef.label.toLowerCase()}...`}
                                {...field}
                                data-testid={`note-${fieldDef.key}-input`}
                              />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  );
                })}
              </div>
            )}
            
            <FormField
              control={form.control}
              name="contentHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      content={field.value || ""}
                      onChange={(html, text) => {
                        field.onChange(html);
                        form.setValue("contentText", text);
                        form.setValue("content", text); // For backward compatibility
                      }}
                      placeholder="Enter note content..."
                      data-testid="note-content-editor"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setIsAddingNote(false);
                setEditingNote(null);
                form.reset();
              }}>
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createNoteMutation.isPending || updateNoteMutation.isPending}
                data-testid="note-save-button"
              >
                {createNoteMutation.isPending || updateNoteMutation.isPending ? 
                  (isEditing ? "Updating..." : "Adding...") :
                  (isEditing ? "Update Note" : "Add Note")
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="p-6 space-y-6" data-testid="notes-page">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Project Notes</h1>
          </div>
          <Button onClick={() => setIsAddingNote(true)} data-testid="add-note-button">
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        </div>
        
        {/* Section separator */}
        <div className="border-b border-border"></div>

        {/* Filters and Search */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="notes-search-input"
            />
          </div>
          
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-48" data-testid="notes-category-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Categories</SelectItem>
              {Array.from(new Set(notes.map(note => note.category))).map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
        </div>
      </div>


      {/* Notes Display */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="text-muted-foreground">Loading notes...</div>
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {searchTerm || selectedCategory !== "All" ? "No notes found" : "No notes yet"}
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || selectedCategory !== "All" 
              ? "Try adjusting your search or filter criteria"
              : "Start by adding your first project note"
            }
          </p>
          {!searchTerm && selectedCategory === "All" && (
            <Button onClick={() => setIsAddingNote(true)} data-testid="add-first-note-button">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Note
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4 max-w-2xl mx-auto">
          {filteredNotes.map((note) => (
            <Card 
              key={note.id} 
              className="hover-elevate cursor-pointer"
              data-testid={`note-card-${note.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base line-clamp-2 mb-2">
                      {note.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs" data-testid={`note-category-${note.id}`}>
                        {note.category}
                      </Badge>
                      <Badge className={`text-xs ${getPriorityColor(note.priority)}`} data-testid={`note-priority-${note.id}`}>
                        {note.priority}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`note-menu-trigger-${note.id}`}>
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditNote(note)} data-testid={`note-edit-${note.id}`}>
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-destructive"
                        data-testid={`note-delete-${note.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                  {note.content}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{note.author}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format(note.createdAt, "MMM d, yyyy")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <NoteDialog isEditing={!!editingNote} />
    </div>
  );
}