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
import { useToast } from "@/hooks/use-toast";
import { 
  BookOpen, 
  Plus, 
  Calendar as CalendarIcon,
  FileText,
  Image as ImageIcon,
  Upload,
  X,
  Edit,
  Trash2,
  Eye
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

  // If we have a projectId from the URL, use it automatically
  useEffect(() => {
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch templates
  const { data: templates = [] } = useQuery<SiteDiaryTemplate[]>({
    queryKey: ["/api/site-diary-templates"],
  });

  // Fetch entries for selected project
  const { data: entries = [] } = useQuery<SiteDiaryEntry[]>({
    queryKey: ["/api/projects", selectedProjectId, "site-diary-entries"],
    enabled: !!selectedProjectId,
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const isProjectFromUrl = !!projectIdFromUrl;

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site Diary</h1>
          <p className="text-muted-foreground mt-1">
            Record daily construction activities and progress
          </p>
        </div>
        {selectedProjectId && selectedTemplateId && !isCreating && (
          <Button onClick={() => setIsCreating(true)} data-testid="button-create-entry">
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
        )}
      </div>

      {/* Project & Template Selection */}
      {!isCreating && (
        <div className={isProjectFromUrl ? "max-w-md" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
          {/* Only show project selector if not in a project context */}
          {!isProjectFromUrl && (
            <div className="space-y-2">
              <Label>Select Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Select Template</Label>
            <Select 
              value={selectedTemplateId} 
              onValueChange={setSelectedTemplateId}
              disabled={!selectedProjectId}
            >
              <SelectTrigger data-testid="select-template">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Entry Form or List */}
      {isCreating && selectedTemplate && selectedProjectId ? (
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
      ) : (
        <EntriesList 
          entries={entries} 
          selectedProjectId={selectedProjectId}
          selectedTemplateId={selectedTemplateId}
          isProjectFromUrl={isProjectFromUrl}
        />
      )}
    </div>
  );
}

// Entry Form Component
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

  // Build dynamic schema based on template fields
  const buildFormSchema = () => {
    const fieldSchemas: Record<string, z.ZodTypeAny> = {};
    
    templateFields.forEach(field => {
      if (field.required) {
        if (field.type === 'number') {
          // For required numbers, ensure it's not empty string before coercing
          fieldSchemas[field.id] = z.string()
            .min(1, "Required")
            .transform(val => Number(val))
            .pipe(z.number());
        } else if (field.type === 'checkbox') {
          // For required checkboxes, normalize to boolean and ensure it's true
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
          // For optional numbers, transform empty to undefined, otherwise to number
          fieldSchemas[field.id] = z.string()
            .transform(val => val === '' ? undefined : Number(val))
            .pipe(z.number().optional());
        } else if (field.type === 'checkbox') {
          // Normalize checkbox values to boolean
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
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>New Site Diary Entry</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {projectName} • {template.name}
            </p>
          </div>
          <Button variant="ghost" onClick={onCancel} data-testid="button-cancel-entry">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Title Field */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Daily Progress - Framing" {...field} data-testid="input-entry-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date Field */}
            <FormField
              control={form.control}
              name="entryDateTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-entry-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dynamic Template Fields */}
            {templateFields.map((templateField) => (
              <FormField
                key={templateField.id}
                control={form.control}
                name={templateField.id as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {templateField.title}
                      {templateField.required && " *"}
                    </FormLabel>
                    <FormControl>
                      {templateField.type === 'text' && (
                        <Input 
                          {...field} 
                          value={field.value as string || ''} 
                          data-testid={`input-field-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'textarea' && (
                        <Textarea 
                          {...field} 
                          value={field.value as string || ''} 
                          data-testid={`textarea-field-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'number' && (
                        <Input 
                          type="number" 
                          {...field} 
                          value={field.value as number || ''} 
                          data-testid={`input-number-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'date' && (
                        <Input 
                          type="date" 
                          {...field} 
                          value={field.value as string || ''} 
                          data-testid={`input-date-${templateField.id}`}
                        />
                      )}
                      {templateField.type === 'select' && (
                        <Select 
                          value={field.value as string || ''} 
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger data-testid={`select-field-${templateField.id}`}>
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
                        <div className="border-2 border-dashed rounded-md p-4 text-center">
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
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

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                data-testid="button-submit-entry"
              >
                {createMutation.isPending ? "Creating..." : "Create Entry"}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// Entries List Component
function EntriesList({ 
  entries, 
  selectedProjectId,
  selectedTemplateId,
  isProjectFromUrl 
}: { 
  entries: SiteDiaryEntry[]; 
  selectedProjectId: string;
  selectedTemplateId: string;
  isProjectFromUrl: boolean;
}) {
  if (!selectedProjectId || !selectedTemplateId) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {isProjectFromUrl ? "No Site Diaries" : "Select Project and Template"}
          </h3>
          <p className="text-muted-foreground">
            {isProjectFromUrl 
              ? "Select a template above to create your first site diary entry"
              : "Choose a project and template to view or create site diary entries"
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Entries Yet</h3>
          <p className="text-muted-foreground">
            Create your first site diary entry using the "New Entry" button above
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Recent Entries</h3>
      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id} className="hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium">{entry.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(new Date(entry.entryDateTime), 'PPP')}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">{entry.templateName}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" data-testid={`button-view-entry-${entry.id}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" data-testid={`button-edit-entry-${entry.id}`}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
