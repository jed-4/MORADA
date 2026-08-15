import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Loader2 } from "lucide-react";
import type { ScopeItem, ScopeTemplate } from "@shared/schema";

// Add to Template Dialog Component
export interface AddToTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeItem: ScopeItem;
}

export function AddToTemplateDialog({ open, onOpenChange, scopeItem }: AddToTemplateDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplateCategory, setNewTemplateCategory] = useState("");

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<ScopeTemplate[]>({
    queryKey: ['/api/scope-templates'],
    enabled: open && !!user?.companyId,
  });

  // Add item to template mutation
  const addToTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return await apiRequest(`/api/scope-templates/${templateId}/add-item`, {
        method: 'POST',
        body: JSON.stringify({
          scopeItem: {
            title: scopeItem.title,
            description: scopeItem.description,
            itemType: scopeItem.itemType,
            quantity: scopeItem.quantity,
            rate: scopeItem.rate,
            gearChecklist: scopeItem.gearChecklist,
            stage: scopeItem.stage,
          },
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item added to template successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scope-templates'] });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add item to template",
        variant: "destructive",
      });
    },
  });

  // Create new template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/scope-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: newTemplateName,
          description: newTemplateDescription,
          category: newTemplateCategory || undefined,
          templateData: [{
            title: scopeItem.title,
            description: scopeItem.description,
            itemType: scopeItem.itemType,
            quantity: scopeItem.quantity,
            rate: scopeItem.rate,
            gearChecklist: scopeItem.gearChecklist,
            stage: scopeItem.stage,
          }],
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "New template created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/scope-templates'] });
      setShowNewTemplateDialog(false);
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create template",
        variant: "destructive",
      });
    },
  });

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddToTemplate = () => {
    if (selectedTemplateId) {
      addToTemplateMutation.mutate(selectedTemplateId);
    }
  };

  const handleCreateNewTemplate = () => {
    if (newTemplateName.trim()) {
      createTemplateMutation.mutate();
    }
  };

  if (showNewTemplateDialog) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>
              Create a new scope template with "{scopeItem.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Full Build, Bathroom Reno"
                data-testid="input-new-template-name"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Description (Optional)</Label>
              <Input
                id="template-description"
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Brief description"
                data-testid="input-new-template-description"
              />
            </div>
            <div>
              <Label htmlFor="template-category">Category (Optional)</Label>
              <Input
                id="template-category"
                value={newTemplateCategory}
                onChange={(e) => setNewTemplateCategory(e.target.value)}
                placeholder="e.g., Residential, Commercial"
                data-testid="input-new-template-category"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewTemplateDialog(false)}
              data-testid="button-cancel-new-template"
            >
              Back
            </Button>
            <Button
              onClick={handleCreateNewTemplate}
              disabled={!newTemplateName.trim() || createTemplateMutation.isPending}
              data-testid="button-create-template"
            >
              {createTemplateMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>) : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Template</DialogTitle>
          <DialogDescription>
            Select a template to add "{scopeItem.title}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-templates"
          />

          {/* Templates List */}
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Loading templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <EmptyState
              variant="inline"
              title={searchQuery ? "No templates match your search" : "No templates yet"}
              className="py-8"
            />
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`w-full text-left p-3 rounded border transition-all hover-elevate ${
                    selectedTemplateId === template.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border'
                  }`}
                  data-testid={`button-select-template-${template.id}`}
                >
                  <div className="font-medium text-sm">{template.name}</div>
                  {template.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {template.description}
                    </div>
                  )}
                  {template.category && (
                    <Badge variant="secondary" className="mt-1 h-4 text-data">
                      {template.category}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Create New Template Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowNewTemplateDialog(true)}
            data-testid="button-show-new-template"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Template
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-add-to-template"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddToTemplate}
            disabled={!selectedTemplateId || addToTemplateMutation.isPending}
            data-testid="button-confirm-add-to-template"
          >
            {addToTemplateMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</>) : "Add to Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddToTemplateDialog;
