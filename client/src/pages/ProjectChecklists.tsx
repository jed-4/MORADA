import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useUpload } from "@/hooks/use-upload";
import { format } from "date-fns";
import {
  type ChecklistInstance,
  type ChecklistInstanceGroup,
  type ChecklistInstanceItem,
  type ChecklistTemplate,
  type ChecklistTemplateGroup,
  type ChecklistAuditLog,
  type User,
  type ScheduleItem,
} from "@shared/schema";

type Task = {
  id: string;
  title: string;
  projectId: string | null;
};

type AssignableUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string;
  profileImageUrl: string | null;
  roleId: string | null;
  roleName: string | null;
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
  Pencil,
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
  Info,
  Type,
  CircleDot,
  StickyNote,
  Paperclip,
  Send,
  MessageSquare,
  UserPlus,
  Lock,
  Globe,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = "all" | "upcoming" | "action" | "done";

type ChecklistGroupWithCounts = ChecklistInstanceGroup & {
  completedCount?: number;
  totalCount?: number;
};

function ActivityLogContent({ instanceId }: { instanceId: string }) {
  const { data: auditLog = [], isLoading } = useQuery<ChecklistAuditLog[]>({
    queryKey: ['/api/checklist-instances', instanceId, 'audit-log'],
    queryFn: () => fetch(`/api/checklist-instances/${instanceId}/audit-log`).then(r => r.json()),
    enabled: !!instanceId,
  });

  const getActionLabel = (action: string) => {
    switch (action) {
      case "item_status_changed": return "changed status";
      case "item_assigned": return "assigned item";
      case "item_created": return "added item";
      case "item_deleted": return "removed item";
      case "group_created": return "added group";
      case "group_deleted": return "removed group";
      case "checklist_created": return "created checklist";
      default: return action.replace(/_/g, " ");
    }
  };

  const getStatusLabel = (val: string | null) => {
    if (!val) return "";
    switch (val) {
      case "completed": return "Completed";
      case "pending": return "Pending";
      case "na": return "N/A";
      default: return val;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (auditLog.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet.</p>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="space-y-1">
        {auditLog.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 py-1.5 px-1 text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium">{entry.userName || "System"}</span>{" "}
              <span className="text-muted-foreground">{getActionLabel(entry.action)}</span>
              {entry.action === "item_status_changed" && entry.previousValue && entry.newValue && (
                <span className="text-muted-foreground">
                  {" "}{getStatusLabel(entry.previousValue)} → {getStatusLabel(entry.newValue)}
                </span>
              )}
              {entry.details && entry.action !== "item_status_changed" && (
                <span className="text-muted-foreground block truncate">{entry.details}</span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {format(new Date(entry.createdAt), "MMM d, h:mm a")}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export default function ProjectChecklists() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const userDisplayName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'Unknown';
  const pageTitle = usePageTitle({ pageName: "Checklists" });
  
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showActivityLog, setShowActivityLog] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [openLinkPopover, setOpenLinkPopover] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
  
  // Collapsed state - track which are collapsed (default: all expanded)
  const [collapsedInstances, setCollapsedInstances] = useState<Set<string>>(new Set());
  const [expandedChecklists, setExpandedChecklists] = useState<Set<string>>(new Set());
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [showNotesDialog, setShowNotesDialog] = useState<ChecklistInstanceItem | null>(null);
  const [newNoteText, setNewNoteText] = useState("");
  const [openAssignPopover, setOpenAssignPopover] = useState<string | null>(null);
  const [openAttachPopover, setOpenAttachPopover] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState("");
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const { uploadFile, isUploading } = useUpload();
  
  const [formData, setFormData] = useState({
    templateId: "",
    name: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    dueDate: "",
    assigneeId: "",
    visibility: "everyone" as "everyone" | "assignee_only",
    selectedGroupIds: [] as string[],
  });

  // Fetch checklist instances (Groups > Checklists > Items hierarchy)
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
  // Include instance IDs in queryKey so it refetches when instances change
  const instanceIds = instances.map(i => i.id).sort().join(',');
  const { data: allGroups = [] } = useQuery<ChecklistGroupWithCounts[]>({
    queryKey: ["/api/checklist-instance-groups", { projectId, instanceIds }],
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
      Object.keys(itemsMap).forEach(groupId => {
        itemsMap[groupId].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
      });
      return itemsMap;
    },
    enabled: expandedChecklistIds.length > 0 && allGroups.length > 0,
  });

  const { data: templates = [] } = useQuery<ChecklistTemplate[]>({
    queryKey: ["/api/checklist-templates"],
  });

  const { data: teamMembers = [] } = useQuery<AssignableUser[]>({
    queryKey: ["/api/users/assignable"],
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
      const result = await apiRequest("/api/checklist-instances", "POST", {
        ...data,
        projectId,
        assigneeName: teamMembers.find(u => u.id === data.assigneeId)?.displayName,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        selectedGroupIds: data.selectedGroupIds.length > 0 ? data.selectedGroupIds : undefined,
      });
      return result;
    },
    onSuccess: async () => {
      // Invalidate all checklist instances queries (covers page and widget variations)
      await queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instances"
      });
      // Then invalidate groups
      await queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instance-groups"
      });
      toast({ title: "Group created", description: "The group has been created successfully." });
      setShowAddDialog(false);
      setFormData({ templateId: "", name: "", description: "", priority: "medium", dueDate: "", assigneeId: "", visibility: "everyone", selectedGroupIds: [] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create group.", variant: "destructive" });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/checklist-instances/${id}`, "DELETE");
    },
    onSuccess: () => {
      // Invalidate all checklist instances queries (covers page and widget variations)
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instances"
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instance-groups"
      });
      toast({ title: "Group deleted", description: "The group has been deleted." });
      setShowDeleteConfirm(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete group.", variant: "destructive" });
    },
  });

  const updateInstanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await apiRequest(`/api/checklist-instances/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instances"
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update group.", variant: "destructive" });
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
      toast({ title: "Error", description: "Failed to update item.", variant: "destructive" });
      setOpenLinkPopover(null);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<ChecklistInstanceItem> }) => {
      await apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", data);
    },
    onMutate: async ({ itemId, data }) => {
      await queryClient.cancelQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-items"
      });
      const previousItems = queryClient.getQueriesData({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-items"
      });
      queryClient.setQueriesData(
        { predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-items" },
        (old: Record<string, ChecklistInstanceItem[]> | undefined) => {
          if (!old) return old;
          const updated = { ...old };
          for (const groupId of Object.keys(updated)) {
            updated[groupId] = updated[groupId].map(item =>
              item.id === itemId ? { ...item, ...data } : item
            );
          }
          return updated;
        }
      );
      return { previousItems };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousItems) {
        context.previousItems.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast({ title: "Error", description: "Failed to update item.", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length === 0) return false;
          return key[0] === "/api/checklist-items" || 
                 key[0] === "/api/checklist-instance-groups" || 
                 key[0] === "/api/checklist-instances";
        }
      });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async ({ instanceId, groupId, description }: { instanceId: string; groupId: string; description: string }) => {
      return await apiRequest(`/api/checklist-instances/${instanceId}/items`, "POST", {
        groupId,
        description,
        responseType: "checkbox",
        order: 9999,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-items"
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instance-groups"
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instances"
      });
      toast({ title: "Item added", description: "The checklist item has been added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add item.", variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await apiRequest(`/api/checklist-instance-groups/${groupId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instance-groups"
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instances"
      });
      toast({ title: "Checklist deleted", description: "The checklist item has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete checklist item.", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest(`/api/checklist-instance-items/${itemId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-items"
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instance-groups"
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-instances"
      });
      toast({ title: "Item deleted", description: "The checklist item has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete checklist item.", variant: "destructive" });
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
        visibility: (template.defaultVisibility as "everyone" | "assignee_only") || "everyone",
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

  const parseNoteFeed = (notes: string | null | undefined) => {
    if (!notes) return [];
    try {
      const parsed = JSON.parse(notes);
      if (Array.isArray(parsed)) return parsed;
      return [{ author: "Previous note", date: new Date().toISOString(), text: notes }];
    } catch {
      return [{ author: "Previous note", date: new Date().toISOString(), text: notes }];
    }
  };

  const hasHumanNotes = (notes: string | null | undefined): boolean => {
    const entries = parseNoteFeed(notes);
    return entries.some((e: any) => !e.system);
  };

  const addSystemNote = (currentNotes: string | null | undefined, text: string): string => {
    const entries = parseNoteFeed(currentNotes);
    entries.push({
      author: userDisplayName,
      date: new Date().toISOString(),
      text,
      system: true,
    });
    return JSON.stringify(entries);
  };

  const handleAddNote = () => {
    if (!showNotesDialog || !newNoteText.trim()) return;
    const existingNotes = parseNoteFeed(showNotesDialog.notes);
    const newEntry = {
      author: userDisplayName,
      date: new Date().toISOString(),
      text: newNoteText.trim()
    };
    existingNotes.push(newEntry);
    updateItemMutation.mutate({
      itemId: showNotesDialog.id,
      data: { notes: JSON.stringify(existingNotes) },
    });
    setShowNotesDialog({ ...showNotesDialog, notes: JSON.stringify(existingNotes) });
    setNewNoteText("");
  };

  const handleFileUpload = async (itemId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const allItems = Object.values(checklistItems).flat();
    const item = allItems.find(i => i.id === itemId);
    let currentAttachments = Array.isArray(item?.attachmentIds) ? [...(item.attachmentIds as any[])] : [];
    if (currentAttachments.length + files.length > 3) {
      toast({ title: "Limit reached", description: "Maximum 3 attachments per item.", variant: "destructive" });
      return;
    }
    setUploadingItemId(itemId);
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "File too large", description: `${file.name} exceeds 10MB limit.`, variant: "destructive" });
        continue;
      }
      const response = await uploadFile(file);
      if (response) {
        const newAttachment = {
          name: response.metadata.name,
          path: response.objectPath,
          contentType: response.metadata.contentType,
          size: response.metadata.size,
          uploadedAt: new Date().toISOString(),
          uploadedBy: userDisplayName,
        };
        currentAttachments = [...currentAttachments, newAttachment];
        updateItemMutation.mutate({
          itemId,
          data: { attachmentIds: currentAttachments }
        });
        toast({ title: "File attached", description: response.metadata.name });
      }
    }
    setUploadingItemId(null);
  };

  const handleRemoveAttachment = (itemId: string, attachmentIndex: number) => {
    const allItems = Object.values(checklistItems).flat();
    const item = allItems.find(i => i.id === itemId);
    const existingAttachments = Array.isArray(item?.attachmentIds) ? [...(item.attachmentIds as any[])] : [];
    existingAttachments.splice(attachmentIndex, 1);
    updateItemMutation.mutate({
      itemId,
      data: { attachmentIds: existingAttachments }
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
      // "all" tab shows everything, other tabs filter by status
      if (activeTab === "upcoming" && group.status !== "active") return false;
      if (activeTab === "action" && group.status !== "in_progress") return false;
      if (activeTab === "done" && group.status !== "completed") return false;
      
      // Hide completed filter
      if (hideCompleted && group.status === "completed") return false;
      
      if (searchTerm && !group.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (assigneeFilter !== "all" && group.assigneeId !== assigneeFilter) return false;
      
      return true;
    });
  }, [allGroups, activeTab, searchTerm, assigneeFilter, hideCompleted]);

  const groupedByInstance = useMemo(() => {
    // Build lookup of groups by instance ID
    const groupsByInstanceId: Record<string, ChecklistGroupWithCounts[]> = {};
    filteredGroups.forEach(group => {
      if (!groupsByInstanceId[group.instanceId]) {
        groupsByInstanceId[group.instanceId] = [];
      }
      groupsByInstanceId[group.instanceId].push(group);
    });
    
    // Start from instances so even those with no groups are included
    const result = instances.map(instance => {
      const groups = groupsByInstanceId[instance.id] || [];
      // Sort groups by order
      groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return { instance, groups };
    });
    
    // When filtering by tab/search/assignee/hideCompleted, only show instances that have matching groups
    // But on "all" tab with no filters, show all instances including empty ones
    const hasFilters = activeTab !== "all" || searchTerm || assigneeFilter !== "all" || hideCompleted;
    const filtered = hasFilters 
      ? result.filter(({ groups }) => groups.length > 0)
      : result;
    
    return filtered.sort((a, b) => 
      a.instance.name.localeCompare(b.instance.name)
    );
  }, [filteredGroups, instances, activeTab, searchTerm, assigneeFilter]);

  const allCount = allGroups.length;
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
            completedByName: userDisplayName,
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

  const checkGroupAutoComplete = (groupId: string, currentGroupStatus: string, itemId: string, newItemStatus: string) => {
    if (currentGroupStatus === "completed") return;
    const currentItems = checklistItems[groupId] || [];
    if (currentItems.length === 0) return;
    const updatedItems = currentItems.map(i =>
      i.id === itemId ? { ...i, status: newItemStatus } : i
    );
    const allDone = updatedItems.every(i => i.status === "completed" || i.status === "na");
    if (allDone) {
      const now = new Date().toISOString();
      updateGroupMutation.mutate({
        groupId,
        data: {
          status: "completed",
          completedAt: now,
          completedBy: user?.id || null,
          completedByName: userDisplayName,
        }
      });
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
          <h2 className="text-sm font-semibold" data-testid="text-page-title">{pageTitle}</h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-checklist-count">
            {allGroups.length} checklists
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowAddDialog(true)}
            data-testid="button-add-checklist"
          >
            <Plus className="h-3 w-3" />
            Add Group
          </button>
        </div>
      </div>

      {/* Row 2: Tabs */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-0.5" data-testid="tabs-checklist-status">
          <button
            onClick={() => setActiveTab("all")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "all"
                ? "bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90"
                : "hover-elevate"
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-all"
          >
            All
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{allCount}</Badge>
          </button>
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
                  {member.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => setHideCompleted(!hideCompleted)}
            className={`h-6 px-2 text-xs border rounded-md flex items-center gap-1 ${
              hideCompleted 
                ? "bg-[#bba7db] text-white border-[#bba7db]/20" 
                : "hover-elevate"
            } active-elevate-2`}
            data-testid="toggle-hide-completed"
          >
            <CheckCircle2 className="h-3 w-3" />
            {hideCompleted ? "Show Done" : "Hide Done"}
          </button>
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
                Add First Group
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByInstance.map(({ instance, groups }) => {
              const isCollapsed = collapsedInstances.has(instance.id);
              
              return (
                <div key={instance.id} className="space-y-3">
                  {/* Group Header - Collapsible */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border/60 rounded-md cursor-pointer hover:bg-muted/50 transition-all"
                    onClick={() => toggleInstanceCollapse(instance.id)}
                    data-testid={`instance-header-${instance.id}`}
                  >
                    <div className={`transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <FolderOpen className="h-4 w-4 text-[#bba7db]" />
                    <span className="text-sm font-medium flex-1 flex items-center gap-1.5">
                      {instance.name}
                      {instance.visibility === "assignee_only" && (
                        <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {groups.length} checklists
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setShowActivityLog(instance.id);
                          }}
                        >
                          <Clock className="h-3 w-3 mr-2" />
                          Activity Log
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            const newVisibility = instance.visibility === "assignee_only" ? "everyone" : "assignee_only";
                            updateInstanceMutation.mutate({ id: instance.id, data: { visibility: newVisibility } });
                            toast({
                              title: newVisibility === "assignee_only" ? "Set to Assignee Only" : "Set to Everyone",
                              description: newVisibility === "assignee_only"
                                ? "Only you and admins can see this checklist group."
                                : "All project members can now see this checklist group.",
                            });
                          }}
                        >
                          {instance.visibility === "assignee_only" ? (
                            <><Globe className="h-3 w-3 mr-2" />Make Visible to Everyone</>
                          ) : (
                            <><Lock className="h-3 w-3 mr-2" />Restrict to Assignee Only</>
                          )}
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
                    <div className="space-y-3 ml-2 pl-4 border-l-2 border-[#bba7db]/30">
                      {groups.map((group) => {
                        const isExpanded = expandedChecklists.has(group.id);
                        const items = checklistItems[group.id] || [];
                        const completedItems = items.filter(i => i.status === "completed" || i.status === "na").length;
                        
                        return (
                          <div
                            key={group.id}
                            className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
                            data-testid={`checklist-card-${group.id}`}
                            onClick={() => toggleChecklistExpand(group.id)}
                          >
                            {/* Checklist Header */}
                            <div className="flex items-start gap-2">
                              {/* Left: Chevron + Title */}
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <div className={`transition-transform duration-200 mt-0.5 ${isExpanded ? 'rotate-90' : ''}`}>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm line-clamp-1">{group.name}</span>
                                  {items.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      {completedItems} of {items.length} items
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              {/* Right: Chips + Assignee */}
                              <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
                                  <span className="inline-flex items-center px-1 py-0.5 rounded bg-[#bba7db]/10 text-[#bba7db]">
                                    <Link2 className="h-3 w-3" />
                                  </span>
                                )}
                                {/* Assignee */}
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
                                                data: { assigneeId: member.id, assigneeName: member.displayName }
                                              });
                                            }}
                                          >
                                            <Avatar className="h-4 w-4 mr-2">
                                              <AvatarFallback className="text-[8px] bg-[#bba7db]/20 text-[#bba7db]">
                                                {member.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                              </AvatarFallback>
                                            </Avatar>
                                            {member.displayName}
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

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`group-menu-${group.id}`}>
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                      <div className="px-2 py-1.5">
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Priority</p>
                                        <div className="flex gap-1">
                                          {(["low", "medium", "high", "urgent"] as const).map((p) => (
                                            <Button
                                              key={p}
                                              variant={group.priority === p ? "default" : "outline"}
                                              size="sm"
                                              className={`text-[10px] px-2 h-6 ${group.priority === p ? '' : ''}`}
                                              onClick={() => {
                                                updateGroupMutation.mutate({
                                                  groupId: group.id,
                                                  data: { priority: p }
                                                });
                                              }}
                                            >
                                              {p.charAt(0).toUpperCase() + p.slice(1)}
                                            </Button>
                                          ))}
                                        </div>
                                      </div>
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteGroupMutation.mutate(group.id);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3 mr-2" />
                                        Delete Checklist
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                            </div>
                            
                            {/* Expanded Items Panel */}
                            {isExpanded && (
                              <div className="border-t border-border/40 bg-muted/30 p-3" onClick={(e) => e.stopPropagation()}>
                                {items.length === 0 ? (
                                  <div className="space-y-3">
                                    <p className="text-xs text-muted-foreground text-center py-2">
                                      No items in this checklist
                                    </p>
                                    {/* Add Item Form - shown even when empty */}
                                    <div className="flex items-center gap-2">
                                      <Input
                                        placeholder="Add new item..."
                                        value={newItemText[group.id] || ""}
                                        onChange={(e) => setNewItemText(prev => ({ ...prev, [group.id]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && newItemText[group.id]?.trim()) {
                                            createItemMutation.mutate({
                                              instanceId: group.instanceId,
                                              groupId: group.id,
                                              description: newItemText[group.id].trim(),
                                            });
                                            setNewItemText(prev => ({ ...prev, [group.id]: "" }));
                                          }
                                        }}
                                        className="h-8 text-sm"
                                        data-testid={`add-item-input-empty-${group.id}`}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3"
                                        disabled={!newItemText[group.id]?.trim() || createItemMutation.isPending}
                                        onClick={() => {
                                          if (newItemText[group.id]?.trim()) {
                                            createItemMutation.mutate({
                                              instanceId: group.instanceId,
                                              groupId: group.id,
                                              description: newItemText[group.id].trim(),
                                            });
                                            setNewItemText(prev => ({ ...prev, [group.id]: "" }));
                                          }
                                        }}
                                        data-testid={`add-item-button-empty-${group.id}`}
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                        Add
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs text-muted-foreground">
                                        {completedItems} of {items.length} completed
                                      </span>
                                    </div>
                                    {items.map((item) => {
                                      const responseType = (item.responseType as string) || "checkbox";
                                      const responseOptions = (item.responseOptions as string[]) || [];
                                      const selectedResponses = (item.selectedResponses as string[]) || [];
                                      const textResponse = item.textResponse || "";
                                      const isAnswered = responseType === "checkbox" 
                                        ? (item.status === "completed" || item.status === "na")
                                        : responseType === "text" 
                                        ? !!textResponse 
                                        : selectedResponses.length > 0;

                                      return (
                                        <div
                                          key={item.id}
                                          className={`group/item p-2 rounded-md border border-border/40 bg-background/50 transition-colors ${
                                            isAnswered ? 'opacity-80' : ''
                                          }`}
                                        >
                                          <div className="flex items-start gap-2">
                                            {/* Response Type Icon/Input */}
                                            {responseType === "checkbox" && (
                                              <Checkbox
                                                checked={item.status === "completed"}
                                                onCheckedChange={(checked) => {
                                                  const newStatus = checked ? "completed" : "pending";
                                                  const updatedNotes = checked
                                                    ? addSystemNote(item.notes, `Completed by ${userDisplayName}`)
                                                    : addSystemNote(item.notes, `Reopened by ${userDisplayName}`);
                                                  updateItemMutation.mutate({
                                                    itemId: item.id,
                                                    data: { 
                                                      status: newStatus,
                                                      completedAt: checked ? new Date().toISOString() : null,
                                                      completedBy: checked ? user?.id : null,
                                                      completedByName: checked ? userDisplayName : null,
                                                      notes: updatedNotes,
                                                    }
                                                  });
                                                  if (checked) {
                                                    checkGroupAutoComplete(group.id, group.status, item.id, newStatus);
                                                  }
                                                }}
                                                className="mt-0.5 data-[state=checked]:bg-[#bba7db] data-[state=checked]:border-[#bba7db]"
                                              />
                                            )}
                                            {responseType === "text" && (
                                              <Type className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                            )}
                                            {responseType === "single_choice" && (
                                              <CircleDot className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                            )}
                                            {responseType === "multiple_choice" && (
                                              <ListChecks className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                            )}
                                            
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                {editingItemId === item.id ? (
                                                  <Input
                                                    autoFocus
                                                    value={editingItemText}
                                                    onChange={(e) => setEditingItemText(e.target.value)}
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter" && editingItemText.trim()) {
                                                        updateItemMutation.mutate({ itemId: item.id, data: { description: editingItemText.trim() } });
                                                        setEditingItemId(null);
                                                      }
                                                      if (e.key === "Escape") setEditingItemId(null);
                                                    }}
                                                    onBlur={() => {
                                                      if (editingItemText.trim() && editingItemText.trim() !== item.description) {
                                                        updateItemMutation.mutate({ itemId: item.id, data: { description: editingItemText.trim() } });
                                                      }
                                                      setEditingItemId(null);
                                                    }}
                                                    className="h-7 text-sm"
                                                  />
                                                ) : (
                                                  <span className={`text-sm ${isAnswered && responseType === "checkbox" ? 'line-through text-muted-foreground' : ''}`}>
                                                    {item.description}
                                                  </span>
                                                )}
                                                {item.tooltip && (
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <button className="text-muted-foreground hover:text-foreground transition-colors">
                                                        <Info className="h-3.5 w-3.5" />
                                                      </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-xs">
                                                      <p className="text-xs">{item.tooltip}</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                )}
                                                {item.isRequired && (
                                                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-orange-600 border-orange-300">
                                                    Required
                                                  </Badge>
                                                )}
                                                <div className="flex items-center gap-1 ml-auto">
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <button
                                                        className="p-0.5 rounded hover:bg-muted/60 transition-colors"
                                                        onClick={(e) => { e.stopPropagation(); setShowNotesDialog(item); }}
                                                      >
                                                        <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${hasHumanNotes(item.notes) ? 'text-[#bba7db] fill-[#bba7db]' : 'text-muted-foreground/40'}`} />
                                                      </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                      <p className="text-xs">{item.notes ? 'View notes' : 'Add note'}</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                  <Popover open={openAssignPopover === item.id} onOpenChange={(open) => setOpenAssignPopover(open ? item.id : null)}>
                                                    <PopoverTrigger asChild>
                                                      <button className="p-0.5 rounded hover:bg-muted/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                                                        {item.assigneeName ? (
                                                          <Avatar className="h-5 w-5">
                                                            <AvatarFallback className="text-[9px] bg-[#bba7db]/20 text-[#bba7db]">
                                                              {item.assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                          </Avatar>
                                                        ) : (
                                                          <UserPlus className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                                                        )}
                                                      </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-48 p-1" align="end" onClick={(e) => e.stopPropagation()}>
                                                      <div className="space-y-0.5">
                                                        {item.assigneeId && (
                                                          <button
                                                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/60 text-muted-foreground"
                                                            onClick={() => {
                                                              updateItemMutation.mutate({ itemId: item.id, data: { assigneeId: null, assigneeName: null } });
                                                              setOpenAssignPopover(null);
                                                            }}
                                                          >
                                                            Unassign
                                                          </button>
                                                        )}
                                                        {teamMembers.map((member) => (
                                                          <button
                                                            key={member.id}
                                                            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted/60 flex items-center gap-2 ${item.assigneeId === member.id ? 'bg-muted/40' : ''}`}
                                                            onClick={() => {
                                                              updateItemMutation.mutate({ itemId: item.id, data: { assigneeId: member.id, assigneeName: member.displayName } });
                                                              setOpenAssignPopover(null);
                                                            }}
                                                          >
                                                            <Avatar className="h-4 w-4">
                                                              <AvatarFallback className="text-[8px] bg-[#bba7db]/20 text-[#bba7db]">
                                                                {member.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                              </AvatarFallback>
                                                            </Avatar>
                                                            {member.displayName}
                                                            {item.assigneeId === member.id && <Check className="h-3 w-3 ml-auto text-[#bba7db]" />}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    </PopoverContent>
                                                  </Popover>
                                                  <Popover open={openAttachPopover === item.id} onOpenChange={(open) => { setOpenAttachPopover(open ? item.id : null); if (!open) { uploadTargetRef.current = null; } }}>
                                                    <PopoverTrigger asChild>
                                                      <button className="p-0.5 rounded hover:bg-muted/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                                                        {uploadingItemId === item.id ? (
                                                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#bba7db]" />
                                                        ) : (
                                                          <Paperclip className={`h-3.5 w-3.5 shrink-0 ${Array.isArray(item.attachmentIds) && (item.attachmentIds as any[]).length > 0 ? 'text-[#bba7db]' : 'text-muted-foreground/40'}`} />
                                                        )}
                                                      </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-56 p-2" align="end" onClick={(e) => e.stopPropagation()}>
                                                      <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                          <p className="text-xs font-medium text-muted-foreground">Attachments</p>
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 text-xs"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              uploadTargetRef.current = item.id;
                                                              setUploadingItemId(item.id);
                                                              fileInputRef.current?.click();
                                                            }}
                                                            disabled={isUploading}
                                                          >
                                                            <Plus className="h-3 w-3 mr-1" />
                                                            Add
                                                          </Button>
                                                        </div>
                                                        {Array.isArray(item.attachmentIds) && (item.attachmentIds as any[]).length > 0 ? (
                                                          <div className="space-y-1">
                                                            {(item.attachmentIds as any[]).map((att: any, idx: number) => (
                                                              <div key={idx} className="flex items-center gap-2 p-1.5 rounded bg-muted/30 text-xs">
                                                                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                                                                <span className="flex-1 truncate">{att.name || 'File'}</span>
                                                                <button
                                                                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                                  onClick={(e) => { e.stopPropagation(); handleRemoveAttachment(item.id, idx); }}
                                                                >
                                                                  <X className="h-3 w-3" />
                                                                </button>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        ) : (
                                                          <p className="text-[11px] text-muted-foreground text-center py-2">No attachments</p>
                                                        )}
                                                        <p className="text-[10px] text-muted-foreground">Max 3 files, 10MB each</p>
                                                      </div>
                                                    </PopoverContent>
                                                  </Popover>
                                                  {item.completedByName && item.status === "completed" && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <div className="flex items-center gap-1 text-green-600">
                                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                                          <span className="text-[10px]">{item.completedByName}</span>
                                                        </div>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="top">
                                                        <p className="text-xs">
                                                          Completed by {item.completedByName}
                                                          {item.completedAt && ` on ${new Date(item.completedAt).toLocaleDateString()}`}
                                                        </p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Text Response Input */}
                                              {responseType === "text" && (
                                                <div className="mt-2">
                                                  <Input
                                                    placeholder="Enter your response..."
                                                    value={textResponse}
                                                    onChange={(e) => {
                                                      updateItemMutation.mutate({
                                                        itemId: item.id,
                                                        data: { 
                                                          textResponse: e.target.value,
                                                          status: e.target.value ? "completed" : "pending",
                                                          completedAt: e.target.value ? new Date().toISOString() : null,
                                                          completedBy: e.target.value ? user?.id : null,
                                                          completedByName: e.target.value ? userDisplayName : null,
                                                        }
                                                      });
                                                    }}
                                                    className="h-8 text-sm"
                                                  />
                                                </div>
                                              )}

                                              {/* Single Choice Radio Buttons */}
                                              {responseType === "single_choice" && responseOptions.length > 0 && (
                                                <RadioGroup
                                                  value={selectedResponses[0] || ""}
                                                  onValueChange={(value) => {
                                                    updateItemMutation.mutate({
                                                      itemId: item.id,
                                                      data: { 
                                                        selectedResponses: [value],
                                                        status: "completed",
                                                        completedAt: new Date().toISOString(),
                                                        completedBy: user?.id,
                                                        completedByName: userDisplayName,
                                                      }
                                                    });
                                                    checkGroupAutoComplete(group.id, group.status, item.id, "completed");
                                                  }}
                                                  className="mt-2 flex flex-wrap gap-3"
                                                >
                                                  {responseOptions.map((option, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5">
                                                      <RadioGroupItem 
                                                        value={option} 
                                                        id={`${item.id}-${idx}`}
                                                        className="h-3.5 w-3.5 border-muted-foreground/50 data-[state=checked]:border-[#bba7db] data-[state=checked]:text-[#bba7db]"
                                                      />
                                                      <label 
                                                        htmlFor={`${item.id}-${idx}`}
                                                        className="text-xs cursor-pointer"
                                                      >
                                                        {option}
                                                      </label>
                                                    </div>
                                                  ))}
                                                </RadioGroup>
                                              )}

                                              {/* Multiple Choice Checkboxes */}
                                              {responseType === "multiple_choice" && responseOptions.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-3">
                                                  {responseOptions.map((option, idx) => {
                                                    const isSelected = selectedResponses.includes(option);
                                                    return (
                                                      <div key={idx} className="flex items-center gap-1.5">
                                                        <Checkbox
                                                          id={`${item.id}-mc-${idx}`}
                                                          checked={isSelected}
                                                          onCheckedChange={(checked) => {
                                                            const newSelected = checked
                                                              ? [...selectedResponses, option]
                                                              : selectedResponses.filter(s => s !== option);
                                                            const newItemStatus = newSelected.length > 0 ? "completed" : "pending";
                                                            updateItemMutation.mutate({
                                                              itemId: item.id,
                                                              data: { 
                                                                selectedResponses: newSelected,
                                                                status: newItemStatus,
                                                                completedAt: newSelected.length > 0 ? new Date().toISOString() : null,
                                                                completedBy: newSelected.length > 0 ? user?.id : null,
                                                                completedByName: newSelected.length > 0 ? userDisplayName : null,
                                                              }
                                                            });
                                                            if (checked) {
                                                              checkGroupAutoComplete(group.id, group.status, item.id, "completed");
                                                            }
                                                          }}
                                                          className="h-3.5 w-3.5 data-[state=checked]:bg-[#bba7db] data-[state=checked]:border-[#bba7db]"
                                                        />
                                                        <label 
                                                          htmlFor={`${item.id}-mc-${idx}`}
                                                          className="text-xs cursor-pointer"
                                                        >
                                                          {option}
                                                        </label>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                            
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-5 w-5 shrink-0 text-muted-foreground self-start mt-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                                  onClick={(e) => e.stopPropagation()}
                                                  data-testid={`item-menu-${item.id}`}
                                                >
                                                  <MoreVertical className="h-3 w-3" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenuItem
                                                  onClick={() => {
                                                    setEditingItemId(item.id);
                                                    setEditingItemText(item.description);
                                                  }}
                                                >
                                                  <Pencil className="h-3 w-3 mr-2" />
                                                  Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                  className="text-destructive"
                                                  onClick={() => deleteItemMutation.mutate(item.id)}
                                                  disabled={deleteItemMutation.isPending}
                                                >
                                                  <Trash2 className="h-3 w-3 mr-2" />
                                                  Delete
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    
                                    {/* Add Item Form */}
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                                      <Input
                                        placeholder="Add new item..."
                                        value={newItemText[group.id] || ""}
                                        onChange={(e) => setNewItemText(prev => ({ ...prev, [group.id]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && newItemText[group.id]?.trim()) {
                                            createItemMutation.mutate({
                                              instanceId: group.instanceId,
                                              groupId: group.id,
                                              description: newItemText[group.id].trim(),
                                            });
                                            setNewItemText(prev => ({ ...prev, [group.id]: "" }));
                                          }
                                        }}
                                        className="h-8 text-sm"
                                        data-testid={`add-item-input-${group.id}`}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3"
                                        disabled={!newItemText[group.id]?.trim() || createItemMutation.isPending}
                                        onClick={() => {
                                          if (newItemText[group.id]?.trim()) {
                                            createItemMutation.mutate({
                                              instanceId: group.instanceId,
                                              groupId: group.id,
                                              description: newItemText[group.id].trim(),
                                            });
                                            setNewItemText(prev => ({ ...prev, [group.id]: "" }));
                                          }
                                        }}
                                        data-testid={`add-item-button-${group.id}`}
                                      >
                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                        Add
                                      </Button>
                                    </div>
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

      {/* Add Checklist Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="dialog-add-checklist">
          <DialogHeader>
            <DialogTitle>Add Group</DialogTitle>
            <DialogDescription>
              Create a new group from a template or from scratch.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label>Start from Template (optional)</Label>
                <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={templatePopoverOpen}
                      className="w-full justify-between font-normal"
                      data-testid="select-template"
                    >
                      {formData.templateId
                        ? templates.find((t) => t.id === formData.templateId)?.name
                        : "Select a template..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search templates..." />
                      <CommandList>
                        <CommandEmpty>No template found.</CommandEmpty>
                        <CommandGroup>
                          {[...templates]
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((template) => (
                              <CommandItem
                                key={template.id}
                                value={template.name}
                                onSelect={() => {
                                  handleTemplateSelect(template.id);
                                  setTemplatePopoverOpen(false);
                                }}
                                data-testid={`template-option-${template.id}`}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.templateId === template.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {template.name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
                            onClick={(e) => e.stopPropagation()}
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

            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, visibility: "everyone" })}
                  className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    formData.visibility === "everyone"
                      ? "border-[#bba7db] bg-[#bba7db]/10 text-foreground"
                      : "border-border text-muted-foreground hover-elevate"
                  }`}
                  data-testid="visibility-everyone"
                >
                  <div className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                    formData.visibility === "everyone" ? "border-[#bba7db] bg-[#bba7db]" : "border-muted-foreground"
                  }`} />
                  <div>
                    <div className="font-medium">Everyone</div>
                    <div className="text-xs text-muted-foreground">Visible to all project members</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, visibility: "assignee_only" })}
                  className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    formData.visibility === "assignee_only"
                      ? "border-[#bba7db] bg-[#bba7db]/10 text-foreground"
                      : "border-border text-muted-foreground hover-elevate"
                  }`}
                  data-testid="visibility-assignee-only"
                >
                  <div className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                    formData.visibility === "assignee_only" ? "border-[#bba7db] bg-[#bba7db]" : "border-muted-foreground"
                  }`} />
                  <div>
                    <div className="font-medium flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Assignee Only
                    </div>
                    <div className="text-xs text-muted-foreground">Only visible to the assignee</div>
                  </div>
                </button>
              </div>
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
                "Create Group"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Log Dialog */}
      <Dialog open={!!showActivityLog} onOpenChange={() => setShowActivityLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Activity Log
            </DialogTitle>
            <DialogDescription>
              Recent activity for this checklist
            </DialogDescription>
          </DialogHeader>
          {showActivityLog && <ActivityLogContent instanceId={showActivityLog} />}
        </DialogContent>
      </Dialog>

      {/* Notes Dialog - Feed Style */}
      <Dialog open={!!showNotesDialog} onOpenChange={() => { setShowNotesDialog(null); setNewNoteText(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Notes</DialogTitle>
            <DialogDescription className="text-xs">
              {showNotesDialog?.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col h-[300px]">
            <ScrollArea className="flex-1 pr-2">
              {(() => {
                const noteEntries = parseNoteFeed(showNotesDialog?.notes);
                
                if (noteEntries.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                      No notes yet
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-3 py-2">
                    {noteEntries.map((entry: any, idx: number) => (
                      entry.system ? (
                        <div key={idx} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/40">
                          <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-[11px] text-muted-foreground italic">{entry.text}</span>
                          <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                            {format(new Date(entry.date), "MMM d 'at' h:mm a")}
                          </span>
                        </div>
                      ) : (
                        <div key={idx} className="flex gap-2">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="text-[9px] bg-[#bba7db]/20 text-[#bba7db]">
                              {entry.author.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-medium">{entry.author}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(entry.date), "MMM d 'at' h:mm a")}
                              </span>
                            </div>
                            <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{entry.text}</p>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                );
              })()}
            </ScrollArea>
            
            <div className="border-t pt-3 mt-2">
              <div className="flex gap-2">
                <Textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="text-xs resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleAddNote();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="shrink-0 self-end bg-[#bba7db]"
                  onClick={handleAddNote}
                  disabled={!newNoteText.trim() || updateItemMutation.isPending}
                >
                  {updateItemMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Press Cmd+Enter to send</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this group and all its checklists? This action cannot be undone.
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

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          const targetId = uploadTargetRef.current;
          if (targetId) {
            handleFileUpload(targetId, e.target.files);
            uploadTargetRef.current = null;
          }
          e.target.value = '';
        }}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
      />
    </div>
  );
}
