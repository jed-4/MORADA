import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type SelectionTemplate, type SelectionTemplateGroup } from "@shared/schema";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  Check,
  Layers,
  PlayCircle,
  FolderOpen,
  ChevronsUpDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
}

interface TemplateWithGroups extends SelectionTemplate {
  groups?: { id: string; name: string }[];
  groupIds?: string[];
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

function getOptionCount(template: TemplateWithGroups): number {
  const data = (template.templateData as any[]) || [];
  if (data.length === 0) return 0;
  if ('itemName' in data[0]) {
    return data.reduce((sum: number, item: any) => sum + (item.options?.length || 0), 0);
  }
  return data.length;
}

const initialFormData = {
  name: "",
  description: "",
  category: "",
  room: "",
  allowanceType: "" as "" | "PC" | "PS",
  budgetAmount: "" as number | "",
  deadline: "",
  clientCanSeePrice: true,
  clientCanChange: true,
  groupIds: [] as string[],
};

export default function SelectionTemplates() {
  const [, navigate] = useLocation();
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithGroups | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [groupBy, setGroupBy] = useState<"category" | "group" | "none">("category");
  const [isManagingGroups, setIsManagingGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupNameInline, setNewGroupNameInline] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_GROUPS_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [applyDialogTemplate, setApplyDialogTemplate] = useState<TemplateWithGroups | null>(null);
  const [applyMode, setApplyMode] = useState<"all" | "items">("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [applyProjectId, setApplyProjectId] = useState("");
  const [applyProjectSearch, setApplyProjectSearch] = useState("");
  const [groupsComboboxOpen, setGroupsComboboxOpen] = useState(false);
  const [groupsComboboxSearch, setGroupsComboboxSearch] = useState("");

  const { toast } = useToast();
  const { user } = useAuth();

  const [formData, setFormData] = useState({ ...initialFormData });

  const { data: templates = [], isLoading } = useQuery<TemplateWithGroups[]>({
    queryKey: ["/api/selection-templates"],
  });

  const { data: groups = [] } = useQuery<SelectionTemplateGroup[]>({
    queryKey: ["/api/selection-template-groups"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!applyDialogTemplate,
  });

  const { data: categoryFieldCategory } = useQuery<any>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
  });

  const categoryOptions = useMemo(() => {
    const fallback = [
      { id: "1", label: "Residential", value: "Residential" },
      { id: "2", label: "Commercial", value: "Commercial" },
      { id: "3", label: "Renovation", value: "Renovation" },
      { id: "4", label: "General", value: "General" },
    ];
    const raw: any[] = categoryFieldCategory?.options ?? [];
    if (raw.length > 0) {
      return raw
        .map((opt: any) => ({
          id: String(opt.id ?? opt.value ?? opt.label ?? ""),
          label: String(opt.label ?? opt.value ?? ""),
          value: String(opt.value ?? opt.label ?? ""),
        }))
        .filter(opt => opt.label)
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    return fallback;
  }, [categoryFieldCategory]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof initialFormData) => {
      return await apiRequest("/api/selection-templates", "POST", {
        name: data.name,
        description: data.description || undefined,
        category: data.category || undefined,
        room: data.room || undefined,
        allowanceType: data.allowanceType || undefined,
        budgetAmount: data.budgetAmount !== "" ? Math.round(Number(data.budgetAmount) * 100) : undefined,
        deadline: data.deadline || undefined,
        clientCanSeePrice: data.clientCanSeePrice,
        clientCanChange: data.clientCanChange,
        groupIds: data.groupIds,
        templateData: [],
        createdBy: user?.id,
        createdByName: user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : user?.email,
      });
    },
    onSuccess: (newTemplate: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      toast({ title: "Template created", description: "Your new selection template has been created." });
      setIsAddingTemplate(false);
      setFormData({ ...initialFormData });
      navigate(`/selection-templates/${newTemplate.id}`);
    },
    onError: () => toast({ title: "Error", description: "Failed to create template.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof initialFormData> }) => {
      return await apiRequest(`/api/selection-templates/${id}`, "PATCH", {
        ...data,
        budgetAmount: data.budgetAmount !== "" && data.budgetAmount != null
          ? Math.round(Number(data.budgetAmount) * 100)
          : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      toast({ title: "Template updated", description: "The template has been updated successfully." });
      setEditingTemplate(null);
      setFormData({ ...initialFormData });
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
    mutationFn: async (template: TemplateWithGroups) => {
      const { id, createdAt, updatedAt, isArchived, groups: _g, groupIds: _gIds, ...rest } = template as any;
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

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => apiRequest("/api/selection-template-groups", "POST", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-template-groups"] });
      setNewGroupName("");
    },
    onError: () => toast({ title: "Error", description: "Failed to create group.", variant: "destructive" }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      apiRequest(`/api/selection-template-groups/${id}`, "PATCH", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-template-groups"] });
      setEditingGroupId(null);
      setEditingGroupName("");
    },
    onError: () => toast({ title: "Error", description: "Failed to rename group.", variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/selection-template-groups/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/selection-template-groups"] }),
    onError: () => toast({ title: "Error", description: "Failed to delete group.", variant: "destructive" }),
  });

  const handleOpenAdd = () => {
    setFormData({ ...initialFormData });
    setNewGroupNameInline("");
    setIsAddingTemplate(true);
  };

  const handleOpenEdit = (template: TemplateWithGroups) => {
    const tAny = template as any;
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
      room: tAny.room || "",
      allowanceType: tAny.allowanceType || "",
      budgetAmount: tAny.budgetAmount ? tAny.budgetAmount / 100 : "",
      deadline: tAny.deadline || "",
      clientCanSeePrice: tAny.clientCanSeePrice ?? true,
      clientCanChange: tAny.clientCanChange ?? true,
      groupIds: tAny.groupIds || [],
    });
    setNewGroupNameInline("");
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
        data: formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const addGroupInline = (name: string) => {
    if (!name.trim()) return;
    createGroupMutation.mutate(name, {
      onSuccess: (newGroup: any) => {
        setFormData(prev => ({ ...prev, groupIds: [...prev.groupIds, newGroup.id] }));
        setNewGroupNameInline("");
      },
    });
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

  const openApplyDialog = (template: TemplateWithGroups) => {
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
    const data = (applyDialogTemplate.templateData as any[]) || [];
    const isOldFormat = data.length > 0 && 'itemName' in data[0];
    if (isOldFormat && applyMode === "items") {
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
        (t.name ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [templates, searchTerm]);

  const groupedTemplates = useMemo(() => {
    if (groupBy === "category") {
      const map = new Map<string, TemplateWithGroups[]>();
      for (const t of filteredTemplates) {
        const key = t.category || "General";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
      return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    }
    if (groupBy === "group") {
      const map = new Map<string, TemplateWithGroups[]>();
      for (const t of filteredTemplates) {
        const tGroups = (t.groups || []) as { id: string; name: string }[];
        if (tGroups.length === 0) {
          const key = "Ungrouped";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(t);
        } else {
          for (const g of tGroups) {
            if (!map.has(g.name)) map.set(g.name, []);
            map.get(g.name)!.push(t);
          }
        }
      }
      return [...map.entries()].sort(([a], [b]) => {
        if (a === "Ungrouped") return 1;
        if (b === "Ungrouped") return -1;
        return a.localeCompare(b);
      });
    }
    return null;
  }, [filteredTemplates, groupBy]);

  const filteredProjects = useMemo(() => {
    if (!applyProjectSearch) return projects;
    return projects.filter(p => p.name.toLowerCase().includes(applyProjectSearch.toLowerCase()));
  }, [projects, applyProjectSearch]);

  const applyItems = useMemo(() => {
    if (!applyDialogTemplate) return [];
    const data = (applyDialogTemplate.templateData as any[]) || [];
    if (data.length > 0 && 'itemName' in data[0]) {
      return data.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return [];
  }, [applyDialogTemplate]);

  const renderTemplateCard = (template: TemplateWithGroups) => {
    const tAny = template as any;
    const templateGroups = (template.groups || []) as { id: string; name: string }[];
    const optionCount = getOptionCount(template);

    return (
      <div key={template.id} className="border rounded-md bg-card mx-2 mb-2">
        <div className="flex items-center gap-2 p-3">
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
              {templateGroups.map(g => (
                <Badge key={g.id} variant="outline" className="h-4 px-1.5 text-data">
                  {g.name}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground">
                {optionCount} {optionCount === 1 ? "option" : "options"}
              </span>
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{template.description}</p>
            )}
            {(tAny.room || tAny.deadline || tAny.allowanceType) && (
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {tAny.room && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MapPin className="h-2.5 w-2.5" />{tAny.room}
                  </span>
                )}
                {tAny.deadline && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Calendar className="h-2.5 w-2.5" />{format(new Date(tAny.deadline), "d MMM")}
                  </span>
                )}
                {tAny.allowanceType && (
                  <Badge variant="outline" className="h-3.5 px-1 text-[10px]">
                    {tAny.allowanceType}{tAny.budgetAmount ? ` $${(tAny.budgetAmount / 100).toLocaleString("en-AU", { minimumFractionDigits: 0 })}` : ""}
                  </Badge>
                )}
              </div>
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
                Edit
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
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "category" | "group" | "none")}>
            <SelectTrigger className="h-6 text-xs w-28 px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="group">Group</SelectItem>
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
        ) : groupedTemplates ? (
          <div className="space-y-1">
            {groupedTemplates.map(([grpName, groupTemplates]) => {
              const isCollapsed = collapsedGroups.has(grpName);
              return (
                <div key={grpName}>
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 cursor-pointer hover-elevate mx-2 rounded-md mb-1"
                    onClick={() => toggleGroup(grpName)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    {groupBy === "group" ? (
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="font-semibold text-sm">{grpName}</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                      {groupBy === "group" ? "group" : "category"}
                    </span>
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
            setFormData({ ...initialFormData });
            setNewGroupNameInline("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingTemplate ? "Edit Template" : "Add Selection Item"}</DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the template details below."
                : "Create a new selection template. You'll be taken to the options editor after saving."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label htmlFor="name">Item Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Kitchen Benchtop"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(opt => (
                      <SelectItem key={opt.id} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="room">Room / Location</Label>
                <Input
                  id="room"
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  placeholder="e.g., Kitchen"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this selection item..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Allowance Type</Label>
                <Select
                  value={formData.allowanceType || "_none"}
                  onValueChange={(v) => setFormData({ ...formData, allowanceType: v === "_none" ? "" : v as "PC" | "PS" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    <SelectItem value="PC">Prime Cost (PC)</SelectItem>
                    <SelectItem value="PS">Provisional Sum (PS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">Budget Amount ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.budgetAmount}
                  onChange={(e) => setFormData({ ...formData, budgetAmount: e.target.value === "" ? "" : parseFloat(e.target.value) })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input
                id="deadline"
                type="date"
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              />
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal text-sm">Client can see price</Label>
                  <p className="text-xs text-muted-foreground">Show budget/cost to clients</p>
                </div>
                <Switch
                  checked={formData.clientCanSeePrice}
                  onCheckedChange={(v) => setFormData({ ...formData, clientCanSeePrice: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal text-sm">Client can change selection</Label>
                  <p className="text-xs text-muted-foreground">Allow clients to modify</p>
                </div>
                <Switch
                  checked={formData.clientCanChange}
                  onCheckedChange={(v) => setFormData({ ...formData, clientCanChange: v })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Groups</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setIsManagingGroups(true)}
                >
                  Manage groups
                </button>
              </div>
              <Popover open={groupsComboboxOpen} onOpenChange={setGroupsComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate text-sm">
                      {formData.groupIds.length === 0
                        ? "Select groups..."
                        : formData.groupIds.length === 1
                          ? (groups as SelectionTemplateGroup[]).find(g => g.id === formData.groupIds[0])?.name ?? "1 group"
                          : `${formData.groupIds.length} groups`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search or create group..."
                      value={groupsComboboxSearch}
                      onValueChange={setGroupsComboboxSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {groupsComboboxSearch.trim() ? (
                          <button
                            type="button"
                            className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left hover:bg-accent"
                            onClick={() => {
                              if (groupsComboboxSearch.trim()) {
                                addGroupInline(groupsComboboxSearch.trim());
                                setGroupsComboboxSearch("");
                              }
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Create &ldquo;{groupsComboboxSearch.trim()}&rdquo;
                          </button>
                        ) : (
                          <span className="px-3 py-2 text-sm text-muted-foreground block">No groups yet.</span>
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {(groups as SelectionTemplateGroup[]).map(g => (
                          <CommandItem
                            key={g.id}
                            value={g.name}
                            onSelect={() => {
                              setFormData(prev => ({
                                ...prev,
                                groupIds: prev.groupIds.includes(g.id)
                                  ? prev.groupIds.filter(id => id !== g.id)
                                  : [...prev.groupIds, g.id],
                              }));
                            }}
                          >
                            <Check
                              className={cn("mr-2 h-4 w-4", formData.groupIds.includes(g.id) ? "opacity-100" : "opacity-0")}
                            />
                            {g.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      {groupsComboboxSearch.trim() && (groups as SelectionTemplateGroup[]).some(g =>
                        g.name.toLowerCase().includes(groupsComboboxSearch.toLowerCase())
                      ) && (
                        <>
                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem
                              value={`__create__${groupsComboboxSearch}`}
                              onSelect={() => {
                                addGroupInline(groupsComboboxSearch.trim());
                                setGroupsComboboxSearch("");
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create &ldquo;{groupsComboboxSearch.trim()}&rdquo;
                            </CommandItem>
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {formData.groupIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {formData.groupIds.map(gId => {
                    const g = (groups as SelectionTemplateGroup[]).find(x => x.id === gId);
                    if (!g) return null;
                    return (
                      <Badge key={gId} variant="secondary" className="gap-1 pr-1">
                        {g.name}
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, groupIds: prev.groupIds.filter(id => id !== gId) }))}
                          className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        >
                          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddingTemplate(false);
                setEditingTemplate(null);
                setFormData({ ...initialFormData });
                setNewGroupNameInline("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : editingTemplate ? "Save Changes" : "Create & Edit Options"}
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
              {applyDialogTemplate?.name}
              {applyItems.length > 0
                ? ` — ${applyItems.length} item${applyItems.length !== 1 ? "s" : ""}`
                : " — will create 1 selection"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1">
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
                  {filteredProjects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {applyItems.length > 0 && (
              <div className="space-y-2">
                <Label>Apply Mode</Label>
                <RadioGroup value={applyMode} onValueChange={(v) => setApplyMode(v as "all" | "items")}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="mode-all" />
                    <Label htmlFor="mode-all" className="font-normal cursor-pointer">Apply all items</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="items" id="mode-items" />
                    <Label htmlFor="mode-items" className="font-normal cursor-pointer">Select specific items</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {applyItems.length > 0 && applyMode === "items" && (
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                {applyItems.map((item: any) => (
                  <label key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover-elevate cursor-pointer">
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
                      <span className="text-sm font-medium">{item.itemName}</span>
                      {item.options?.length > 0 && (
                        <span className="text-xs text-muted-foreground ml-2">{item.options.length} options</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogTemplate(null)}>Cancel</Button>
            <Button onClick={handleApply} disabled={applyMutation.isPending}>
              {applyMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</> : "Apply Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Groups Dialog */}
      <Dialog open={isManagingGroups} onOpenChange={setIsManagingGroups}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Groups</DialogTitle>
            <DialogDescription>Create and manage template groups for organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="New group name..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupName.trim()) {
                    createGroupMutation.mutate(newGroupName);
                  }
                }}
              />
              <Button
                size="sm"
                className="h-8"
                onClick={() => newGroupName.trim() && createGroupMutation.mutate(newGroupName)}
                disabled={!newGroupName.trim() || createGroupMutation.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {(groups as SelectionTemplateGroup[]).map(g => (
                <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border bg-card">
                  {editingGroupId === g.id ? (
                    <>
                      <Input
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        className="h-7 text-xs flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateGroupMutation.mutate({ id: g.id, name: editingGroupName });
                          if (e.key === "Escape") { setEditingGroupId(null); setEditingGroupName(""); }
                        }}
                      />
                      <Button size="sm" className="h-6 text-xs px-2" onClick={() => updateGroupMutation.mutate({ id: g.id, name: editingGroupName })}>
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1">{g.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.name); }}>
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteGroupMutation.mutate(g.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {groups.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No groups yet. Create one above.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsManagingGroups(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
