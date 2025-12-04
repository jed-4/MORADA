import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  type ChecklistTemplate,
} from "@shared/schema";
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
  Edit3,
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

  const { data: templates = [], isLoading } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/checklist-templates/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Checklist group deleted",
        description: "The checklist group has been archived successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete checklist group.",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/checklist-templates/${id}/duplicate`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-templates"] });
      toast({
        title: "Checklist group duplicated",
        description: "The checklist group has been duplicated with all checklists and items.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to duplicate checklist group.",
        variant: "destructive",
      });
    },
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/checklist-templates/export", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to export");
      
      const data = await response.json();
      
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

  const filteredTemplates = templates
    .filter(template =>
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.type.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

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
    <div className="h-full flex flex-col">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Title + Count */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Checklist Groups
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {templates.length} {templates.length === 1 ? 'group' : 'groups'}
          </Badge>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
            onClick={handleExport}
            data-testid="button-export-csv"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsImportOpen(true)}
            data-testid="button-import-csv"
          >
            <Upload className="w-3 h-3" />
            <span>Import</span>
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsAddingTemplate(true)}
            data-testid="button-add-template"
          >
            <Plus className="w-3 h-3" />
            <span>New Checklist Group</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        {/* Left: Search */}
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-templates"
            />
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading checklist groups...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchTerm ? "No checklist groups found" : "No checklist groups yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchTerm
                ? "Try adjusting your search terms"
                : "Start by adding your first checklist group"}
            </p>
            {!searchTerm && (
              <button 
                onClick={() => setIsAddingTemplate(true)} 
                className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
                data-testid="button-create-first-template"
              >
                <Plus className="h-3 w-3" />
                Add Your First Checklist Group
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTemplates.map((template) => (
              <div 
                key={template.id} 
                className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
                onClick={() => setLocation(`/checklist-templates/${template.id}`)}
                data-testid={`card-template-${template.id}`}
              >
                <div className="flex items-start gap-2">
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
                    {/* Type badge */}
                    <Badge 
                      variant="secondary" 
                      className={`h-4 px-1.5 text-[10px] ${getTypeColor(template.type)}`}
                      data-testid={`badge-type-${template.id}`}
                    >
                      {template.type}
                    </Badge>
                    
                    {/* Date */}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>
                        {template.createdAt ? format(new Date(template.createdAt), "MMM d, yyyy") : "-"}
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
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/checklist-templates/${template.id}`);
                          }}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateMutation.mutate(template.id);
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
      </div>

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
