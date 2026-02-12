import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useUpload } from "@/hooks/use-upload";
import { format } from "date-fns";
import {
  type ChecklistInstance,
  type ChecklistInstanceItem,
  type User,
  type Task,
  type ScheduleItem,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ListChecks,
  ArrowLeft,
  MoreVertical,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  User as UserIcon,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Settings,
  MessageSquare,
  MessageSquareText,
  Ban,
  Asterisk,
  Check,
  X,
  Link2,
  Send,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChecklistAuditLog } from "@shared/schema";

function ChecklistActivityLog({ instanceId }: { instanceId: string }) {
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
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (auditLog.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3 px-2">No activity recorded yet.</p>
    );
  }

  return (
    <div className="mt-2 space-y-1 max-h-48 overflow-auto">
      {auditLog.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2 py-1.5 px-2 text-xs">
          <div className="w-1 h-1 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
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
  );
}

export default function ChecklistInstanceDetail() {
  const { projectId, checklistId } = useParams<{ projectId: string; checklistId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ChecklistInstanceItem | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showNotesDialog, setShowNotesDialog] = useState<ChecklistInstanceItem | null>(null);
  const [newNoteText, setNewNoteText] = useState("");
  const [openAssignPopover, setOpenAssignPopover] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useUpload();
  
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    description: "",
    priority: "medium" as string,
    dueDate: "",
    assigneeId: "",
  });

  const [itemForm, setItemForm] = useState({
    groupName: "",
    description: "",
    tooltip: "",
    isRequired: false,
  });

  const { data: checklist, isLoading } = useQuery<ChecklistInstance>({
    queryKey: ["/api/checklist-instances", checklistId],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instances/${checklistId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch checklist");
      return res.json();
    },
    enabled: !!checklistId,
  });

  const { data: items = [] } = useQuery<ChecklistInstanceItem[]>({
    queryKey: ["/api/checklist-instances", checklistId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instances/${checklistId}/items`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: !!checklistId,
  });

  const { data: teamMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Fetch tasks for this project for linking
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

  // Fetch schedule items for this project for linking
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

  const updateChecklistMutation = useMutation({
    mutationFn: async (data: Partial<ChecklistInstance>) => {
      const res = await apiRequest(`/api/checklist-instances/${checklistId}`, "PATCH", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", { projectId }] });
      toast({ title: "Checklist updated" });
      setShowSettingsDialog(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update checklist.", variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<ChecklistInstanceItem> }) => {
      const res = await apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", data);
      return res.json();
    },
    onSuccess: (updatedItem) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key) || key.length === 0) return false;
          return key[0] === "/api/checklist-instances" || 
                 key[0] === "/api/checklist-instance-groups" || 
                 key[0] === "/api/checklist-items";
        }
      });
      if (showNotesDialog && showNotesDialog.id === updatedItem.id) {
        setShowNotesDialog(updatedItem);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update item.", variant: "destructive" });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: typeof itemForm) => {
      const res = await apiRequest(`/api/checklist-instances/${checklistId}/items`, "POST", {
        ...data,
        order: items.length,
        groupOrder: 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId] });
      toast({ title: "Item added" });
      setShowAddItemDialog(false);
      setItemForm({ groupName: "", description: "", tooltip: "", isRequired: false });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add item.", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest(`/api/checklist-instance-items/${itemId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId] });
      toast({ title: "Item deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" });
    },
  });

  const handleToggleItem = (item: ChecklistInstanceItem) => {
    const isCompleting = item.status !== "completed";
    const newStatus = isCompleting ? "completed" : "pending";
    updateItemMutation.mutate({
      itemId: item.id,
      data: {
        status: newStatus,
        completedAt: isCompleting ? new Date() : null,
        completedBy: isCompleting ? user?.id : null,
        completedByName: isCompleting ? user?.name : null,
      },
    });
  };

  const handleFileUpload = async (itemId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const item = items.find(i => i.id === itemId);
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
          uploadedBy: user?.name || "Unknown",
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
    const item = items.find(i => i.id === itemId);
    const existingAttachments = Array.isArray(item?.attachmentIds) ? [...(item.attachmentIds as any[])] : [];
    existingAttachments.splice(attachmentIndex, 1);
    updateItemMutation.mutate({
      itemId,
      data: { attachmentIds: existingAttachments }
    });
  };

  const isImageType = (contentType: string) => contentType?.startsWith('image/');

  const handleMarkNA = (item: ChecklistInstanceItem) => {
    updateItemMutation.mutate({
      itemId: item.id,
      data: {
        status: "na",
        completedAt: new Date(),
        completedBy: user?.id,
        completedByName: user?.name,
      },
    });
  };

  // Helper to parse notes into feed entries
  const parseNoteFeed = (notes: string | null | undefined): Array<{ author: string; date: string; text: string }> => {
    if (!notes) return [];
    
    try {
      const parsed = JSON.parse(notes);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 'text' in parsed[0]) {
        return parsed;
      }
      // Invalid JSON array format - treat as legacy text
      return [{ author: "Previous note", date: new Date().toISOString(), text: notes }];
    } catch {
      // Plain text format - treat as legacy entry
      return [{ author: "Previous note", date: new Date().toISOString(), text: notes }];
    }
  };

  const handleAddNote = () => {
    if (!showNotesDialog || !newNoteText.trim()) return;
    
    // Get existing notes (properly parsed)
    const existingNotes = parseNoteFeed(showNotesDialog.notes);
    
    // Add new note entry
    const newEntry = {
      author: user?.name || "Unknown",
      date: new Date().toISOString(),
      text: newNoteText.trim()
    };
    existingNotes.push(newEntry);
    
    updateItemMutation.mutate({
      itemId: showNotesDialog.id,
      data: { notes: JSON.stringify(existingNotes) },
    });
    setNewNoteText("");
  };

  const handleOpenSettings = () => {
    if (checklist) {
      setSettingsForm({
        name: checklist.name,
        description: checklist.description || "",
        priority: checklist.priority || "medium",
        dueDate: checklist.dueDate ? format(new Date(checklist.dueDate), "yyyy-MM-dd") : "",
        assigneeId: checklist.assigneeId || "",
      });
      setShowSettingsDialog(true);
    }
  };

  const handleSaveSettings = () => {
    const assignee = teamMembers.find(u => u.id === settingsForm.assigneeId);
    updateChecklistMutation.mutate({
      name: settingsForm.name,
      description: settingsForm.description,
      priority: settingsForm.priority,
      dueDate: settingsForm.dueDate ? new Date(settingsForm.dueDate) : null,
      assigneeId: settingsForm.assigneeId || null,
      assigneeName: assignee?.name || null,
    });
  };

  const handleCompleteChecklist = () => {
    updateChecklistMutation.mutate({
      status: "completed",
      completedAt: new Date(),
      completedBy: user?.id,
      completedByName: user?.name,
    });
  };

  const handleExportPdf = async () => {
    if (!checklist) return;
    setIsExportingPdf(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ChecklistPdfDocument } = await import("@/components/checklists/ChecklistPdfDocument");
      const pdfGroups = Object.entries(groupedItems).map(([groupName, groupItems]) => ({
        id: groupName,
        name: groupName,
        assigneeName: undefined,
        items: groupItems.map((i: ChecklistInstanceItem) => ({
          ...i,
          assigneeName: teamMembers?.find((u: User) => u.id === i.assigneeId)?.name,
          completedByName: i.completedByName || teamMembers?.find((u: User) => u.id === i.completedBy)?.name,
        })),
      }));
      const exportDate = format(new Date(), "MMM d, yyyy h:mm a");
      const blob = await pdf(
        ChecklistPdfDocument({ checklist, groups: pdfGroups, projectName: checklist.projectId || "", exportDate })
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checklist-${checklist.name.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "PDF exported successfully" });
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast({ title: "Failed to export PDF", description: error.message, variant: "destructive" });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, ChecklistInstanceItem[]> = {};
    items.forEach(item => {
      const groupName = item.groupName || "Ungrouped";
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(item);
    });
    
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.order - b.order);
    });
    
    return groups;
  }, [items]);

  // Get current group names
  const allGroupNames = useMemo(() => Object.keys(groupedItems), [groupedItems]);

  // Clean up stale collapsed groups when data changes
  useEffect(() => {
    setCollapsedGroups(prev => {
      const validGroups = new Set<string>();
      prev.forEach(groupName => {
        if (allGroupNames.includes(groupName)) {
          validGroups.add(groupName);
        }
      });
      // Only update if there are stale entries
      if (validGroups.size !== prev.size) {
        return validGroups;
      }
      return prev;
    });
  }, [allGroupNames]);

  // Compute allExpanded from actual state (only count valid groups)
  const allExpanded = allGroupNames.length > 0 && collapsedGroups.size === 0;

  const toggleAllGroups = () => {
    if (allExpanded) {
      // Collapse all
      setCollapsedGroups(new Set(allGroupNames));
    } else {
      // Expand all
      setCollapsedGroups(new Set());
    }
  };

  const completedCount = items.filter(i => i.status === "completed" || i.status === "na").length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0;

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return <Badge className={styles[priority] || styles.medium}>{priority}</Badge>;
  };

  if (isLoading || !checklist) {
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => navigate(`/projects/${projectId}/checklists`)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold truncate max-w-[300px]">{checklist.name}</h1>
          {getPriorityBadge(checklist.priority || "medium")}
          {checklist.status === "completed" ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          ) : checklist.status === "in_progress" || progress > 0 ? (
            <Badge className="bg-[#bba7db]/20 text-[#8b6bb8] dark:bg-[#bba7db]/10 dark:text-[#bba7db]">
              In Progress
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-muted-foreground">
              Not Started
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            data-testid="button-export-pdf"
          >
            {isExportingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleOpenSettings}
            data-testid="button-settings"
          >
            <Settings className="h-3 w-3" />
          </Button>
          {checklist.status !== "completed" && (
            <Button
              size="sm"
              className="h-6 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={handleCompleteChecklist}
              disabled={progress < 100}
              data-testid="button-complete-checklist"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Complete
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Info */}
      <div className={`h-9 flex items-center justify-between px-2 border-b flex-shrink-0 transition-colors ${
        (checklist.status === "in_progress" || progress > 0) && checklist.status !== "completed"
          ? "bg-[#bba7db]/5 border-[#bba7db]/20"
          : "bg-background border-border"
      }`}>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {checklist.assigneeName && (
            <span className="flex items-center gap-1">
              <UserIcon className="h-3 w-3" />
              {checklist.assigneeName}
            </span>
          )}
          {checklist.dueDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Due {format(new Date(checklist.dueDate), "MMM d, yyyy")}
            </span>
          )}
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {completedCount}/{totalCount} items
          </span>
          
          {/* Link to Task/Schedule (Read-only display) */}
          {(checklist.linkedTaskId || checklist.linkedScheduleItemId) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-[#bba7db]" data-testid="linked-item-display">
                  <Link2 className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">
                    {checklist.linkedTaskId 
                      ? projectTasks.find(t => t.id === checklist.linkedTaskId)?.title || "Task"
                      : scheduleItems.find(s => s.id === checklist.linkedScheduleItemId)?.name || "Schedule"
                    }
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Linked to {checklist.linkedTaskId ? "task" : "schedule item"}. Edit from checklists list.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-2 w-48">
          <Progress value={progress} className="h-2" />
          <span className="text-xs font-medium w-10">{progress}%</span>
        </div>
      </div>

      {/* Row 3: Expand/Collapse & Add */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={toggleAllGroups}
                data-testid="button-toggle-expand"
              >
                <ChevronsDownUp className={`h-3.5 w-3.5 transition-transform ${allExpanded ? '' : 'rotate-180'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{allExpanded ? 'Collapse all' : 'Expand all'}</TooltipContent>
          </Tooltip>
          {checklist.description && (
            <span className="text-xs text-muted-foreground">
              {checklist.description}
            </span>
          )}
        </div>
        {checklist.status !== "completed" && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setShowAddItemDialog(true)}
            data-testid="button-add-item"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Item
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <ListChecks className="h-12 w-12 opacity-50" />
            <p className="text-sm">No items in this checklist</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddItemDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add First Item
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([groupName, groupItems]) => {
              const isCollapsed = collapsedGroups.has(groupName);
              const groupCompleted = groupItems.filter(i => i.status === "completed" || i.status === "na").length;
              
              return (
                <div key={groupName} className="border rounded-md">
                  <Collapsible open={!isCollapsed} onOpenChange={() => toggleGroup(groupName)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          <span className="font-medium text-sm">{groupName}</span>
                          <Badge variant="secondary" className="text-xs">
                            {groupCompleted}/{groupItems.length}
                          </Badge>
                        </div>
                        <Progress
                          value={groupItems.length > 0 ? (groupCompleted / groupItems.length) * 100 : 0}
                          className="h-1 w-24"
                        />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t">
                        {groupItems.map((item) => {
                          const itemAttachments = Array.isArray(item.attachmentIds) ? (item.attachmentIds as any[]) : [];
                          return (
                          <div key={item.id} className="border-b last:border-b-0">
                          <div
                            className={`flex items-center gap-2 px-3 py-1.5 ${
                              item.status === "completed" ? "bg-green-50/50 dark:bg-green-900/10" :
                              item.status === "na" ? "bg-gray-50/50 dark:bg-gray-900/10" : ""
                            }`}
                          >
                            {/* Checkbox */}
                            {item.status === "na" ? (
                              <div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                <Ban className="h-2.5 w-2.5 text-gray-500" />
                              </div>
                            ) : (
                              <Checkbox
                                checked={item.status === "completed"}
                                onCheckedChange={() => handleToggleItem(item)}
                                disabled={checklist.status === "completed"}
                                className="h-4 w-4 shrink-0"
                                data-testid={`checkbox-item-${item.id}`}
                              />
                            )}
                            
                            {/* Description */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className={`text-xs truncate ${item.status !== "pending" ? "line-through text-muted-foreground" : ""}`}>
                                  {item.description}
                                </span>
                                {item.isRequired && (
                                  <Asterisk className="h-2.5 w-2.5 text-red-500 shrink-0" />
                                )}
                                {item.completedByName && item.status === "completed" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-0.5 text-green-600 shrink-0 ml-auto">
                                        <CheckCircle2 className="h-3 w-3" />
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
                            
                            {/* Actions */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              {/* Assignee Avatar with Popover */}
                              <Popover open={openAssignPopover === item.id} onOpenChange={(open) => setOpenAssignPopover(open ? item.id : null)}>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" data-testid={`button-assign-item-${item.id}`}>
                                    {item.assigneeName ? (
                                      <Avatar className="h-4 w-4">
                                        <AvatarFallback className="text-[8px] bg-[#bba7db]/20 text-[#bba7db]">
                                          {item.assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                    ) : (
                                      <div className="h-4 w-4 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center">
                                        <UserIcon className="h-2.5 w-2.5 text-muted-foreground/30" />
                                      </div>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-44 p-1" align="end">
                                  <div className="text-xs font-medium text-muted-foreground px-2 py-1">Assign to</div>
                                  {teamMembers.length === 0 ? (
                                    <div className="text-xs text-muted-foreground px-2 py-2">No team members</div>
                                  ) : (
                                    <div className="max-h-40 overflow-auto">
                                      {item.assigneeId && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-start text-xs h-7"
                                          onClick={() => {
                                            updateItemMutation.mutate({
                                              itemId: item.id,
                                              data: { assigneeId: null, assigneeName: null }
                                            });
                                            setOpenAssignPopover(null);
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
                                          className={`w-full justify-start text-xs h-7 ${item.assigneeId === member.id ? 'bg-accent' : ''}`}
                                          onClick={() => {
                                            updateItemMutation.mutate({
                                              itemId: item.id,
                                              data: { assigneeId: member.id, assigneeName: member.name }
                                            });
                                            setOpenAssignPopover(null);
                                          }}
                                        >
                                          <Avatar className="h-4 w-4 mr-2">
                                            <AvatarFallback className="text-[8px] bg-[#bba7db]/20 text-[#bba7db]">
                                              {member.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="truncate">{member.name}</span>
                                          {item.assigneeId === member.id && (
                                            <Check className="h-3 w-3 ml-auto text-[#bba7db] shrink-0" />
                                          )}
                                        </Button>
                                      ))}
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>

                              {/* Notes Icon */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => setShowNotesDialog(item)}
                                data-testid={`button-notes-${item.id}`}
                              >
                                {item.notes ? (
                                  <MessageSquareText className="h-3 w-3 text-blue-500" />
                                ) : (
                                  <MessageSquare className="h-3 w-3 text-muted-foreground/50" />
                                )}
                              </Button>
                              
                              {/* Attachment Icon */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    disabled={isUploading && uploadingItemId === item.id}
                                    onClick={() => {
                                      setUploadingItemId(item.id);
                                      fileInputRef.current?.click();
                                    }}
                                    data-testid={`button-attach-${item.id}`}
                                  >
                                    {isUploading && uploadingItemId === item.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Paperclip className={`h-3 w-3 ${Array.isArray(item.attachmentIds) && (item.attachmentIds as any[]).length > 0 ? 'text-[#bba7db]' : 'text-muted-foreground/50'}`} />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {Array.isArray(item.attachmentIds) && (item.attachmentIds as any[]).length > 0
                                    ? `${(item.attachmentIds as any[]).length} attachment(s)`
                                    : "Attach file"}
                                </TooltipContent>
                              </Tooltip>
                              
                              {/* Menu */}
                              {checklist.status !== "completed" && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-5 w-5">
                                      <MoreVertical className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {item.status !== "na" && (
                                      <DropdownMenuItem onClick={() => handleMarkNA(item)}>
                                        <Ban className="h-3 w-3 mr-2" />
                                        Mark as N/A
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => deleteItemMutation.mutate(item.id)}
                                    >
                                      <Trash2 className="h-3 w-3 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                          {/* Attachments Display */}
                          {itemAttachments.length > 0 && (
                            <div className="px-3 py-1 bg-muted/20 flex items-center gap-2 flex-wrap">
                              {itemAttachments.map((att: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-1 bg-card border rounded px-1.5 py-0.5 text-[10px] group/att">
                                  {isImageType(att.contentType) ? (
                                    <ImageIcon className="h-3 w-3 text-blue-500 shrink-0" />
                                  ) : (
                                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                                  )}
                                  <a
                                    href={att.path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground hover:underline truncate max-w-[120px]"
                                  >
                                    {att.name}
                                  </a>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 invisible group-hover/att:visible"
                                    onClick={() => handleRemoveAttachment(item.id, idx)}
                                  >
                                    <X className="h-2.5 w-2.5 text-destructive" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          </div>
                        );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity Log Section */}
      <div className="px-4 pb-4">
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover-elevate px-2 py-1 rounded-md w-full">
            <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
            <Clock className="h-3 w-3" />
            Activity Log
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ChecklistActivityLog instanceId={id!} />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Hidden File Input for Attachments */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        multiple
        onChange={(e) => {
          if (uploadingItemId) {
            handleFileUpload(uploadingItemId, e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Checklist Settings</DialogTitle>
            <DialogDescription>
              Update checklist details.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="settingsName">Name</Label>
              <Input
                id="settingsName"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                data-testid="input-settings-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settingsDescription">Description</Label>
              <Textarea
                id="settingsDescription"
                value={settingsForm.description}
                onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={settingsForm.priority}
                  onValueChange={(value) => setSettingsForm({ ...settingsForm, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={settingsForm.dueDate}
                  onChange={(e) => setSettingsForm({ ...settingsForm, dueDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select
                value={settingsForm.assigneeId}
                onValueChange={(value) => setSettingsForm({ ...settingsForm, assigneeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={updateChecklistMutation.isPending}>
              {updateChecklistMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItemDialog} onOpenChange={setShowAddItemDialog}>
        <DialogContent data-testid="dialog-add-item">
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
            <DialogDescription>
              Add a new item to the checklist.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="itemGroupName">Checklist (Group)</Label>
              {Object.keys(groupedItems).length > 0 ? (
                <Select
                  value={itemForm.groupName}
                  onValueChange={(value) => setItemForm({ ...itemForm, groupName: value === "__new__" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-group">
                    <SelectValue placeholder="Select a checklist..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(groupedItems).map((groupName) => (
                      <SelectItem key={groupName} value={groupName}>
                        {groupName}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">
                      <span className="flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        New Checklist...
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="itemGroupName"
                  value={itemForm.groupName}
                  onChange={(e) => setItemForm({ ...itemForm, groupName: e.target.value })}
                  placeholder="e.g., Exterior, Interior..."
                />
              )}
              {itemForm.groupName === "" && Object.keys(groupedItems).length > 0 && (
                <Input
                  className="mt-2"
                  value={itemForm.groupName}
                  onChange={(e) => setItemForm({ ...itemForm, groupName: e.target.value })}
                  placeholder="Enter new checklist name..."
                  data-testid="input-new-group"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="itemDescription">Description *</Label>
              <Input
                id="itemDescription"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="What needs to be checked?"
                data-testid="input-item-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="itemTooltip">Additional Notes</Label>
              <Textarea
                id="itemTooltip"
                value={itemForm.tooltip}
                onChange={(e) => setItemForm({ ...itemForm, tooltip: e.target.value })}
                placeholder="Additional guidance..."
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="itemRequired"
                checked={itemForm.isRequired}
                onCheckedChange={(checked) => setItemForm({ ...itemForm, isRequired: !!checked })}
                data-testid="checkbox-required"
              />
              <Label htmlFor="itemRequired" className="text-sm font-normal">
                Required item (must be completed before checklist can be closed)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItemDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createItemMutation.mutate(itemForm)}
              disabled={createItemMutation.isPending || !itemForm.description.trim()}
              data-testid="button-add-item-submit"
            >
              {createItemMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Item"
              )}
            </Button>
          </DialogFooter>
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
            {/* Notes Feed */}
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
                    {noteEntries.map((entry, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className="text-[9px] bg-[#bba7db]/20 text-[#bba7db]">
                            {entry.author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-medium">{entry.author}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(entry.date), "MMM d 'at' h:mm a")}
                            </span>
                          </div>
                          <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{entry.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </ScrollArea>
            
            {/* Add Note Input */}
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
                  className="h-8 w-8 shrink-0 self-end bg-[#bba7db] hover:bg-[#a896c9]"
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
    </div>
  );
}
