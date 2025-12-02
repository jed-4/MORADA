import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import {
  type ChecklistInstance,
  type ChecklistInstanceItem,
  type User,
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
  Settings,
  MessageSquare,
  Ban,
} from "lucide-react";

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
  const [itemNote, setItemNote] = useState("");
  
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", { projectId }] });
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
    const newStatus = item.status === "completed" ? "pending" : "completed";
    updateItemMutation.mutate({
      itemId: item.id,
      data: {
        status: newStatus,
        completedAt: newStatus === "completed" ? new Date() : null,
        completedBy: newStatus === "completed" ? user?.id : null,
        completedByName: newStatus === "completed" ? user?.name : null,
      },
    });
  };

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

  const handleSaveNote = () => {
    if (!showNotesDialog) return;
    updateItemMutation.mutate({
      itemId: showNotesDialog.id,
      data: { notes: itemNote },
    });
    setShowNotesDialog(null);
    setItemNote("");
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
          {checklist.status === "completed" && (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
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
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
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
        </div>
        <div className="flex items-center gap-2 w-48">
          <Progress value={progress} className="h-2" />
          <span className="text-xs font-medium w-10">{progress}%</span>
        </div>
      </div>

      {/* Row 3: Search & Add */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="text-xs text-muted-foreground">
          {checklist.description}
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
                        {groupItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-start gap-3 p-3 border-b last:border-b-0 ${
                              item.status === "completed" ? "bg-green-50/50 dark:bg-green-900/10" :
                              item.status === "na" ? "bg-gray-50/50 dark:bg-gray-900/10" : ""
                            }`}
                          >
                            <div className="pt-0.5">
                              {item.status === "na" ? (
                                <div className="h-5 w-5 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                  <Ban className="h-3 w-3 text-gray-500" />
                                </div>
                              ) : (
                                <Checkbox
                                  checked={item.status === "completed"}
                                  onCheckedChange={() => handleToggleItem(item)}
                                  disabled={checklist.status === "completed"}
                                  className="h-5 w-5"
                                  data-testid={`checkbox-item-${item.id}`}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className={`text-sm ${item.status !== "pending" ? "line-through text-muted-foreground" : ""}`}>
                                    {item.description}
                                    {item.isRequired && (
                                      <span className="text-red-500 ml-1">*</span>
                                    )}
                                  </p>
                                  {item.tooltip && (
                                    <p className="text-xs text-muted-foreground mt-1">{item.tooltip}</p>
                                  )}
                                  {item.notes && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">
                                      Note: {item.notes}
                                    </p>
                                  )}
                                  {item.completedByName && item.completedAt && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {item.status === "na" ? "Marked N/A" : "Completed"} by {item.completedByName} on{" "}
                                      {format(new Date(item.completedAt), "MMM d, yyyy 'at' h:mm a")}
                                    </p>
                                  )}
                                </div>
                                {checklist.status !== "completed" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setItemNote(item.notes || "");
                                          setShowNotesDialog(item);
                                        }}
                                      >
                                        <MessageSquare className="h-3 w-3 mr-2" />
                                        Add Note
                                      </DropdownMenuItem>
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
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              <Label htmlFor="itemGroupName">Group</Label>
              <Input
                id="itemGroupName"
                value={itemForm.groupName}
                onChange={(e) => setItemForm({ ...itemForm, groupName: e.target.value })}
                placeholder="e.g., Exterior, Interior..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="itemDescription">Description *</Label>
              <Input
                id="itemDescription"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="What needs to be checked?"
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

      {/* Notes Dialog */}
      <Dialog open={!!showNotesDialog} onOpenChange={() => setShowNotesDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Note</DialogTitle>
            <DialogDescription>
              Add a note for this checklist item.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Textarea
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="Enter note..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotesDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNote}>
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
