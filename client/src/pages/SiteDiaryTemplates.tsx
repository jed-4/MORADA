import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  type SiteDiaryTemplate
} from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Copy,
  Star,
  Upload,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { TemplateFormDialog } from "@/components/site-diary/TemplateFormDialog";

export default function SiteDiaryTemplates() {
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SiteDiaryTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<SiteDiaryTemplate[]>({
    queryKey: ["/api/site-diary-templates"],
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (templateId: string) => {
      await apiRequest(`/api/site-diary-templates/${templateId}/set-default`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-diary-templates"] });
      toast({
        title: "Default template updated",
        description: "This template will now be used by default for new site diary entries.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to set default template.",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/site-diary-templates/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-diary-templates"] });
      toast({
        title: "Template deleted",
        description: "The template has been archived successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template.",
        variant: "destructive",
      });
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: async (template: SiteDiaryTemplate) => {
      const { id, createdAt, updatedAt, isArchived, ...rest } = template;
      await apiRequest("/api/site-diary-templates", 'POST', {
        ...rest,
        name: `${template.name} (Copy)`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-diary-templates"] });
      toast({
        title: "Template duplicated",
        description: "The template has been duplicated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate template.",
        variant: "destructive",
      });
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/site-diary-templates/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to import templates");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-diary-templates"] });
      setIsImportDialogOpen(false);
      setSelectedFile(null);
      toast({
        title: "Import successful",
        description: data.message || `Imported ${data.templatesCreated} templates`,
      });
      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Some templates had errors",
          description: data.errors.join(", "),
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Filter templates
  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site Diary Templates</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage company-wide site diary templates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            data-testid="button-import-templates"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import from Excel
          </Button>
          <Button
            onClick={() => setIsAddingTemplate(true)}
            data-testid="button-add-template"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="input-search-templates"
        />
      </div>

      {/* Templates List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Loading templates...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-sm font-medium mb-2">
            {searchTerm ? "No templates found" : "No templates yet"}
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {searchTerm
              ? "Try adjusting your search terms"
              : "Start by adding your first template"}
          </p>
          {!searchTerm && (
            <Button 
              size="sm"
              onClick={() => setIsAddingTemplate(true)} 
              className="h-6 px-2 text-xs gap-1"
              data-testid="button-create-first-template"
            >
              <Plus className="h-3 w-3" />
              Add Your First Template
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTemplates.map((template) => (
            <div 
              key={template.id} 
              className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
              onClick={() => setEditingTemplate(template)}
              data-testid={`card-template-${template.id}`}
            >
              <div className="flex items-start gap-2">
                {/* Default indicator */}
                {template.isDefault && (
                  <div className="flex-shrink-0 pt-0.5">
                    <Star className="h-3 w-3 text-[#bba7db] fill-current" data-testid={`template-default-indicator-${template.id}`} />
                  </div>
                )}
                
                {/* Title and Description */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-1 line-clamp-1">
                    {template.name}
                  </h3>
                  {template.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {template.description}
                    </p>
                  )}
                </div>
                
                {/* Metadata */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Fields count */}
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    {(template.fields as any[]).length} {(template.fields as any[]).length === 1 ? 'field' : 'fields'}
                  </Badge>
                  
                  {/* Date */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span>
                      {format(new Date(template.updatedAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  
                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`button-menu-${template.id}`}
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!template.isDefault && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDefaultMutation.mutate(template.id);
                          }}
                          data-testid={`button-set-default-${template.id}`}
                        >
                          <Star className="h-4 w-4 mr-2" />
                          Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTemplate(template);
                        }}
                        data-testid={`button-edit-${template.id}`}
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateMutation.mutate(template);
                        }}
                        data-testid={`button-duplicate-${template.id}`}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(template.id);
                        }}
                        className="text-destructive"
                        data-testid={`button-delete-${template.id}`}
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

      {/* Add/Edit Template Dialog */}
      <TemplateFormDialog
        open={isAddingTemplate || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingTemplate(false);
            setEditingTemplate(null);
          }
        }}
        template={editingTemplate}
        onSuccess={() => {
          setIsAddingTemplate(false);
          setEditingTemplate(null);
        }}
      />

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
        setIsImportDialogOpen(open);
        if (!open) {
          setSelectedFile(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Site Diary Templates</DialogTitle>
            <DialogDescription>
              Upload an Excel file containing your site diary templates. The file should have columns for Template Name, Item Number, Field Title, Field Type, and Field Options.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              accept=".xlsx,.xls"
              className="hidden"
              data-testid="input-file-upload"
            />

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : selectedFile
                  ? "border-green-500 bg-green-500/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              data-testid="dropzone-file-upload"
            >
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-10 w-10 text-green-500" />
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                  >
                    Choose a different file
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">Drop your Excel file here</p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse
                  </p>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Expected Excel format:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Template Name - Name of the template</li>
                <li>Item Number - Field order (e.g., 1.0, 2.0)</li>
                <li>Field Title - Display name of the field</li>
                <li>Field Type - Text, Textarea, Multiple Choice, Date, etc.</li>
                <li>Field Options - Pipe-separated options (e.g., Yes|No)</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                setSelectedFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedFile && importMutation.mutate(selectedFile)}
              disabled={!selectedFile || importMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Templates
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
