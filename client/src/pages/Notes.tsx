import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProject } from "@/contexts/ProjectContext";
import { useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  type NoteTemplate,
  type NoteTemplateField,
  type User as UserType
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  UserPlus,
  FileText as FileTemplate,
  Settings,
  ArrowUpDown,
  Clock,
  Pin,
  PinOff,
} from "lucide-react";
import { UserSelect } from "@/components/UserSelect";
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
    assigneeId: z.string().optional(),
    assigneeName: z.string().optional(),
    visibility: z.enum(["team_only", "everyone", "project_team", "private"]).optional(),
    projectId: z.string().optional(),
    category: z.string().optional(),
    customFields: z.object(customFieldsSchema).optional(),
    templateId: z.string().optional(),
  });
};

interface NotesParams {
  projectId?: string;
}

interface NotesProps {
  projectId?: string | null;
}

export default function Notes({ projectId: propProjectId }: NotesProps = {}) {
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedField, setSelectedField] = useState("All");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, any>>({});
  const [sortBy, setSortBy] = useState("newest");
  const { toast } = useToast();
  const { currentProject } = useProject();
  const params = useParams<NotesParams>();
  const pageTitle = usePageTitle({ pageName: "Notes" });
  
  // Priority: prop projectId > URL params > undefined (show all)
  // null prop explicitly means business/company-wide notes
  const effectiveProjectId = propProjectId !== undefined ? propProjectId : params.projectId;

  // Fetch current user
  const { data: currentUser } = useQuery<UserType>({
    queryKey: ["/api/user"],
  });

  // Fetch custom field definitions and templates
  const { data: customFieldDefsRaw = [], isLoading: isLoadingFields } = useQuery<CustomFieldDef[]>({
    queryKey: ["/api/custom-field-defs"],
  });

  const { data: noteTemplates = [], isLoading: isLoadingTemplates } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates", { activeOnly: "true" }],
    queryFn: async () => {
      const response = await fetch("/api/note-templates?activeOnly=true", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  // Get the selected template object
  const selectedTemplateObj = noteTemplates.find(t => t.id === selectedTemplate);

  // Fetch template fields when a form-based template is selected
  const { data: templateFieldsData } = useQuery<{ template: NoteTemplate; fields: NoteTemplateField[] }>({
    queryKey: ["/api/note-templates", selectedTemplate, { includeFields: "true" }],
    queryFn: async () => {
      const response = await fetch(`/api/note-templates/${selectedTemplate}?includeFields=true`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch template fields");
      return response.json();
    },
    enabled: !!selectedTemplate && selectedTemplateObj?.isFormBased === true,
  });

  const templateFields = templateFieldsData?.fields || [];

  // Use customFieldDefs directly - React Query already handles caching
  const customFieldDefs = customFieldDefsRaw;

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

  // Create dynamic form schema based on custom fields - memoized to prevent re-renders
  const noteFormSchema = useMemo(() => createNoteFormSchema(customFieldDefs), [customFieldDefs]);
  
  // Use proper z.infer type
  type NoteFormData = z.infer<typeof noteFormSchema>;

  // Get current user's display name
  const currentUserName = currentUser 
    ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email || 'Unknown User'
    : 'Unknown User';

  // Memoize default values to prevent form re-initialization
  const defaultValues = useMemo(() => ({
    title: "",
    content: "",
    contentHtml: "",
    contentText: "",
    author: currentUserName,
    ownerId: currentUser?.id,
    ownerName: currentUserName,
    assigneeId: undefined as string | undefined,
    assigneeName: undefined as string | undefined,
    visibility: "team_only" as const,
    category: "General", // Default category
    customFields: customFieldDefs.reduce((acc, field) => {
      acc[field.key] = "";
      return acc;
    }, {} as Record<string, string>),
  }), [customFieldDefs, currentUserName, currentUser?.id]);

  // Use a ref to store stable default values for form resets
  const defaultValuesRef = useRef(defaultValues);
  
  // Update ref when defaultValues change, but don't trigger re-renders
  useEffect(() => {
    defaultValuesRef.current = defaultValues;
  }, [defaultValues]);

  // Form handling - declare form after schema is available
  const form = useForm<NoteFormData>({
    resolver: zodResolver(noteFormSchema),
    defaultValues,
  });

  // Fetch projects to display project names
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch users for assignee lookup
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Helper to get user name by ID
  const getUserName = (userId: string | undefined | null): string | undefined => {
    if (!userId) return undefined;
    const user = users.find(u => u.id === userId);
    if (!user) return undefined;
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User';
  };

  // React Query hooks - fetch notes filtered by current project (or all notes if no project selected)
  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", effectiveProjectId],
    queryFn: async () => {
      // null means business/company-wide notes
      // undefined means all notes
      // string means specific project notes
      const url = effectiveProjectId === null
        ? '/api/notes?projectId=null'
        : effectiveProjectId 
        ? `/api/notes?projectId=${effectiveProjectId}` 
        : '/api/notes';
      const response = await fetch(url, {
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
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: InsertNote) => {
      return await apiRequest("/api/notes", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", effectiveProjectId] });
      toast({ title: "Note created successfully" });
      setIsAddingNote(false);
      form.reset(defaultValuesRef.current);
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
      return await apiRequest(`/api/notes/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", effectiveProjectId] });
      toast({ title: "Note updated successfully" });
      setEditingNote(null);
      form.reset(defaultValuesRef.current);
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
      await apiRequest(`/api/notes/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", effectiveProjectId] });
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

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      return await apiRequest(`/api/notes/${id}`, "PATCH", { pinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", effectiveProjectId] });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to pin note", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleTogglePin = (note: Note) => {
    const newPinnedState = !note.pinned;
    
    // Check if we're trying to pin a note and already have 3 pinned
    if (newPinnedState) {
      const pinnedCount = notes.filter(n => n.pinned).length;
      if (pinnedCount >= 3) {
        toast({ 
          title: "Maximum pinned notes reached", 
          description: "You can only pin up to 3 notes at a time. Unpin another note first.",
          variant: "destructive" 
        });
        return;
      }
    }
    
    togglePinMutation.mutate({ id: note.id, pinned: newPinnedState });
  };


  const filteredNotes = useMemo(() => {
    let filtered = notes.filter(note => {
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

    // Apply sorting
    switch (sortBy) {
      case "oldest":
        filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "alphabetical":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "newest":
      default:
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }
    
    // Always sort pinned notes to the top (max 3 pinned)
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    
    return filtered;
  }, [notes, searchTerm, selectedCategory, selectedField, sortBy]);

  const onSubmit = (data: NoteFormData) => {
    try {
      let contentText = data.contentText || data.content || "";
      let contentHtml = data.contentHtml || "";

      // If using a form-based template, generate content from field values
      if (selectedTemplateObj?.isFormBased && templateFields.length > 0) {
        const generatedContent = generateContentFromTemplateFields();
        contentText = generatedContent.text;
        contentHtml = generatedContent.html;
      }

      // Transform and validate form data using the schema
      const noteData = insertNoteSchema.parse({
        title: data.title || "",
        content: contentText,
        contentHtml: contentHtml,
        contentText: contentText,
        author: data.author || currentUserName,
        ownerId: data.ownerId || currentUser?.id,
        ownerName: data.ownerName || currentUserName,
        assigneeId: data.assigneeId || undefined,
        assigneeName: data.assigneeId ? getUserName(data.assigneeId) : undefined,
        visibility: data.visibility || "team_only",
        projectId: effectiveProjectId,
        customFields: selectedTemplateObj?.isFormBased 
          ? { ...data.customFields, templateFields: templateFieldValues }
          : data.customFields || {},
        category: data.category || "General",
        priority: (data.customFields as Record<string, string>)?.priority || "medium",
        templateId: selectedTemplate || undefined,
      });
      
      if (editingNote) {
        updateNoteMutation.mutate({ id: editingNote.id, data: noteData });
      } else {
        createNoteMutation.mutate(noteData);
      }
    } catch (error) {
      console.error("Note validation error:", error);
      toast({ 
        title: "Validation Error", 
        description: "Please check your input and try again.",
        variant: "destructive" 
      });
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
      ownerName: note.ownerName || currentUserName,
      assigneeId: note.assigneeId || undefined,
      assigneeName: note.assigneeName || undefined,
      visibility: (note.visibility as "team_only" | "everyone" | "project_team" | "private") || "team_only",
      projectId: note.projectId || undefined,
      category: note.category || "General",
      customFields: note.customFields as Record<string, string> || {},
    });
  };

  // Helper function to apply template data to form
  const applyTemplate = (template: NoteTemplate) => {
    const currentFormData = form.getValues();
    
    if (template.isFormBased) {
      form.reset({
        ...currentFormData,
        title: template.defaultTitle || currentFormData.title,
        templateId: template.id,
      });
      setTemplateFieldValues({});
    } else {
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
    }
    setSelectedTemplate(template.id);
  };

  // Generate formatted content from template field values
  const generateContentFromTemplateFields = (): { html: string; text: string } => {
    if (!selectedTemplateObj || !selectedTemplateObj.isFormBased || templateFields.length === 0) {
      return { html: "", text: "" };
    }

    const lines: string[] = [];
    const htmlLines: string[] = [];

    templateFields.forEach(field => {
      const value = templateFieldValues[field.key];
      if (value !== undefined && value !== "") {
        const displayValue = field.type === "checkbox" 
          ? (value ? "Yes" : "No")
          : field.type === "select"
            ? ((field.options as { value: string; label: string }[])?.find(o => o.value === value)?.label || value)
            : value;
        
        lines.push(`${field.label}: ${displayValue}`);
        htmlLines.push(`<p><strong>${field.label}:</strong> ${displayValue}</p>`);
      }
    });

    return {
      text: lines.join("\n"),
      html: htmlLines.join(""),
    };
  };

  // Update template field value
  const updateTemplateFieldValue = (key: string, value: any) => {
    setTemplateFieldValues(prev => ({
      ...prev,
      [key]: value,
    }));
  };


  const handleDeleteNote = (noteId: string) => {
    deleteNoteMutation.mutate(noteId);
  };

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case "team_only":
        return "Team only";
      case "everyone":
        return "Everyone";
      case "project_team":
        return "Project team";
      case "private":
        return "Private";
      default:
        return "Team only";
    }
  };

  const getProjectName = (projectId: string | null | undefined) => {
    if (!projectId) return "No Project";
    const project = projects.find(p => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  // Stabilize dialog state to prevent flickering
  const isDialogOpen = isAddingNote || !!editingNote;
  
  // Handle dialog close - always allow closing
  const handleDialogClose = useCallback(() => {
    setIsAddingNote(false);
    setEditingNote(null);
    setSelectedTemplate(null);
    setTemplateFieldValues({});
    // Reset form to default values using ref to prevent dependency issues
    form.reset(defaultValuesRef.current);
  }, [form]);

  // Standard form submission
  const handleFormSubmit = form.handleSubmit(onSubmit);



  return (
    <div className="flex flex-col h-full" data-testid="notes-page">
      {/* 2-Row Header - ClickUp 2025 Pattern */}
      <div className="border-b bg-background">
        {/* Row 1: Title */}
        <div className="h-9 px-4 flex items-center">
          <h2 className="text-sm font-semibold">
            {pageTitle}
          </h2>
        </div>

        {/* Row 2: Controls & Filters */}
        <div className="h-9 px-4 flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-6 pl-7 text-xs"
              data-testid="notes-search-input"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-6 w-40 text-xs gap-1" data-testid="notes-category-filter">
              <Filter className="h-3 w-3" />
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

          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-6 w-36 text-xs gap-1" data-testid="notes-sort-filter">
              <ArrowUpDown className="h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {/* Add Note Button */}
          <Button 
            size="sm"
            onClick={() => setIsAddingNote(true)} 
            className="h-6 px-2 text-xs gap-1"
            data-testid="add-note-button"
          >
            <Plus className="h-3 w-3" />
            Add Note
          </Button>
        </div>
      </div>

      {/* Notes Display */}
      <div className="flex-1 overflow-auto p-4">
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Loading notes...
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-sm font-medium mb-2">
            {searchTerm || selectedCategory !== "All" ? "No notes found" : "No notes yet"}
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {searchTerm || selectedCategory !== "All" 
              ? "Try adjusting your search or filter criteria"
              : "Start by adding your first note"
            }
          </p>
          {!searchTerm && selectedCategory === "All" && (
            <Button 
              size="sm"
              onClick={() => setIsAddingNote(true)} 
              className="h-6 px-2 text-xs gap-1"
              data-testid="add-first-note-button"
            >
              <Plus className="h-3 w-3" />
              Add Your First Note
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredNotes.map((note) => (
            <div 
              key={note.id} 
              className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
              data-testid={`note-card-${note.id}`}
              onDoubleClick={() => handleEditNote(note)}
            >
              <div className="flex items-start gap-2">
                {/* Pin indicator */}
                {note.pinned && (
                  <div className="flex-shrink-0 pt-0.5">
                    <Pin className="h-3 w-3 text-[#bba7db]" data-testid={`note-pinned-indicator-${note.id}`} />
                  </div>
                )}
                
                {/* Title and Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-1 line-clamp-1">
                    {note.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {note.contentText || note.content}
                  </p>
                </div>
                
                {/* Metadata Column */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Project (only show when viewing all items) */}
                  {!effectiveProjectId && note.projectId && (
                    <Badge variant="default" className="h-4 px-1.5 text-[10px]" data-testid={`note-project-${note.id}`}>
                      {getProjectName(note.projectId)}
                    </Badge>
                  )}

                  {/* Category */}
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]" data-testid={`note-category-${note.id}`}>
                    {note.category}
                  </Badge>
                  
                  {/* Visibility */}
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]" data-testid={`note-visibility-${note.id}`}>
                    {getVisibilityLabel(note.visibility || "team_only")}
                  </Badge>
                  
                  {/* Date */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span data-testid={`note-date-${note.id}`}>
                      {format(new Date(note.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  
                  {/* Author */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{note.author}</span>
                  </div>
                  
                  {/* Assignee */}
                  {note.assigneeName && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <UserPlus className="h-3 w-3 text-[#bba7db]" />
                      <span data-testid={`note-assignee-${note.id}`}>{note.assigneeName}</span>
                    </div>
                  )}
                  
                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" data-testid={`note-menu-trigger-${note.id}`}>
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => handleTogglePin(note)} 
                        disabled={togglePinMutation.isPending}
                        data-testid={`note-pin-${note.id}`}
                      >
                        {note.pinned ? (
                          <>
                            <PinOff className="h-4 w-4 mr-2" />
                            Unpin
                          </>
                        ) : (
                          <>
                            <Pin className="h-4 w-4 mr-2" />
                            Pin
                          </>
                        )}
                      </DropdownMenuItem>
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
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Dialog */}
      <Dialog 
        open={isDialogOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingNote(false);
            setEditingNote(null);
            setSelectedTemplate(null);
            form.reset(defaultValuesRef.current);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? "Edit Note" : "Add New Note"}
            </DialogTitle>
            <DialogDescription>
              {editingNote 
                ? "Make changes to your note here. Click save when you're done."
                : "Create a new project note. Add a title, category, content and priority level."
              }
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-3 mt-4">
              {/* Title Field - using FormField for better stability */}
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
                        autoComplete="off"
                        onFocus={(e) => {
                          // Prevent auto-selection of text on focus
                          // Move cursor to end instead of selecting all
                          const target = e.target;
                          const length = target.value.length;
                          setTimeout(() => {
                            target.setSelectionRange(length, length);
                          }, 0);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Owner, Visibility, and Category in a row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Owner Field */}
                <FormField
                  control={form.control}
                  name="ownerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Note owner..."
                          {...field}
                          data-testid="note-owner-input"
                          readOnly
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Visibility Dropdown */}
                <FormField
                  control={form.control}
                  name="visibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Who can view</FormLabel>
                      <Select value={field.value || "team_only"} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="note-visibility-select">
                            <SelectValue placeholder="Select visibility..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="private">Private</SelectItem>
                          <SelectItem value="team_only">Team only</SelectItem>
                          <SelectItem value="project_team">Project team</SelectItem>
                          <SelectItem value="everyone">Everyone</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Category Dropdown */}
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value || "General"} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="note-category-select">
                            <SelectValue placeholder="Select category..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="General">General</SelectItem>
                          <SelectItem value="Meeting Notes">Meeting Notes</SelectItem>
                          <SelectItem value="Project Updates">Project Updates</SelectItem>
                          <SelectItem value="Ideas">Ideas</SelectItem>
                          <SelectItem value="To-Do">To-Do</SelectItem>
                          <SelectItem value="Important">Important</SelectItem>
                          <SelectItem value="Documentation">Documentation</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Assignee Field */}
              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <UserPlus className="h-3 w-3" />
                      Assign To
                    </FormLabel>
                    <FormControl>
                      <UserSelect
                        value={field.value || ""}
                        onValueChange={field.onChange}
                        placeholder="Select user to assign..."
                        allowNone={true}
                        noneLabel="No one assigned"
                        data-testid="note-assignee-select"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Template Selector */}
              {!editingNote && noteTemplates.length > 0 && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <FileTemplate className="h-3 w-3" />
                    Apply Template
                  </label>
                  <Select 
                    value={selectedTemplate || "none"} 
                    onValueChange={(value) => {
                      if (value && value !== "none") {
                        const template = noteTemplates.find(t => t.id === value);
                        if (template) applyTemplate(template);
                      } else {
                        setSelectedTemplate(null);
                        setTemplateFieldValues({});
                      }
                    }}
                  >
                    <SelectTrigger data-testid="note-template-select">
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No template</SelectItem>
                      {noteTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                          {template.isFormBased && " (Form)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Form-based Template Fields */}
              {selectedTemplateObj?.isFormBased && templateFields.length > 0 && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <FileTemplate className="h-4 w-4" />
                    Template Fields - {selectedTemplateObj.name}
                  </div>
                  <div className="grid gap-4">
                    {templateFields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1">
                          {field.label}
                          {field.isRequired && <span className="text-destructive">*</span>}
                        </label>
                        {field.description && (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        {field.type === "text" && (
                          <Input
                            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                            value={templateFieldValues[field.key] || ""}
                            onChange={(e) => updateTemplateFieldValue(field.key, e.target.value)}
                            data-testid={`template-field-${field.key}`}
                          />
                        )}
                        {field.type === "textarea" && (
                          <Textarea
                            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                            value={templateFieldValues[field.key] || ""}
                            onChange={(e) => updateTemplateFieldValue(field.key, e.target.value)}
                            className="min-h-[100px]"
                            data-testid={`template-field-${field.key}`}
                          />
                        )}
                        {field.type === "number" && (
                          <Input
                            type="number"
                            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                            value={templateFieldValues[field.key] || ""}
                            onChange={(e) => updateTemplateFieldValue(field.key, e.target.value)}
                            data-testid={`template-field-${field.key}`}
                          />
                        )}
                        {field.type === "date" && (
                          <Input
                            type="date"
                            value={templateFieldValues[field.key] || ""}
                            onChange={(e) => updateTemplateFieldValue(field.key, e.target.value)}
                            data-testid={`template-field-${field.key}`}
                          />
                        )}
                        {field.type === "checkbox" && (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={templateFieldValues[field.key] || false}
                              onCheckedChange={(checked) => updateTemplateFieldValue(field.key, checked)}
                              data-testid={`template-field-${field.key}`}
                            />
                            <span className="text-sm">{field.placeholder || field.label}</span>
                          </div>
                        )}
                        {field.type === "select" && (
                          <Select
                            value={templateFieldValues[field.key] || ""}
                            onValueChange={(value) => updateTemplateFieldValue(field.key, value)}
                          >
                            <SelectTrigger data-testid={`template-field-${field.key}`}>
                              <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {(field.options as { value: string; label: string }[] || []).map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
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
              
              {/* Only show content editor if NOT using a form-based template */}
              {!(selectedTemplateObj?.isFormBased && templateFields.length > 0) && (
                <FormField
                  control={form.control}
                  name="contentHtml"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content</FormLabel>
                      <FormControl>
                        <div className="min-h-[300px]">
                          <RichTextEditor
                            key={editingNote ? `edit-${editingNote.id}` : 'new'}
                            content={field.value || ""}
                            onChange={(html, text) => {
                              field.onChange(html);
                              form.setValue("contentText", text, { shouldValidate: false });
                              form.setValue("content", text, { shouldValidate: false });
                            }}
                            placeholder="Enter note content..."
                            data-testid="note-content-editor"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddingNote(false);
                  setEditingNote(null);
                  form.reset(defaultValuesRef.current);
                }}>
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createNoteMutation.isPending || updateNoteMutation.isPending}
                  data-testid="note-save-button"
                >
                  {createNoteMutation.isPending || updateNoteMutation.isPending ? 
                    (editingNote ? "Updating..." : "Adding...") :
                    (editingNote ? "Update Note" : "Add Note")
                  }
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}