import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { 
  BookOpen, 
  Plus, 
  Calendar as CalendarIcon,
  FileText,
  Upload,
  X,
  Edit,
  Trash2,
  Eye,
  Search,
  LayoutList,
  MoreVertical,
  Clock,
  User,
  Cloud,
  Thermometer
} from "lucide-react";
import { format } from "date-fns";
import type { 
  Project, 
  SiteDiaryTemplate, 
  SiteDiaryEntry, 
  InsertSiteDiaryEntry,
  TemplateFieldDefinition 
} from "@shared/schema";
import { insertSiteDiaryEntrySchema } from "@shared/schema";
import { z } from "zod";

export default function SiteDiaryEntries() {
  const { toast } = useToast();
  const params = useParams();
  const projectIdFromUrl = params.projectId;
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: templates = [] } = useQuery<SiteDiaryTemplate[]>({
    queryKey: ["/api/site-diary-templates"],
  });

  const { data: entries = [], isLoading } = useQuery<SiteDiaryEntry[]>({
    queryKey: ["/api/projects", selectedProjectId, "site-diary-entries"],
    enabled: !!selectedProjectId,
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const isProjectFromUrl = !!projectIdFromUrl;

  const filteredEntries = entries.filter((entry) => {
    if (!selectedTemplateId || selectedTemplateId === "all") return true;
    return entry.templateId === selectedTemplateId;
  }).filter((entry) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      entry.title.toLowerCase().includes(searchLower) ||
      entry.templateName?.toLowerCase().includes(searchLower)
    );
  });

  const handleAddEntry = () => {
    if (!selectedTemplateId || selectedTemplateId === "all") {
      toast({
        title: "Select a template",
        description: "Please select a specific template to create an entry",
        variant: "destructive",
      });
      return;
    }
    setIsCreating(true);
  };

  if (isCreating && selectedTemplate && selectedProjectId) {
    return (
      <div className="flex flex-col h-full p-2">
        <EntryForm
          template={selectedTemplate}
          projectId={selectedProjectId}
          projectName={selectedProject?.name || ""}
          onCancel={() => setIsCreating(false)}
          onSuccess={() => {
            setIsCreating(false);
            queryClient.invalidateQueries({ 
              queryKey: ["/api/projects", selectedProjectId, "site-diary-entries"] 
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="page-site-diary">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-white dark:bg-gray-950 flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Site Diary
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-entry-count">
            {filteredEntries.length} entries
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleAddEntry}
            disabled={!selectedProjectId}
            data-testid="button-add-site-diary"
          >
            <Plus className="w-3 h-3" />
            <span>Add Site Diary</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Filters & Search (36px) */}
      <div className="h-9 bg-white dark:bg-gray-950 flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
            data-testid="button-list-view"
          >
            <LayoutList className="w-3 h-3" />
            <span>List</span>
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="site-diary-search-input"
            />
          </div>

          {/* Project Filter (only when not in project context) */}
          {!isProjectFromUrl && (
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="filter-project-popover"
                >
                  <span>Project</span>
                  {selectedProjectId && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      1
                    </Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-1">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                        selectedProjectId === project.id ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                      }`}
                      data-testid={`filter-project-${project.id}`}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Template Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="filter-template-popover"
              >
                <span>Template</span>
                {selectedTemplateId && selectedTemplateId !== "all" && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedTemplateId("all")}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    selectedTemplateId === "all" || !selectedTemplateId ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                  }`}
                  data-testid="filter-template-all"
                >
                  All Templates
                </button>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                      selectedTemplateId === template.id ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-template-${template.id}`}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {!selectedProjectId ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <BookOpen className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              {isProjectFromUrl ? "No site diary entries" : "Select a project to view entries"}
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading entries...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              {entries.length === 0 ? "No site diary entries yet" : "No matching entries"}
            </p>
            {entries.length === 0 && selectedTemplateId && selectedTemplateId !== "all" && (
              <button
                className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                onClick={handleAddEntry}
                data-testid="button-add-first-entry"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Entry
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEntries.map((entry) => (
              <SiteDiaryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SiteDiaryCard({ entry }: { entry: SiteDiaryEntry }) {
  const fieldValues = entry.fieldValues as Record<string, any> || {};
  
  const getWeatherDisplay = () => {
    const weather = fieldValues.weather || fieldValues.weatherConditions;
    if (weather) return weather;
    return null;
  };

  const getTemperatureDisplay = () => {
    const temp = fieldValues.temperature || fieldValues.temp;
    if (temp) return `${temp}°C`;
    return null;
  };

  const weather = getWeatherDisplay();
  const temperature = getTemperatureDisplay();

  return (
    <div 
      className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
      data-testid={`site-diary-card-${entry.id}`}
    >
      <div className="flex items-start gap-2">
        {/* Title and Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1 line-clamp-1" data-testid={`entry-title-${entry.id}`}>
            {entry.title}
          </h3>
          {fieldValues.notes || fieldValues.description || fieldValues.summary ? (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {fieldValues.notes || fieldValues.description || fieldValues.summary}
            </p>
          ) : null}
        </div>

        {/* Metadata Column */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Template */}
          <Badge variant="default" className="h-4 px-1.5 text-[10px]" data-testid={`entry-template-${entry.id}`}>
            {entry.templateName}
          </Badge>

          {/* Weather */}
          {weather && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]" data-testid={`entry-weather-${entry.id}`}>
              <Cloud className="w-2.5 h-2.5 mr-0.5" />
              {weather}
            </Badge>
          )}

          {/* Temperature */}
          {temperature && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]" data-testid={`entry-temp-${entry.id}`}>
              <Thermometer className="w-2.5 h-2.5 mr-0.5" />
              {temperature}
            </Badge>
          )}

          {/* Date */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`entry-date-${entry.id}`}>
            <CalendarIcon className="h-3 w-3" />
            <span>{format(new Date(entry.entryDateTime), "MMM d, yyyy")}</span>
          </div>

          {/* Share indicator */}
          {entry.shareWithClient && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              Shared
            </Badge>
          )}

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" data-testid={`entry-menu-trigger-${entry.id}`}>
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid={`entry-view-${entry.id}`}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem data-testid={`entry-edit-${entry.id}`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" data-testid={`entry-delete-${entry.id}`}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function EntryForm({ 
  template, 
  projectId, 
  projectName,
  onCancel, 
  onSuccess 
}: { 
  template: SiteDiaryTemplate; 
  projectId: string;
  projectName: string;
  onCancel: () => void; 
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const templateFields = (template.fields as TemplateFieldDefinition[]) || [];

  const buildFormSchema = () => {
    const fieldSchemas: Record<string, z.ZodTypeAny> = {};
    
    templateFields.forEach(field => {
      if (field.required) {
        if (field.type === 'number') {
          fieldSchemas[field.id] = z.string()
            .min(1, "Required")
            .transform(val => Number(val))
            .pipe(z.number());
        } else if (field.type === 'checkbox') {
          fieldSchemas[field.id] = z.any()
            .transform(val => val === true || val === "true")
            .pipe(z.boolean().refine(val => val === true, {
              message: "This field must be checked"
            }));
        } else if (field.type === 'date') {
          fieldSchemas[field.id] = z.string().min(1, "Required");
        } else {
          fieldSchemas[field.id] = z.string().min(1, "Required");
        }
      } else {
        if (field.type === 'number') {
          fieldSchemas[field.id] = z.string()
            .transform(val => val === '' ? undefined : Number(val))
            .pipe(z.number().optional());
        } else if (field.type === 'checkbox') {
          fieldSchemas[field.id] = z.any()
            .transform(val => val === true || val === "true")
            .pipe(z.boolean().optional());
        } else {
          fieldSchemas[field.id] = z.string().optional();
        }
      }
    });

    return z.object({
      title: z.string().min(1, "Title is required"),
      entryDateTime: z.string().min(1, "Date is required"),
      ...fieldSchemas,
    });
  };

  const formSchema = buildFormSchema();
  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      entryDateTime: new Date().toISOString().split('T')[0],
      ...templateFields.reduce((acc, field) => {
        acc[field.id] = field.type === 'checkbox' ? false : '';
        return acc;
      }, {} as Record<string, any>),
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const fieldValues: Record<string, any> = {};
      templateFields.forEach(field => {
        fieldValues[field.id] = data[field.id as keyof FormData];
      });

      const entryData: InsertSiteDiaryEntry = {
        templateId: template.id,
        templateName: template.name,
        projectId,
        title: data.title,
        entryDateTime: new Date(data.entryDateTime),
        fieldValues,
        attachments: [],
        overallPhotos: [],
        shareWithClient: false,
      };

      const response = await apiRequest("/api/site-diary-entries", "POST", entryData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Site diary entry created successfully" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create entry",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">New Site Diary Entry</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectName} • {template.name}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel} data-testid="button-cancel-entry">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Entry Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Daily Progress - Framing" className="h-8 text-sm" {...field} data-testid="input-entry-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="entryDateTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Entry Date *</FormLabel>
                  <FormControl>
                    <Input type="date" className="h-8 text-sm" {...field} data-testid="input-entry-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {templateFields.map((templateField) => (
              <FormField
                key={templateField.id}
                control={form.control}
                name={templateField.id as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {templateField.title}
                      {templateField.required && " *"}
                    </FormLabel>
                    <FormControl>
                      {templateField.type === 'text' && (
                        <Input 
                          {...field} 
                          value={field.value as string || ''} 
                          className="h-8 text-sm"
                          data-testid={`input-field-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'textarea' && (
                        <Textarea 
                          {...field} 
                          value={field.value as string || ''} 
                          className="text-sm min-h-[60px]"
                          data-testid={`textarea-field-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'number' && (
                        <Input 
                          type="number" 
                          {...field} 
                          value={field.value as number || ''} 
                          className="h-8 text-sm"
                          data-testid={`input-number-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'date' && (
                        <Input 
                          type="date" 
                          {...field} 
                          value={field.value as string || ''} 
                          className="h-8 text-sm"
                          data-testid={`input-date-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'select' && (
                        <Select 
                          value={field.value as string || ''} 
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="h-8 text-sm" data-testid={`select-field-${templateField.id}`}>
                            <SelectValue placeholder="Select an option" />
                          </SelectTrigger>
                          <SelectContent>
                            {templateField.options?.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {templateField.type === 'checkbox' && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={field.value as boolean || false}
                            onCheckedChange={field.onChange}
                            data-testid={`checkbox-field-${templateField.id}`}
                          />
                        </div>
                      )}
                      {(templateField.type === 'file' || templateField.type === 'photo-gallery') && (
                        <div className="border-2 border-dashed rounded-md p-3 text-center">
                          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                          <p className="text-xs text-muted-foreground">
                            {templateField.type === 'photo-gallery' 
                              ? "Photo upload (max 3) - Coming soon" 
                              : "File upload - Coming soon"}
                          </p>
                        </div>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <div className="flex gap-2 pt-2">
              <Button 
                type="submit" 
                size="sm"
                disabled={createMutation.isPending}
                data-testid="button-submit-entry"
              >
                {createMutation.isPending ? "Creating..." : "Create Entry"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
