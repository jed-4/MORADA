import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import {
  type ChecklistInstance,
  type ChecklistInstanceGroup,
  type ChecklistInstanceItem,
  type ChecklistTemplate,
  type ChecklistTemplateGroup,
  type User,
  type ScheduleItem,
} from "@shared/schema";

type Task = {
  id: string;
  title: string;
  projectId: string | null;
};

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ListChecks,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  User as UserIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Filter,
  ClipboardList,
  Check,
  X,
  Link2,
  FolderOpen,
  Square,
  CheckSquare,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TabType = "upcoming" | "action" | "done";

type ChecklistGroupWithCounts = ChecklistInstanceGroup & {
  completedCount?: number;
  totalCount?: number;
};

export default function ProjectChecklists() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [openLinkPopover, setOpenLinkPopover] = useState<string | null>(null);
  
  // Collapsed state - track which are collapsed (default: all expanded)
  const [collapsedInstances, setCollapsedInstances] = useState<Set<string>>(new Set());
  const [expandedChecklists, setExpandedChecklists] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState({
    templateId: "",
    name: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    dueDate: "",
    assigneeId: "",
    selectedGroupIds: [] as string[],
  });

  // Fetch checklist instances (these are "Checklist Groups" in user terminology)
  const { data: instances = [], isLoading } = useQuery<ChecklistInstance[]>({
    queryKey: ["/api/checklist-instances", { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instances?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch checklist groups");
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch all groups for all instances
  const { data: allGroups = [] } = useQuery<ChecklistGroupWithCounts[]>({
    queryKey: ["/api/checklist-instance-groups", { projectId }],
    queryFn: async () => {
      const groupPromises = instances.map(async (instance) => {
        const res = await fetch(`/api/checklist-instances/${instance.id}/groups`, {
          credentials: "include",
        });
        if (!res.ok) return [];
        return res.json();
      });
      const groupArrays = await Promise.all(groupPromises);
      return groupArrays.flat();
    },
    enabled: instances.length > 0,
  });

  // Fetch items for expanded checklists - use stable key for invalidation
  const expandedChecklistIds = Array.from(expandedChecklists);
  const { data: checklistItems = {} } = useQuery<Record<string, ChecklistInstanceItem[]>>({
    queryKey: ["/api/checklist-items", { projectId, expandedIds: expandedChecklistIds.sort().join(',') }],
    queryFn: async () => {
      const itemsMap: Record<string, ChecklistInstanceItem[]> = {};
      const groupsToFetch = allGroups.filter(g => expandedChecklists.has(g.id));
      const instanceIds = [...new Set(groupsToFetch.map(g => g.instanceId))];
      
      await Promise.all(instanceIds.map(async (instanceId) => {
        const res = await fetch(`/api/checklist-instances/${instanceId}/items`, {
          credentials: "include",
        });
        if (res.ok) {
          const items: ChecklistInstanceItem[] = await res.json();
          items.forEach(item => {
            if (item.groupId && expandedChecklists.has(item.groupId)) {
              if (!itemsMap[item.groupId]) {
                itemsMap[item.groupId] = [];
              }
              itemsMap[item.groupId].push(item);
            }
          });
        }
      }));
      return itemsMap;
    },
    enabled: expandedChecklistIds.length > 0 && allGroups.length > 0,
  });

  const { data: templates = [] } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates"],
  });

  const { data: teamMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: templateGroups = [] } = useQuery<ChecklistTemplateGroup[]>({
    queryKey: ["/api/checklist-templates", formData.templateId, "groups"],
    queryFn: async () => {
      if (!formData.templateId) return [];
      const res = await fetch(`/api/checklist-templates/${formData.templateId}/groups`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template groups");
      return res.json();
    },
    enabled: !!formData.templateId,
  });

  const { data: projectTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: scheduleItems = [] } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/projects", projectId, "schedule-items"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/schedule-items`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("/api/checklist-instances", "POST", {
        ...data,
        projectId,
        assigneeName: teamMembers.find(u => u.id === data.assigneeId)?.name,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        selectedGroupIds: data.selectedGroupIds.length > 0 ? data.selectedGroupIds : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", { projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instance-groups", { projectId }] });
      toast({ title: "Checklist Group created", description: "The checklist group has been created successfully." });
      setShowAddDialog(false);
      setFormData({ templateId: "", name: "", description: "", priority: "medium", dueDate: "", assigneeId: "", selectedGroupIds: [] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create checklist group.", variant: "destructive" });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/checklist-instances/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", { projectId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instance-groups", { projectId }] });
      toast({ title: "Checklist Group deleted", description: "The checklist group has been deleted." });
      setShowDeleteConfirm(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete checklist group.", variant: "destructive" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ groupId, data }: { groupId: string; data: Partial<ChecklistInstanceGroup> }) => {
      await apiRequest(`/api/checklist-instance-groups/${groupId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instance-groups", { projectId }] });
      setOpenLinkPopover(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update checklist.", variant: "destructive" });
      setOpenLinkPopover(null);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<ChecklistInstanceItem> }) => {
      await apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", data);
    },
    onSuccess: () => {
      // Invalidate all checklist items queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key.length > 0 && key[0] === "/api/checklist-items";
        }
      });
    },
  });

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setFormData({
        ...formData,
        templateId,
        name: template.name,
        description: template.description || "",
        selectedGroupIds: [],
      });
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedGroupIds: prev.selectedGroupIds.includes(groupId)
        ? prev.selectedGroupIds.filter(id => id !== groupId)
        : [...prev.selectedGroupIds, groupId],
    }));
  };

  const selectAllGroups = () => {
    setFormData(prev => ({
      ...prev,
      selectedGroupIds: templateGroups.map(g => g.id),
    }));
  };

  const clearGroupSelection = () => {
    setFormData(prev => ({
      ...prev,
      selectedGroupIds: [],
    }));
  };

  const handleCreateChecklist = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name required", description: "Please enter a name.", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const toggleInstanceCollapse = (instanceId: string) => {
    setCollapsedInstances(prev => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
  };

  const toggleChecklistExpand = (checklistId: string) => {
    setExpandedChecklists(prev => {
      const next = new Set(prev);
      if (next.has(checklistId)) {
        next.delete(checklistId);
      } else {
        next.add(checklistId);
      }
      return next;
    });
  };

  const filteredGroups = useMemo(() => {
    return allGroups.filter(group => {
      if (activeTab === "upcoming" && group.status !== "active") return false;
      if (activeTab === "action" && group.status !== "in_progress") return false;
      if (activeTab === "done" && group.status !== "completed") return false;
      
      if (searchTerm && !group.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (assigneeFilter !== "all" && group.assigneeId !== assigneeFilter) return false;
      
      return true;
    });
  }, [allGroups, activeTab, searchTerm, assigneeFilter]);

  const groupedByInstance = useMemo(() => {
    const grouped: Record<string, { instance: ChecklistInstance; groups: ChecklistGroupWithCounts[] }> = {};
    
    filteredGroups.forEach(group => {
      const instance = instances.find(i => i.id === group.instanceId);
      if (!instance) return;
      
      if (!grouped[instance.id]) {
        grouped[instance.id] = { instance, groups: [] };
      }
      grouped[instance.id].groups.push(group);
    });
    
    Object.values(grouped).forEach(({ groups }) => {
      groups.sort((a, b) => (a.order || 0) - (b.order || 0));
    });
    
    return Object.values(grouped).sort((a, b) => 
      a.instance.name.localeCompare(b.instance.name)
    );
  }, [filteredGroups, instances]);

  const upcomingCount = allGroups.filter(g => g.status === "active").length;
  const actionCount = allGroups.filter(g => g.status === "in_progress").length;
  const doneCount = allGroups.filter(g => g.status === "completed").length;

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return <Badge className={`${styles[priority] || styles.medium} text-[10px] px-1.5 py-0`}>{priority}</Badge>;
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Done";
      case "in_progress": return "Action";
      default: return "Upcoming";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "in_progress":
        return "bg-[#bba7db]/20 text-[#bba7db]";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  const getNextStatus = (currentStatus: string): { status: string; completionData: Partial<ChecklistInstanceGroup> } => {
    const now = new Date().toISOString();
    switch (currentStatus) {
      case "active":
        return { status: "in_progress", completionData: {} };
      case "in_progress":
        return { 
          status: "completed", 
          completionData: { 
            completedAt: now,
            completedBy: user?.id || null,
            completedByName: user?.name || null,
          } 
        };
      case "completed":
        return { 
          status: "active", 
          completionData: { 
            completedAt: null,
            completedBy: null,
            completedByName: null,
          } 
        };
      default:
        return { status: "in_progress", completionData: {} };
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Title & Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">Checklists</h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-checklist-count">
            {allGroups.length} groups
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowAddDialog(true)}
            data-testid="button-add-checklist"
          >
            <Plus className="h-3 w-3" />
            Add Checklist Group
          </button>
        </div>
      </div>

      {/* Row 2: Tabs */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-0.5" data-testid="tabs-checklist-status">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "upcoming"
                ? "bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90"
                : "hover-elevate"
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-upcoming"
          >
            Upcoming
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{upcomingCount}</Badge>
          </button>
          <button
            onClick={() => setActiveTab("action")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "action"
                ? "bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90"
                : "hover-elevate"
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-action"
          >
            Action
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{actionCount}</Badge>
          </button>
          <button
            onClick={() => setActiveTab("done")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "done"
                ? "bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90"
                : "hover-elevate"
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-done"
          >
            Done
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{doneCount}</Badge>
          </button>
        </div>
      </div>

      {/* Row 3: Search & Filters */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search"
            />
          </div>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-6 w-auto text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
              <Filter className="h-3 w-3" />
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {teamMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <ClipboardList className="h-12 w-12 opacity-50" />
            <p className="text-sm">
              {activeTab === "upcoming" 
                ? "No upcoming checklists" 
                : activeTab === "action"
                  ? "No checklists in action"
                  : "No completed checklists"}
            </p>
            {activeTab !== "done" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(true)}
                data-testid="button-add-first-checklist"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Checklist Group
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByInstance.map(({ instance, groups }) => {
              const isCollapsed = collapsedInstances.has(instance.id);
              
              return (
                <div key={instance.id} className="space-y-3">
                  {/* Checklist Group Header - Collapsible */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border/60 rounded-md cursor-pointer hover:bg-muted/50 transition-all"
                    onClick={() => toggleInstanceCollapse(instance.id)}
                    data-testid={`instance-header-${instance.id}`}
                  >
                    <div className={`transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <FolderOpen className="h-4 w-4 text-[#bba7db]" />
                    <span className="text-sm font-medium flex-1">{instance.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {groups.length} checklists
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${projectId}/checklists/${instance.id}`);
                          }}
                        >
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(instance.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete Group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  {/* Checklists Grid - only show if not collapsed */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 ml-2 pl-4 border-l-2 border-[#bba7db]/30">
                      {groups.map((group) => {
                        const isExpanded = expandedChecklists.has(group.id);
                        const items = checklistItems[group.id] || [];
                        const completedItems = items.filter(i => i.isCompleted).length;
                        
                        return (
                          <div
                            key={group.id}
                            className={`rounded-md border-2 bg-muted/20 transition-all ${
                              group.status === "in_progress" 
                                ? "border-l-4 border-l-[#bba7db] border-t-border/80 border-r-border/80 border-b-border/80 bg-[#bba7db]/5" 
                                : "border-border/60"
                            }`}
                            data-testid={`checklist-card-${group.id}`}
                          >
                            {/* Checklist Header */}
                            <div
                              className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                              onClick={() => toggleChecklistExpand(group.id)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <div className={`transition-transform duration-200 mt-0.5 ${isExpanded ? 'rotate-90' : ''}`}>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      <span className="font-semibold text-sm">{group.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Badge 
                                        className={`${getStatusBadgeClass(group.status)} text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const { status, completionData } = getNextStatus(group.status);
                                          updateGroupMutation.mutate({
                                            groupId: group.id,
                                            data: { status, ...completionData }
                                          });
                                        }}
                                        data-testid={`status-toggle-${group.id}`}
                                      >
                                        {getStatusLabel(group.status)}
                                      </Badge>
                                      {getPriorityBadge(group.priority || "medium")}
                                      {(group.linkedTaskId || group.linkedScheduleItemId) && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#bba7db]/10 text-[#bba7db] text-[10px]">
                                          <Link2 className="h-3 w-3" />
                                          Linked
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  {/* Quick Assignee */}
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`button-quick-assign-${group.id}`}>
                                        {group.assigneeName ? (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Avatar className="h-5 w-5">
                                                <AvatarFallback className="text-[10px] bg-[#bba7db]/20 text-[#bba7db]">
                                                  {group.assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                              </Avatar>
                                            </TooltipTrigger>
                                            <TooltipContent>{group.assigneeName}</TooltipContent>
                                          </Tooltip>
                                        ) : (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <div className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center">
                                                <UserIcon className="h-3 w-3 text-muted-foreground/50" />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent>Assign someone</TooltipContent>
                                          </Tooltip>
                                        )}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-48 p-1" align="end">
                                      <div className="text-xs font-medium text-muted-foreground px-2 py-1">Assign to</div>
                                      <div className="max-h-48 overflow-auto">
                                        {group.assigneeId && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-start text-xs text-muted-foreground"
                                            onClick={() => {
                                              updateGroupMutation.mutate({ 
                                                groupId: group.id, 
                                                data: { assigneeId: null, assigneeName: null }
                                              });
                                            }}
                                          >
                                            <X className="h-3 w-3 mr-2" />
                                            Unassign
                                          </Button>
                                        )}
                                        {teamMembers.map((member) => (
                                          <Button
                                            key={member.id}
                                            variant="ghost"
                                            size="sm"
                                            className={`w-full justify-start text-xs ${group.assigneeId === member.id ? 'bg-accent' : ''}`}
                                            onClick={() => {
                                              updateGroupMutation.mutate({ 
                                                groupId: group.id, 
                                                data: { assigneeId: member.id, assigneeName: member.name }
                                              });
                                            }}
                                          >
                                            <Avatar className="h-4 w-4 mr-2">
                                              <AvatarFallback className="text-[8px] bg-[#bba7db]/20 text-[#bba7db]">
                                                {member.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                              </AvatarFallback>
                                            </Avatar>
                                            {member.name}
                                            {group.assigneeId === member.id && (
                                              <Check className="h-3 w-3 ml-auto text-[#bba7db]" />
                                            )}
                                          </Button>
                                        ))}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  
                                  {/* Link Popover */}
                                  <Popover 
                                    open={openLinkPopover === group.id} 
                                    onOpenChange={(open) => {
                                      if (!open) setOpenLinkPopover(null);
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6"
                                        onClick={() => setOpenLinkPopover(group.id)}
                                        data-testid={`button-link-${group.id}`}
                                      >
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Link2 className={`h-3.5 w-3.5 ${group.linkedTaskId || group.linkedScheduleItemId ? 'text-[#bba7db]' : 'text-muted-foreground/50'}`} />
                                          </TooltipTrigger>
                                          <TooltipContent>Link to task or schedule</TooltipContent>
                                        </Tooltip>
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-2" align="end">
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground px-1">Link checklist to:</p>
                                        
                                        {projectTasks.length > 0 && (
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-medium text-muted-foreground px-1 uppercase tracking-wide">Tasks</p>
                                            <ScrollArea className="max-h-32">
                                              <div className="space-y-0.5">
                                                {projectTasks.map((task) => (
                                                  <Button
                                                    key={task.id}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-start h-7 text-xs px-1"
                                                    disabled={updateGroupMutation.isPending}
                                                    onClick={() => {
                                                      updateGroupMutation.mutate({
                                                        groupId: group.id,
                                                        data: {
                                                          linkedTaskId: group.linkedTaskId === task.id ? null : task.id,
                                                          linkedScheduleItemId: null
                                                        }
                                                      });
                                                    }}
                                                  >
                                                    <span className="truncate">{task.title}</span>
                                                    {group.linkedTaskId === task.id && (
                                                      <Check className="h-3 w-3 ml-auto text-[#bba7db] shrink-0" />
                                                    )}
                                                  </Button>
                                                ))}
                                              </div>
                                            </ScrollArea>
                                          </div>
                                        )}
                                        
                                        {scheduleItems.length > 0 && (
                                          <div className="space-y-1">
                                            <p className="text-[10px] font-medium text-muted-foreground px-1 uppercase tracking-wide">Schedule</p>
                                            <ScrollArea className="max-h-32">
                                              <div className="space-y-0.5">
                                                {scheduleItems.map((schedItem) => (
                                                  <Button
                                                    key={schedItem.id}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-start h-7 text-xs px-1"
                                                    disabled={updateGroupMutation.isPending}
                                                    onClick={() => {
                                                      updateGroupMutation.mutate({
                                                        groupId: group.id,
                                                        data: {
                                                          linkedScheduleItemId: group.linkedScheduleItemId === schedItem.id ? null : schedItem.id,
                                                          linkedTaskId: null
                                                        }
                                                      });
                                                    }}
                                                  >
                                                    <span className="truncate">{schedItem.name}</span>
                                                    {group.linkedScheduleItemId === schedItem.id && (
                                                      <Check className="h-3 w-3 ml-auto text-[#bba7db] shrink-0" />
                                                    )}
                                                  </Button>
                                                ))}
                                              </div>
                                            </ScrollArea>
                                          </div>
                                        )}
                                        
                                        {projectTasks.length === 0 && scheduleItems.length === 0 && (
                                          <p className="text-xs text-muted-foreground px-1 py-2">
                                            No tasks or schedule items available
                                          </p>
                                        )}
                                        
                                        {(group.linkedTaskId || group.linkedScheduleItemId) && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-center h-7 text-xs text-destructive hover:text-destructive"
                                            disabled={updateGroupMutation.isPending}
                                            onClick={() => {
                                              updateGroupMutation.mutate({
                                                groupId: group.id,
                                                data: { linkedTaskId: null, linkedScheduleItemId: null }
                                              });
                                            }}
                                          >
                                            <X className="h-3 w-3 mr-1" />
                                            Remove link
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>
                            </div>
                            
                            {/* Expanded Items Panel */}
                            {isExpanded && (
                              <div className="border-t border-border/40 bg-muted/30 p-3">
                                {items.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-4">
                                    No items in this checklist
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs text-muted-foreground">
                                        {completedItems} of {items.length} completed
                                      </span>
                                    </div>
                                    {items.map((item) => (
                                      <div
                                        key={item.id}
                                        className={`flex items-center gap-2 p-2 rounded-md border border-border/40 bg-background/50 transition-colors ${
                                          item.isCompleted ? 'opacity-60' : ''
                                        }`}
                                      >
                                        <Checkbox
                                          checked={item.isCompleted || false}
                                          onCheckedChange={(checked) => {
                                            updateItemMutation.mutate({
                                              itemId: item.id,
                                              data: { 
                                                isCompleted: !!checked,
                                                completedAt: checked ? new Date().toISOString() : null,
                                                completedBy: checked ? user?.id : null,
                                                completedByName: checked ? user?.name : null,
                                              }
                                            });
                                          }}
                                          className="data-[state=checked]:bg-[#bba7db] data-[state=checked]:border-[#bba7db]"
                                        />
                                        <span className={`text-sm flex-1 ${item.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                                          {item.name}
                                        </span>
                                        {item.isRequired && (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-orange-600 border-orange-300">
                                            Required
                                          </Badge>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Checklist Group Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="dialog-add-checklist">
          <DialogHeader>
            <DialogTitle>Add Checklist Group</DialogTitle>
            <DialogDescription>
              Create a new checklist group from a template or from scratch.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label>Start from Template (optional)</Label>
                <Select value={formData.templateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger data-testid="select-template">
                    <SelectValue placeholder="Select a template..." />
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
            )}

            {formData.templateId && templateGroups.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Checklists to Include</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={selectAllGroups}
                      data-testid="button-select-all-groups"
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={clearGroupSelection}
                      data-testid="button-clear-groups"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="border rounded-md">
                  <ScrollArea className="h-[140px]">
                    <div className="p-2 space-y-1">
                      {templateGroups.map((group) => (
                        <div
                          key={group.id}
                          className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleGroupSelection(group.id)}
                          data-testid={`group-checkbox-${group.id}`}
                        >
                          <Checkbox
                            checked={formData.selectedGroupIds.includes(group.id)}
                            onCheckedChange={() => toggleGroupSelection(group.id)}
                          />
                          <span className="text-sm">{group.name}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formData.selectedGroupIds.length === 0
                    ? "All checklists will be included"
                    : `${formData.selectedGroupIds.length} of ${templateGroups.length} checklists selected`}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Frame Stage Inspection"
                data-testid="input-checklist-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description..."
                rows={2}
                data-testid="textarea-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateChecklist}
              disabled={createMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
              data-testid="button-create-checklist"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Checklist Group"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checklist Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this checklist group and all its checklists? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showDeleteConfirm && deleteInstanceMutation.mutate(showDeleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
