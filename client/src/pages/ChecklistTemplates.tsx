import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  type ChecklistTemplate,
  type ChecklistTemplateGroup,
  type ChecklistTemplateItem,
  insertChecklistTemplateSchema,
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
  CheckSquare,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Copy,
  Upload,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { ChecklistTemplateFormDialog } from "@/components/checklist/ChecklistTemplateFormDialog";
import { ImportChecklistDialog } from "@/components/checklist/ImportChecklistDialog";

export default function ChecklistTemplates() {
  const [, setLocation] = useLocation();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { toast } = useToast();

  const handleTemplateCreated = (templateId: string) => {
    setLocation(`/checklist-templates/${templateId}`);
  };

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates"],
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/checklist-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
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
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/checklist-templates/${id}/duplicate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Template duplicated",
        description: "The template has been duplicated with all groups and items.",
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

  // Export mutation
  const handleExport = async () => {
    try {
      const response = await fetch("/api/checklist-templates/export");
      if (!response.ok) throw new Error("Failed to export");
      
      const data = await response.json();
      
      // Convert to CSV
      const headers = ["Template Name", "Description", "Type", "Group Name", "Item Description"];
      const csvRows = [
        headers.join(","),
        ...data.map((row: any) => [
          `"${row.templateName || ""}"`,
          `"${row.templateDescription || ""}"`,
          `"${row.type || ""}"`,
          `"${row.groupName || ""}"`,
          `"${row.itemDescription || ""}"`
        ].join(","))
      ];
      
      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checklist-templates-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: "Checklist templates have been exported to CSV.",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export checklist templates.",
        variant: "destructive",
      });
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Task": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "Job": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "Estimation": return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
      case "Lead": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      default: return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Checklist Templates</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage reusable checklist templates for tasks, jobs, estimations, and leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            data-testid="button-import-csv"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
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

      {/* Templates Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading templates...</p>
          </div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Get started by creating your first checklist template"}
            </p>
            {!searchTerm && (
              <Button onClick={() => setIsAddingTemplate(true)} data-testid="button-create-first-template">
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <Card 
              key={template.id} 
              className="hover-elevate cursor-pointer" 
              onClick={() => setLocation(`/checklist-templates/${template.id}`)}
              data-testid={`card-template-${template.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                      <Badge 
                        variant="secondary" 
                        className={getTypeColor(template.type)}
                        data-testid={`badge-type-${template.id}`}
                      >
                        {template.type}
                      </Badge>
                    </div>
                    {template.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`button-template-menu-${template.id}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateMutation.mutate(template.id);
                        }}
                        data-testid={`menu-duplicate-${template.id}`}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(template.id);
                        }}
                        className="text-destructive focus:text-destructive"
                        data-testid={`menu-delete-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CheckSquare className="h-4 w-4" />
                    <span>Click to view details</span>
                  </div>
                  {template.createdAt && (
                    <span>{format(new Date(template.createdAt), "MMM d, yyyy")}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Template Dialog */}
      <ChecklistTemplateFormDialog
        open={isAddingTemplate}
        onOpenChange={setIsAddingTemplate}
        onTemplateCreated={handleTemplateCreated}
      />

      {/* Import Dialog */}
      <ImportChecklistDialog 
        open={isImportOpen} 
        onOpenChange={setIsImportOpen} 
      />
    </div>
  );
}
