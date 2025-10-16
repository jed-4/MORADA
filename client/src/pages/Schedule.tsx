import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { type Schedule as ScheduleType, type ScheduleItem, type Contact } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Calendar as CalendarIcon,
  List,
  GanttChart,
  MoreVertical,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Filter,
  Download,
  Upload,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ScheduleParams {
  projectId: string;
}

export default function Schedule() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const params = useParams<ScheduleParams>();
  const projectId = params.projectId || currentProject?.id;

  const [activeView, setActiveView] = useState<"list" | "gantt" | "calendar">("list");
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    assignee: "all",
    type: "all",
    dateRange: "all",
  });

  // Fetch schedule for project
  const { data: schedule, isLoading: scheduleLoading } = useQuery<ScheduleType>({
    queryKey: ["/api/projects", projectId, "schedule"],
    enabled: !!projectId,
  });

  // Fetch schedule items
  const { data: scheduleItems = [], isLoading: itemsLoading } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedules", schedule?.id, "items"],
    enabled: !!schedule?.id,
  });

  // Fetch contacts for assignee selection
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", projectId],
    enabled: !!projectId,
  });

  // Create schedule if it doesn't exist
  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No project selected");
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          name: "Project Schedule",
          status: "offline",
        }),
      });
      if (!response.ok) throw new Error("Failed to create schedule");
      return response.json() as Promise<ScheduleType>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      toast({
        title: "Schedule created",
        description: "Your project schedule has been created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update schedule status
  const updateStatusMutation = useMutation({
    mutationFn: async (status: "offline" | "online" | "locked") => {
      if (!schedule) throw new Error("No schedule found");
      const response = await fetch(`/api/schedules/${schedule.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json() as Promise<ScheduleType>;
    },
    onSuccess: (updatedSchedule) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      const statusLabels = { offline: "Offline", online: "Online", locked: "Locked" };
      toast({
        title: "Status updated",
        description: `Schedule is now ${statusLabels[updatedSchedule.status as keyof typeof statusLabels]}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create schedule item
  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/schedule-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create item");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules", schedule?.id, "items"] });
      setShowItemDialog(false);
      setEditingItem(null);
      toast({
        title: "Item created",
        description: "Schedule item has been added.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-create schedule if it doesn't exist
  useEffect(() => {
    if (!scheduleLoading && !schedule && projectId && !createScheduleMutation.isPending) {
      createScheduleMutation.mutate();
    }
  }, [scheduleLoading, schedule, projectId]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="p-6 max-w-md text-center">
          <CardTitle className="mb-2">No Project Selected</CardTitle>
          <p className="text-muted-foreground">Please select a project to view its schedule.</p>
        </Card>
      </div>
    );
  }

  if (scheduleLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg font-medium">Loading schedule...</div>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "offline":
        return <EyeOff className="w-4 h-4" />;
      case "online":
        return <Eye className="w-4 h-4" />;
      case "locked":
        return <Lock className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "offline":
        return "secondary";
      case "online":
        return "default";
      case "locked":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const filteredItems = scheduleItems.filter((item) => {
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.assignee !== "all" && item.assignedToId !== filters.assignee) return false;
    if (filters.type !== "all" && item.type !== filters.type) return false;
    
    // Date range filtering
    if (filters.dateRange !== "all") {
      const now = new Date();
      const itemStart = new Date(item.startDate);
      const itemEnd = new Date(item.endDate);
      
      switch (filters.dateRange) {
        case "today":
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (itemEnd < today || itemStart >= tomorrow) return false;
          break;
        case "this_week":
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 7);
          if (itemEnd < weekStart || itemStart >= weekEnd) return false;
          break;
        case "this_month":
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          if (itemEnd < monthStart || itemStart >= monthEnd) return false;
          break;
        case "overdue":
          if (itemEnd >= now || item.status === "completed") return false;
          break;
      }
    }
    
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-page-title">
                {schedule?.name || "Project Schedule"}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={getStatusColor(schedule?.status || "offline")} data-testid={`badge-status-${schedule?.status}`}>
                  {getStatusIcon(schedule?.status || "offline")}
                  <span className="ml-1 capitalize">{schedule?.status || "Offline"}</span>
                </Badge>
                {schedule?.status === "locked" && schedule?.lockedBy && (
                  <span className="text-sm text-muted-foreground">
                    {schedule.lockedByName ? `Locked by ${schedule.lockedByName}` : "Locked"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-status-menu">
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Schedule Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate("offline")}
                  disabled={schedule?.status === "offline"}
                  data-testid="menu-item-status-offline"
                >
                  <EyeOff className="w-4 h-4 mr-2" />
                  Set Offline
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate("online")}
                  disabled={schedule?.status === "online"}
                  data-testid="menu-item-status-online"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Set Online
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatusMutation.mutate("locked")}
                  disabled={schedule?.status === "locked"}
                  data-testid="menu-item-status-locked"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Lock Schedule
                </DropdownMenuItem>
                {schedule?.status === "locked" && (
                  <DropdownMenuItem
                    onClick={() => updateStatusMutation.mutate("online")}
                    data-testid="menu-item-unlock"
                  >
                    <Unlock className="w-4 h-4 mr-2" />
                    Unlock Schedule
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="menu-item-templates">
                  <Upload className="w-4 h-4 mr-2" />
                  Load from Template
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menu-item-save-template">
                  <Download className="w-4 h-4 mr-2" />
                  Save as Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={() => {
                setEditingItem(null);
                setShowItemDialog(true);
              }}
              disabled={schedule?.status === "locked"}
              data-testid="button-add-item"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="border-t bg-muted/30 p-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters({ ...filters, status: value })}
                >
                  <SelectTrigger data-testid="select-filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Label className="text-xs">Assignee</Label>
                <Select
                  value={filters.assignee}
                  onValueChange={(value) => setFilters({ ...filters, assignee: value })}
                >
                  <SelectTrigger data-testid="select-filter-assignee">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={filters.type}
                  onValueChange={(value) => setFilters({ ...filters, type: value })}
                >
                  <SelectTrigger data-testid="select-filter-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1">
                <Label className="text-xs">Date Range</Label>
                <Select
                  value={filters.dateRange}
                  onValueChange={(value) => setFilters({ ...filters, dateRange: value })}
                >
                  <SelectTrigger data-testid="select-filter-date-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* View Tabs */}
        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as typeof activeView)} className="px-4">
          <TabsList>
            <TabsTrigger value="list" data-testid="tab-list">
              <List className="w-4 h-4 mr-2" />
              List
            </TabsTrigger>
            <TabsTrigger value="gantt" data-testid="tab-gantt">
              <GanttChart className="w-4 h-4 mr-2" />
              Gantt
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">
              <CalendarIcon className="w-4 h-4 mr-2" />
              Calendar
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Tabs value={activeView} className="h-full">
          <TabsContent value="list" className="h-full m-0 p-4">
            {filteredItems.length === 0 ? (
              <Card className="p-12 text-center">
                <CardTitle className="mb-2">No Schedule Items</CardTitle>
                <p className="text-muted-foreground mb-4">
                  {scheduleItems.length === 0
                    ? "Get started by adding your first schedule item."
                    : "No items match the current filters."}
                </p>
                {scheduleItems.length === 0 && schedule?.status !== "locked" && (
                  <Button onClick={() => setShowItemDialog(true)} data-testid="button-add-first-item">
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Item
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <Card key={item.id} className="hover-elevate" data-testid={`card-item-${item.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium">{item.name}</h3>
                            <Badge variant="outline" className="text-xs">
                              {item.type}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {item.status.replace("_", " ")}
                            </Badge>
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>
                              {new Date(item.startDate).toLocaleDateString()} -{" "}
                              {new Date(item.endDate).toLocaleDateString()}
                            </span>
                            {item.assignedToName && (
                              <span className="flex items-center gap-1">
                                {item.assignedToColor && (
                                  <span
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: item.assignedToColor }}
                                  />
                                )}
                                {item.assignedToName}
                              </span>
                            )}
                            {item.progressPercent > 0 && <span>{item.progressPercent}% complete</span>}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-item-menu-${item.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingItem(item);
                                setShowItemDialog(true);
                              }}
                              data-testid={`menu-item-edit-${item.id}`}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`menu-item-delete-${item.id}`}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="gantt" className="h-full m-0 p-4">
            <Card className="p-12 text-center">
              <CardTitle className="mb-2">Gantt View Coming Soon</CardTitle>
              <p className="text-muted-foreground">
                Visual timeline with drag-and-drop scheduling will be available soon.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="h-full m-0 p-4">
            <Card className="p-12 text-center">
              <CardTitle className="mb-2">Calendar View Coming Soon</CardTitle>
              <p className="text-muted-foreground">
                Monthly and weekly calendar views will be available soon.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create/Edit Item Dialog - Placeholder for now */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Schedule Item" : "Add Schedule Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the schedule item details." : "Create a new item in the schedule."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground text-center py-8">
              Item form will be implemented next...
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowItemDialog(false)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
