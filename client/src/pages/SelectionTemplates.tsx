import { useMemo, useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type SelectionTemplate } from "@shared/schema";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckSquare,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Loader2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Calendar,
  DollarSign,
  Layers,
  PlayCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SelectionOptionMini {
  id: string;
  name: string;
  sortOrder: number;
}

interface SelectionItem {
  id: string;
  categoryName: string;
  itemName: string;
  description?: string;
  room?: string;
  allowanceType?: "PC" | "PS";
  budgetAmount?: number;
  deadline?: string | null;
  clientCanSeePrice?: boolean;
  clientCanChange?: boolean;
  notes?: string;
  sortOrder: number;
  options?: SelectionOptionMini[];
}

interface Project {
  id: string;
  name: string;
}

const COLLAPSED_GROUPS_KEY = "template-groups-collapsed";

function getCategoryColor(category: string | null | undefined) {
  switch (category?.toLowerCase()) {
    case "residential": return "bg-status-success-bg text-status-success dark:text-green-400";
    case "commercial": return "bg-status-info-bg text-status-info dark:text-blue-400";
    case "renovation": return "bg-status-warning-bg text-status-warning dark:text-orange-400";
    default: return "bg-muted text-secondary";
  }
}

function getItemsFromTemplate(template: SelectionTemplate): SelectionItem[] {
  const data = template.templateData as SelectionItem[] | null;
  return (data || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export default function SelectionTemplates() {
  const [, navigate] = useLocation();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SelectionTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [groupBy, setGroupBy] = useState<"category" | "none">("category");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_GROUPS_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());

  const [applyDialogTemplate, setApplyDialogTemplate] = useState<SelectionTemplate | null>(null);
  const [applyMode, setApplyMode] = useState<"all" | "items">("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [applyProjectId, setApplyProjectId] = useState("");
  const [applyProjectSearch, setApplyProjectSearch] = useState("");

  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
  });

  const { data: templates = [], isLoading } = useQuery<SelectionTemplate[]>({
    queryKey: ["/api/selection-templates"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!applyDialogTemplate,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; category?: string }) => {
      return await apiRequest("/api/selection-templates", "POST", {
        ...data,
        templateData: [],
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      toast({ title: "Template created", description: "Your new selection template has been created." });
      setIsAddingTemplate(false);
      setFormData({ name: "", description: "", category: "" });
    },
    onError: () => toast({ title: "Error", description: "Failed to create template.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SelectionTemplate> }) => {
      return await apiRequest(`/api/selection-templates/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      toast({ title: "Template updated", description: "The template has been updated successfully." });
      setEditingTemplate(null);
      setFormData({ name: "", description: "", category: "" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update template.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/selection-templates/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      toast({ title: "Template deleted", description: "The template has been deleted successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete template.", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: SelectionTemplate) => {
      const { id, createdAt, updatedAt, isArchived, ...rest } = template;
      return await apiRequest("/api/selection-templates", "POST", {
        ...rest,
        name: `${template.name} (Copy)`,
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      toast({ title: "Template duplicated", description: "The template has been duplicated successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to duplicate template.", variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async ({ templateId, projectId, itemIds }: { templateId: string; projectId: string; itemIds?: string[] }) => {
      if (itemIds) {
        return await apiRequest(`/api/selection-templates/${templateId}/apply-items`, "POST", { projectId, itemIds });
      }
      return await apiRequest(`/api/selection-templates/${templateId}/apply`, "POST", { projectId });
    },
    onSuccess: (data, variables) => {
      const project = projects.find(p => p.id === variables.projectId);
      toast({
        title: "Template applied",
        description: `${data.created} selection${data.created !== 1 ? "s" : ""} added to ${project?.name || "project"}.`,
      });
      setApplyDialogTemplate(null);
      setApplyProjectId("");
      setSelectedItemIds(new Set());
      setApplyMode("all");
    },
    onError: () => toast({ title: "Error", description: "Failed to apply template.", variant: "destructive" }),
  });

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "", category: "" });
    setIsAddingTemplate(true);
  };

  const handleOpenEdit = (template: SelectionTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
    });
    setEditingTemplate(template);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ title: "Validation error", description: "Template name is required.", variant: "destructive" });
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({
        id: editingTemplate.id,
        data: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          category: formData.category || undefined,
        },
      });
    } else {
      createMutation.mutate({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        category: formData.category || undefined,
      });
    }
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      try { localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const toggleExpand = (templateId: string) => {
    setExpandedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  const openApplyDialog = (template: SelectionTemplate) => {
    setApplyDialogTemplate(template);
    setApplyMode("all");
    setSelectedItemIds(new Set());
    setApplyProjectId("");
    setApplyProjectSearch("");
  };

  const handleApply = () => {
    if (!applyProjectId) {
      toast({ title: "Select a project", description: "Please select a project to apply the template to.", variant: "destructive" });
      return;
    }
    if (!applyDialogTemplate) return;
    if (applyMode === "items") {
      if (selectedItemIds.size === 0) {
        toast({ title: "Select items", description: "Please select at least one item to apply.", variant: "destructive" });
        return;
      }
      applyMutation.mutate({ templateId: applyDialogTemplate.id, projectId: applyProjectId, itemIds: [...selectedItemIds] });
    } else {
      applyMutation.mutate({ templateId: applyDialogTemplate.id, projectId: applyProjectId });
    }
  };

  const filteredTemplates = useMemo(() => {
    return templates
      .filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, searchTerm]);

  const groupedTemplates = useMemo(() => {
    if (groupBy !== "category") return null;
    const groups = new Map<string, SelectionTemplate[]>();
    for (const t of filteredTemplates) {
      const key = t.category || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTemplates, groupBy]);

  const filteredProjects = useMemo(() => {
    if (!applyProjectSearch) return projects;
    return projects.filter(p => p.name.toLowerCase().includes(applyProjectSearch.toLowerCase()));
  }, [projects, applyProjectSearch]);

  const applyItems = useMemo(() => {
    if (!applyDialogTemplate) return [];
    return getItemsFromTemplate(applyDialogTemplate);
  }, [applyDialogTemplate]);

  const renderTemplateCard = (template: SelectionTemplate) => {
    const items = getItemsFromTemplate(template);
    const itemCount = items.length;
    const isExpanded = expandedTemplates.has(template.id);

    return (
      <div key={template.id} className="border rounded-md bg-card mx-2 mb-2">
        <div className="flex items-center gap-2 p-3">
          <button
            className="flex-shrink-0 text-muted-foreground hover-elevate rounded p-0.5"
            onClick={() => toggleExpand(template.id)}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => navigate(`/selection-templates/${template.id}`)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{template.name}</span>
              {template.category && (
                <Badge variant="secondary" className={cn("h-4 px-1.5 text-data", getCategoryColor(template.category))}>
                  {template.category}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{template.description}</p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); openApplyDialog(template); }}
          >
            <PlayCircle className="h-3 w-3 mr-1" />
            Apply
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/selection-templates/${template.id}`); }}>
                <Edit3 className="h-4 w-4 mr-2" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenEdit(template); }}>
                <Edit3 className="h-4 w-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(template); }}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(template.id); }}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && items.length > 0 && (
          <div className="border-t">
            {items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex items-center gap-2 px-4 py-2 border-b last:border-b-0 hover-elevate cursor-pointer"
                onClick={() => item.id && navigate(`/selection-templates/${template.id}/items/${item.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{item.itemName}</span>
                    {item.categoryName && (
                      <Badge variant="secondary" className="h-3.5 px-1 text-[10px]">{item.categoryName}</Badge>
                    )}
                    {item.allowanceType && (
                      <Badge variant="outline" className="h-3.5 px-1 text-[10px]">{item.allowanceType}</Badge>
                    )}
                    {item.room && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5" />{item.room}
                      </span>
                    )}
                    {item.deadline && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Calendar className="h-2.5 w-2.5" />
                        {format(new Date(item.deadline), "d MMM")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.budgetAmount && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <DollarSign className="h-2.5 w-2.5" />
                      {(item.budgetAmount / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}
                    </span>
                  )}
                  {(item.options?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="h-3.5 px-1 text-[10px]">
                      {item.options!.length} {item.options!.length === 1 ? "option" : "options"}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isExpanded && items.length === 0 && (
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            No items in this template yet.{" "}
            <button className="underline hover:no-underline" onClick={() => navigate(`/selection-templates/${template.id}`)}>
              Add items
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Row 1 - Breadcrumb */}
      <div className="h-9 bg-background flex items-center px-3 gap-1.5 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Templates</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="text-xs font-semibold">Selections</span>
      </div>

      {/* Row 2 - Search, Group By & New Template */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Group by</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "category" | "none")}>
            <SelectTrigger className="h-6 text-xs w-32 px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category">Template Group</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:opacity-90 active-elevate-2 flex items-center gap-0.5"
            onClick={handleOpenAdd}
          >
            <Plus className="w-3 h-3" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto py-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading templates...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8">
            <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-sm font-medium mb-2">
              {searchTerm ? "No templates found" : "No templates yet"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {searchTerm ? "Try adjusting your search terms" : "Start by adding your first selection template"}
            </p>
            {!searchTerm && (
              <button
                onClick={handleOpenAdd}
                className="h-6 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 mx-auto"
              >
                <Plus className="h-3 w-3" />
                Add Your First Template
              </button>
            )}
          </div>
        ) : groupBy === "category" && groupedTemplates ? (
          <div className="space-y-1">
            {groupedTemplates.map(([group, groupTemplates]) => {
              const isCollapsed = collapsedGroups.has(group);
              return (
                <div key={group}>
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 cursor-pointer hover-elevate mx-2 rounded-md mb-1"
                    onClick={() => toggleGroup(group)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="font-semibold text-sm">{group}</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">group</span>
                    <Badge variant="outline" className="h-4 text-data ml-auto">
                      {groupTemplates.length} {groupTemplates.length === 1 ? "template" : "templates"}
                    </Badge>
                  </div>
                  {!isCollapsed && (
                    <div>{groupTemplates.map(renderTemplateCard)}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div>{filteredTemplates.map(renderTemplateCard)}</div>
        )}
      </div>

      {/* Add/Edit Template Dialog */}
      <Dialog
        open={isAddingTemplate || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingTemplate(false);
            setEditingTemplate(null);
            setFormData({ name: "", description: "", category: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Selection Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update the template details below." : "Create a new selection template to reuse across projects."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard Kitchen Selections"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Template Group</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Residential">Residential</SelectItem>
                  <SelectItem value="Commercial">Commercial</SelectItem>
                  <SelectItem value="Renovation">Renovation</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the template..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddingTemplate(false); setEditingTemplate(null); setFormData({ name: "", description: "", category: "" }); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply to Project Dialog */}
      <Dialog open={!!applyDialogTemplate} onOpenChange={(open) => { if (!open) setApplyDialogTemplate(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Apply Template to Project</DialogTitle>
            <DialogDescription>
              {applyDialogTemplate?.name} — {applyItems.length} item{applyItems.length !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            {/* Project picker */}
            <div className="space-y-2">
              <Label>Project *</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={applyProjectSearch}
                  onChange={(e) => setApplyProjectSearch(e.target.value)}
                  className="pl-8 h-8 text-sm mb-1"
                />
              </div>
              <Select value={applyProjectId} onValueChange={setApplyProjectId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Apply mode */}
            <div className="space-y-2">
              <Label>What to apply</Label>
              <RadioGroup value={applyMode} onValueChange={(v) => setApplyMode(v as "all" | "items")} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="apply-all" />
                  <Label htmlFor="apply-all" className="text-sm font-normal cursor-pointer">
                    Apply entire template ({applyItems.length} item{applyItems.length !== 1 ? "s" : ""})
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="items" id="apply-select" />
                  <Label htmlFor="apply-select" className="text-sm font-normal cursor-pointer">
                    Select specific items
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Item selection */}
            {applyMode === "items" && (
              <div className="space-y-1 border rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                  <span className="text-xs font-medium text-muted-foreground">
                    {selectedItemIds.size} of {applyItems.length} selected
                  </span>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      if (selectedItemIds.size === applyItems.length) {
                        setSelectedItemIds(new Set());
                      } else {
                        setSelectedItemIds(new Set(applyItems.map(i => i.id)));
                      }
                    }}
                  >
                    {selectedItemIds.size === applyItems.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {applyItems.map((item, idx) => (
                    <label
                      key={item.id || idx}
                      className="flex items-center gap-3 px-3 py-2 hover-elevate cursor-pointer border-b last:border-b-0"
                    >
                      <Checkbox
                        checked={selectedItemIds.has(item.id)}
                        onCheckedChange={(checked) => {
                          setSelectedItemIds(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{item.itemName}</span>
                        {item.categoryName && (
                          <span className="text-xs text-muted-foreground ml-2">{item.categoryName}</span>
                        )}
                      </div>
                      {(item.options?.length ?? 0) > 0 && (
                        <Badge variant="outline" className="h-4 text-[10px]">
                          {item.options!.length} opts
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 pt-2">
            <Button variant="outline" onClick={() => setApplyDialogTemplate(null)}>Cancel</Button>
            <Button
              onClick={handleApply}
              disabled={applyMutation.isPending || !applyProjectId}
            >
              {applyMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Apply {applyMode === "all" ? `All ${applyItems.length}` : `${selectedItemIds.size}`} Item{(applyMode === "all" ? applyItems.length : selectedItemIds.size) !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
