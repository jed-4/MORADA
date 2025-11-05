import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type Schedule as ScheduleType, type ScheduleItem, type Contact } from "@shared/schema";
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
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
import { Textarea } from "@/components/ui/textarea";
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
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CasvaScheduleList } from "@/components/schedule/CasvaScheduleList";
import Gantt from "./Gantt";

interface ScheduleParams {
  projectId: string;
}

// Setup moment localizer for BigCalendar
const localizer = momentLocalizer(moment);

export default function Schedule() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const params = useParams<ScheduleParams>();
  const projectId = params.projectId || currentProject?.id;

  const [activeView, setActiveView] = useState<"list" | "gantt" | "calendar">("gantt");
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(true);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    notes: "",
    type: "task",
    status: "not_started",
    priority: "medium",
    startDate: "",
    endDate: "",
    assignedToId: "",
    parentItemId: "",
    progressPercent: 0,
  });
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

  // Fetch schedule items using unified endpoint (all three views use the same data)
  const { data: scheduleItems = [], isLoading: itemsLoading } = useQuery<ScheduleItem[]>({
    queryKey: [`/api/projects/${projectId}/schedule-items`],
    enabled: !!projectId,
  });

  // Fetch contacts for assignee selection
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  // Fetch schedule item status options from Field Settings
  const { data: statusOptions = [] } = useQuery({
    queryKey: ["/api/field-options", "schedule_item.status"],
    queryFn: async () => {
      const categories = await fetch("/api/field-categories").then(r => r.json());
      const statusCategory = categories.find((c: any) => c.key === "schedule_item.status");
      if (!statusCategory) return [];
      const options = await fetch(`/api/field-categories/${statusCategory.id}/options`).then(r => r.json());
      return options.filter((opt: any) => opt.isActive);
    },
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
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      setShowItemDialog(false);
      setEditingItem(null);
      resetForm();
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

  // Update schedule item
  const updateItemMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!editingItem) throw new Error("No item selected");
      const response = await fetch(`/api/schedule-items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update item");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      setShowItemDialog(false);
      setEditingItem(null);
      resetForm();
      toast({
        title: "Item updated",
        description: "Schedule item has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      notes: "",
      type: "task",
      status: "not_started",
      priority: "medium",
      startDate: "",
      endDate: "",
      assignedToId: "",
      parentItemId: "",
      progressPercent: 0,
    });
    setDescriptionExpanded(false);
    setNotesExpanded(false);
  };

  // Handle submit
  const handleSubmit = () => {
    if (!schedule) {
      toast({
        title: "Error",
        description: "No schedule found",
        variant: "destructive",
      });
      return;
    }

    if (!formData.name || !formData.startDate || !formData.endDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const data = {
      scheduleId: schedule.id,
      ...formData,
      assignedToId: formData.assignedToId || undefined,
      parentItemId: formData.parentItemId || undefined,
    };

    if (editingItem) {
      updateItemMutation.mutate(data);
    } else {
      createItemMutation.mutate(data);
    }
  };

  // Load editing item into form
  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name || "",
        description: editingItem.description || "",
        notes: editingItem.notes || "",
        type: editingItem.type || "task",
        status: editingItem.status || "not_started",
        priority: editingItem.priority || "medium",
        startDate: editingItem.startDate ? new Date(editingItem.startDate).toISOString().split('T')[0] : "",
        endDate: editingItem.endDate ? new Date(editingItem.endDate).toISOString().split('T')[0] : "",
        assignedToId: editingItem.assignedToId || "",
        parentItemId: editingItem.parentItemId || "",
        progressPercent: editingItem.progressPercent || 0,
      });
      // Auto-expand description/notes only if they have content
      setDescriptionExpanded(!!(editingItem.description && editingItem.description.trim()));
      setNotesExpanded(!!(editingItem.notes && editingItem.notes.trim()));
    } else {
      resetForm();
    }
  }, [editingItem]);

  // Auto-create schedule if it doesn't exist
  useEffect(() => {
    if (!scheduleLoading && !schedule && projectId && !createScheduleMutation.isPending) {
      createScheduleMutation.mutate();
    }
  }, [scheduleLoading, schedule, projectId]);

  // Memoize calendar events (must be before early returns)
  const calendarEvents = useMemo(() => {
    return scheduleItems.map(item => ({
      id: item.id,
      title: item.name,
      start: new Date(item.startDate),
      end: new Date(item.endDate),
      resource: item,
    }));
  }, [scheduleItems]);

  // Get parent items (stages) for dropdown - exclude the current editing item and its children
  const parentItems = useMemo(() => {
    return scheduleItems.filter(item => {
      // Must not have a parent (top-level items only)
      if (item.parentItemId) return false;
      // Exclude the current editing item (can't be its own parent)
      if (editingItem && item.id === editingItem.id) return false;
      return true;
    });
  }, [scheduleItems, editingItem]);

  // Memoize filtered items computation
  const filteredItems = useMemo(() => {
    return scheduleItems.filter((item) => {
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
  }, [scheduleItems, filters]);

  // Calculate Gantt timeline boundaries (memoized for performance)
  const ganttTimeline = useMemo(() => {
    if (filteredItems.length === 0) {
      return { timelineStart: new Date(), timelineEnd: new Date(), totalDays: 1 };
    }
    
    const allDates = [
      ...filteredItems.map(i => new Date(i.startDate)),
      ...filteredItems.map(i => new Date(i.endDate))
    ];
    const timelineStart = new Date(Math.min(...allDates.map(d => d.getTime())));
    const timelineEnd = new Date(Math.max(...allDates.map(d => d.getTime())));
    // Add 1 to include both start and end days (inclusive)
    const totalDays = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    return { timelineStart, timelineEnd, totalDays };
  }, [filteredItems]);

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

  // Calendar event style getter
  const eventStyleGetter = (event: any) => {
    const item = event.resource as ScheduleItem;
    let backgroundColor = "#6366f1"; // default blue
    
    // Color by type
    if (item.type === "inspection") backgroundColor = "#ef4444";
    else if (item.type === "milestone") backgroundColor = "#8b5cf6";
    else if (item.type === "delivery") backgroundColor = "#f59e0b";
    else if (item.type === "meeting") backgroundColor = "#10b981";
    
    // Adjust for status
    if (item.status === "completed") backgroundColor = "#9ca3af";
    else if (item.status === "on_hold") backgroundColor = "#6b7280";
    
    return {
      style: {
        backgroundColor,
        borderRadius: "4px",
        opacity: 0.9,
        color: "white",
        border: "0px",
        display: "block",
      },
    };
  };

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
            <TabsTrigger value="gantt" data-testid="tab-gantt">
              <GanttChart className="w-4 h-4 mr-2" />
              Gantt
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">
              <CalendarIcon className="w-4 h-4 mr-2" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="list" data-testid="tab-list">
              <List className="w-4 h-4 mr-2" />
              List
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
              <CasvaScheduleList
                items={filteredItems}
                onEditItem={(item) => {
                  setEditingItem(item);
                  setShowItemDialog(true);
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="gantt" className="h-full m-0">
            <Gantt
              onEditItem={(item) => {
                setEditingItem(item);
                setShowItemDialog(true);
              }}
            />
          </TabsContent>

          <TabsContent value="calendar" className="h-full m-0">
            <div className="h-full p-4" style={{ minHeight: '600px' }}>
              <BigCalendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                eventPropGetter={eventStyleGetter}
                onSelectEvent={(event) => {
                  if (schedule?.status !== "locked") {
                    setEditingItem(event.resource as ScheduleItem);
                    setShowItemDialog(true);
                  }
                }}
                views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                defaultView={Views.MONTH}
                popup
                data-testid="calendar-view"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create/Edit Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Schedule Item" : "Add Schedule Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the schedule item details." : "Create a new item in the schedule."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="item-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="item-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Foundation Inspection"
                data-testid="input-item-name"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="item-description">Description</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                  data-testid="button-toggle-description"
                >
                  {descriptionExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              {descriptionExpanded && (
                <Textarea
                  id="item-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add details about this schedule item..."
                  rows={3}
                  data-testid="input-item-description"
                />
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="item-notes">Notes</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setNotesExpanded(!notesExpanded)}
                  data-testid="button-toggle-notes"
                >
                  {notesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              {notesExpanded && (
                <>
                  <Textarea
                    id="item-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add internal notes about this schedule item..."
                    rows={4}
                    data-testid="input-item-notes"
                  />
                  <p className="text-xs text-muted-foreground">
                    Internal notes for tracking progress, decisions, or important details.
                  </p>
                </>
              )}
            </div>

            {/* Parent Item (Stage) Selector */}
            <div className="space-y-2">
              <Label htmlFor="item-parent">Stage (Parent Item)</Label>
              <Select
                value={formData.parentItemId || "none"}
                onValueChange={(value) => setFormData({ ...formData, parentItemId: value === "none" ? "" : value })}
              >
                <SelectTrigger id="item-parent" data-testid="select-item-parent">
                  <SelectValue placeholder="None (Top-level item)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top-level item)</SelectItem>
                  {parentItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select a parent item to make this a sub-item. Leave as "None" to create a top-level stage.
              </p>
            </div>

            {/* Type and Priority Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger id="item-type" data-testid="select-item-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="milestone">Milestone</SelectItem>
                    <SelectItem value="inspection">Inspection</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger id="item-priority" data-testid="select-item-priority">
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
            </div>

            {/* Status and Assignee Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger id="item-status" data-testid="select-item-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option: any) => (
                      <SelectItem key={option.id} value={option.key}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-assignee">Assignee</Label>
                <Select
                  value={formData.assignedToId || "unassigned"}
                  onValueChange={(value) => setFormData({ ...formData, assignedToId: value === "unassigned" ? "" : value })}
                >
                  <SelectTrigger id="item-assignee" data-testid="select-item-assignee">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">None</SelectItem>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-start-date">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="item-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => {
                    setFormData({ ...formData, startDate: e.target.value });
                  }}
                  data-testid="input-item-start-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-duration">Duration (days)</Label>
                <Input
                  id="item-duration"
                  type="number"
                  min="1"
                  placeholder="Auto"
                  value={
                    formData.startDate && formData.endDate
                      ? Math.ceil((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
                      : ''
                  }
                  onChange={(e) => {
                    const days = parseInt(e.target.value, 10);
                    if (formData.startDate && !isNaN(days) && days > 0) {
                      const start = new Date(formData.startDate);
                      const end = new Date(start);
                      end.setDate(start.getDate() + days - 1);
                      setFormData({ ...formData, endDate: end.toISOString().split('T')[0] });
                    }
                  }}
                  data-testid="input-item-duration"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-end-date">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="item-end-date"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  data-testid="input-item-end-date"
                />
              </div>
            </div>

            {/* Progress */}
            {(editingItem || formData.status === "in_progress") && (
              <div className="space-y-2">
                <Label htmlFor="item-progress">Progress (%)</Label>
                <Input
                  id="item-progress"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progressPercent}
                  onChange={(e) => {
                    const value = e.target.value === '' ? 0 : Math.min(100, Math.max(0, parseInt(e.target.value, 10)));
                    setFormData({ ...formData, progressPercent: isNaN(value) ? 0 : value });
                  }}
                  data-testid="input-item-progress"
                />
              </div>
            )}

            {/* Dependencies Section */}
            {editingItem && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label>Dependencies (Predecessors)</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="button-add-dependency"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Predecessor
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {allItems
                        .filter(item => 
                          item.id !== editingItem.id && 
                          !(editingItem.dependencies as any[] || []).some((d: any) => d.id === item.id)
                        )
                        .map(item => (
                          <DropdownMenuItem
                            key={item.id}
                            onClick={async () => {
                              try {
                                const updatedItem = await apiRequest(`/api/schedule-items/${editingItem.id}/dependencies`, "POST", {
                                  predecessorId: item.id,
                                  type: "FS",
                                });
                                // Update local editingItem state to reflect the change immediately
                                setEditingItem(updatedItem);
                                queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
                                toast({ title: "Dependency added" });
                              } catch (error: any) {
                                toast({
                                  title: "Failed to add dependency",
                                  description: error.error || error.message || "This would create a circular dependency",
                                  variant: "destructive",
                                });
                              }
                            }}
                            data-testid={`option-add-dependency-${item.id}`}
                          >
                            {item.name}
                          </DropdownMenuItem>
                        ))}
                      {allItems.filter(item => 
                        item.id !== editingItem.id && 
                        !(editingItem.dependencies as any[] || []).some((d: any) => d.id === item.id)
                      ).length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No available items
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2">
                  {(editingItem.dependencies as any[] || []).length > 0 ? (
                    (editingItem.dependencies as any[]).map((dep: any) => {
                      const predItem = allItems.find(i => i.id === dep.id);
                      return predItem ? (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between p-2 rounded-md border bg-card"
                          data-testid={`dependency-${dep.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium">{predItem.name}</div>
                            <Badge variant="outline" className="text-xs">
                              {dep.type || "FS"}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={async () => {
                              try {
                                const updatedItem = await apiRequest(
                                  `/api/schedule-items/${editingItem.id}/dependencies/${dep.id}`,
                                  "DELETE"
                                );
                                // Update local editingItem state to reflect the change immediately
                                setEditingItem(updatedItem);
                                queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
                                toast({ title: "Dependency removed" });
                              } catch (error) {
                                toast({
                                  title: "Failed to remove dependency",
                                  variant: "destructive",
                                });
                              }
                            }}
                            data-testid={`button-remove-dependency-${dep.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : null;
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No dependencies. This item can start at any time.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Dependencies control when this item can start. It will wait for predecessor items to finish (Finish-to-Start).
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="border-t pt-4 mt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowItemDialog(false);
                setEditingItem(null);
                resetForm();
              }}
              data-testid="button-cancel-item"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createItemMutation.isPending || updateItemMutation.isPending}
              data-testid="button-save-item"
            >
              {(createItemMutation.isPending || updateItemMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
