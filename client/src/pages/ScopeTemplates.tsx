import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreVertical, Trash2, Edit3, Copy, Layers } from "lucide-react";
import type { ScopeTemplate } from "@shared/schema";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export default function ScopeTemplates() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ScopeTemplate | null>(null);

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    category: "",
  });

  const { data: templates = [], isLoading } = useQuery<ScopeTemplate[]>({
    queryKey: ["/api/scope-templates"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; category: string }) => {
      return await apiRequest("/api/scope-templates", "POST", {
        name: data.name,
        description: data.description,
        category: data.category,
        templateData: [],
      });
    },
    onSuccess: (template: ScopeTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
      setCreateDialogOpen(false);
      setNewTemplate({ name: "", description: "", category: "" });
      toast({
        title: "Template created",
        description: "Your scope template has been created successfully.",
      });
      navigate(`/scope-templates/${template.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description: string; category: string }) => {
      return await apiRequest(`/api/scope-templates/${data.id}`, "PATCH", {
        name: data.name,
        description: data.description,
        category: data.category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
      setEditDialogOpen(false);
      setSelectedTemplate(null);
      toast({
        title: "Template updated",
        description: "Your scope template has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/scope-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
      toast({
        title: "Template deleted",
        description: "Your scope template has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete template. Please try again.",
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: ScopeTemplate) => {
      return await apiRequest("/api/scope-templates", "POST", {
        name: `${template.name} (Copy)`,
        description: template.description,
        category: template.category,
        templateData: template.templateData,
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scope-templates"] });
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

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTemplate = () => {
    if (!newTemplate.name.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a template name.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(newTemplate);
  };

  const handleUpdateTemplate = () => {
    if (!selectedTemplate) return;
    updateMutation.mutate({
      id: selectedTemplate.id,
      name: selectedTemplate.name,
      description: selectedTemplate.description || "",
      category: selectedTemplate.category || "",
    });
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplate) return;
    deleteMutation.mutate(selectedTemplate.id);
  };

  const getItemCount = (template: ScopeTemplate) => {
    return (template.templateData as any[])?.length || 0;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      residential: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      commercial: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      renovation: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    };
    return colors[category.toLowerCase()] || "";
  };

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Title and Count (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Scope Templates
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-template-count">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-add-template"
          >
            <Plus className="w-3 h-3" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Search (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchQuery ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchQuery
                ? "Try adjusting your search terms"
                : "Start by adding your first scope template"}
            </p>
            {!searchQuery && (
              <button 
                onClick={() => setCreateDialogOpen(true)} 
                className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
                data-testid="button-create-first-template"
              >
                <Plus className="h-3 w-3" />
                Create Template
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTemplates.map((template) => (
              <div 
                key={template.id} 
                className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
                onClick={() => navigate(`/scope-templates/${template.id}`)}
                data-testid={`card-template-${template.id}`}
              >
                <div className="flex items-start gap-2">
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
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {template.category && (
                      <Badge 
                        variant="secondary" 
                        className={`h-4 px-1.5 text-[10px] ${getCategoryColor(template.category)}`}
                      >
                        {template.category}
                      </Badge>
                    )}

                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {getItemCount(template)} {getItemCount(template) === 1 ? 'item' : 'items'}
                    </Badge>
                    
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>
                        {format(new Date(template.updatedAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    
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
                            navigate(`/scope-templates/${template.id}`);
                          }}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Edit3 className="h-4 w-4 mr-2" />
                          View / Edit
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
                            setSelectedTemplate(template);
                            setDeleteDialogOpen(true);
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

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-template">
          <DialogHeader>
            <DialogTitle>Create Scope Template</DialogTitle>
            <DialogDescription>
              Create a new scope template that can be reused across projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                placeholder="e.g., Residential Build"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Input
                id="template-category"
                placeholder="e.g., Residential, Commercial"
                value={newTemplate.category}
                onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                data-testid="input-template-category"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                placeholder="Describe what this template is for..."
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                rows={3}
                data-testid="input-template-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={createMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-template">
          <DialogHeader>
            <DialogTitle>Edit Scope Template</DialogTitle>
            <DialogDescription>
              Update the template name, category, or description.
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-template-name">Template Name *</Label>
                <Input
                  id="edit-template-name"
                  value={selectedTemplate.name}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, name: e.target.value })
                  }
                  data-testid="input-edit-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-template-category">Category</Label>
                <Input
                  id="edit-template-category"
                  value={selectedTemplate.category || ""}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, category: e.target.value })
                  }
                  data-testid="input-edit-template-category"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-template-description">Description</Label>
                <Textarea
                  id="edit-template-description"
                  value={selectedTemplate.description || ""}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, description: e.target.value })
                  }
                  rows={3}
                  data-testid="input-edit-template-description"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTemplate}
              disabled={updateMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending ? "Updating..." : "Update Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-template">
          <DialogHeader>
            <DialogTitle>Delete Scope Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedTemplate?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTemplate}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
