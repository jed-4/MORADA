import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Settings,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import type { RfiTemplate, TemplateCategory } from "@shared/schema";

const CASVA_LILAC = '#bba7db';

const DIRECTED_TO_TYPES = [
  { value: "client", label: "Client" },
  { value: "architect", label: "Architect" },
  { value: "engineer", label: "Engineer" },
  { value: "consultant", label: "Consultant" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function RfiTemplateDetail() {
  const params = useParams<{ templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const { data: template, isLoading } = useQuery<RfiTemplate>({
    queryKey: ["/api/rfi-templates", params.templateId],
    queryFn: async () => {
      const res = await fetch(`/api/rfi-templates/${params.templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
    enabled: !!params.templateId,
  });

  const { data: categories = [] } = useQuery<TemplateCategory[]>({
    queryKey: ["/api/template-categories", "rfi"],
    queryFn: async () => {
      const response = await fetch("/api/template-categories?templateType=rfi");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<RfiTemplate>) => {
      return await apiRequest(`/api/rfi-templates/${params.templateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi-templates", params.templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfi-templates"] });
      toast({
        title: "Template updated",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  const getCategoryBreadcrumb = (categoryId: string | null | undefined): string => {
    if (!categoryId) return "";
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return "";
    
    const breadcrumbParts: string[] = [category.name];
    let currentCategory = category;
    
    while (currentCategory.parentId) {
      const parent = categories.find((c) => c.id === currentCategory.parentId);
      if (parent) {
        breadcrumbParts.unshift(parent.name);
        currentCategory = parent;
      } else {
        break;
      }
    }
    
    return breadcrumbParts.join(" / ");
  };

  const buildCategoryTree = () => {
    const rootCategories = categories.filter((c) => !c.parentId);
    const tree: { id: string; name: string; depth: number }[] = [];
    
    const addChildren = (parentId: string | null, depth: number) => {
      const children = categories.filter((c) => c.parentId === parentId);
      children.forEach((child) => {
        tree.push({ id: child.id, name: child.name, depth });
        addChildren(child.id, depth + 1);
      });
    };
    
    rootCategories.forEach((root) => {
      tree.push({ id: root.id, name: root.name, depth: 0 });
      addChildren(root.id, 1);
    });
    
    return tree;
  };

  const getPriorityLabel = (priority: string | undefined | null) => {
    return PRIORITIES.find(p => p.value === priority)?.label || 'Normal';
  };

  const getDirectedToLabel = (type: string | undefined | null) => {
    return DIRECTED_TO_TYPES.find(t => t.value === type)?.label || '';
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <HelpCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Template not found</p>
        <Button variant="outline" onClick={() => navigate("/rfi-templates")}>
          Back to RFI Templates
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/rfi-templates")}
            className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-semibold line-clamp-1" data-testid="text-template-name">
            {template.name}
          </h2>
          {getCategoryBreadcrumb(template.categoryId) && (
            <Badge variant="outline" className="text-xs">
              {getCategoryBreadcrumb(template.categoryId)}
            </Badge>
          )}
          {template.defaultPriority && (
            <Badge variant="secondary" className="text-xs">
              {getPriorityLabel(template.defaultPriority)}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-6 flex items-center justify-center rounded-md border hover-elevate"
            onClick={() => setSettingsDialogOpen(true)}
            data-testid="button-settings"
          >
            <Settings className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">Subject Template</h3>
            </div>
            <Textarea
              value={template.subjectTemplate || ""}
              onChange={(e) => updateMutation.mutate({ subjectTemplate: e.target.value })}
              placeholder="Enter the default subject line for RFIs using this template..."
              rows={2}
              className="text-sm"
              data-testid="input-subject-template"
            />
            <p className="text-xs text-muted-foreground mt-2">
              This will be the default subject line when creating an RFI from this template.
            </p>
          </div>

          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">Question Template</h3>
            </div>
            <Textarea
              value={template.questionTemplate || ""}
              onChange={(e) => updateMutation.mutate({ questionTemplate: e.target.value })}
              placeholder="Enter the default question/content for RFIs using this template..."
              rows={6}
              className="text-sm"
              data-testid="input-question-template"
            />
            <p className="text-xs text-muted-foreground mt-2">
              This will be the default question/content when creating an RFI from this template.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 bg-card">
              <Label className="text-xs font-medium mb-2 block">Default Directed To</Label>
              <Select
                value={template.defaultDirectedToType || "none"}
                onValueChange={(value) => updateMutation.mutate({ defaultDirectedToType: value === "none" ? null : value })}
              >
                <SelectTrigger data-testid="select-directed-to">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {DIRECTED_TO_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-4 bg-card">
              <Label className="text-xs font-medium mb-2 block">Default Priority</Label>
              <Select
                value={template.defaultPriority || "normal"}
                onValueChange={(value) => updateMutation.mutate({ defaultPriority: value })}
              >
                <SelectTrigger data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority.value} value={priority.value}>
                      {priority.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
            <DialogDescription>
              Update template name and category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={template.name}
                onChange={(e) => updateMutation.mutate({ name: e.target.value })}
                data-testid="input-settings-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={template.categoryId || "none"}
                onValueChange={(value) => updateMutation.mutate({ categoryId: value === "none" ? null : value })}
              >
                <SelectTrigger data-testid="select-settings-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {buildCategoryTree().map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span style={{ paddingLeft: `${cat.depth * 12}px` }}>
                        {cat.depth > 0 ? "└ " : ""}{cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={template.description || ""}
                onChange={(e) => updateMutation.mutate({ description: e.target.value })}
                placeholder="Brief description of this template..."
                rows={3}
                data-testid="input-settings-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
