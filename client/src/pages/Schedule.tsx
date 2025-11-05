import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const [activeView, setActiveView] = useState<"list" | "gantt" | "calendar">("list");
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "task",
    status: "not_started",
    priority: "medium",
    startDate: "",
    endDate: "",
    assignedToId: "",
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

  // Fetch schedule items
  const { data: scheduleItems = [], isLoading: itemsLoading } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedules", schedule?.id, "items"],
    enabled: !!schedule?.id,
  });

  // Fetch contacts for assignee selection
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/schedules", schedule?.id, "items"] });
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
      type: "task",
      status: "not_started",
      priority: "medium",
      startDate: "",
      endDate: "",
      assignedToId: "",
      progressPercent: 0,
    });
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
        type: editingItem.type || "task",
        status: editingItem.status || "not_started",
        priority: editingItem.priority || "medium",
        startDate: editingItem.startDate ? new Date(editingItem.startDate).toISOString().split('T')[0] : "",
        endDate: editingItem.endDate ? new Date(editingItem.endDate).toISOString().split('T')[0] : "",
        assignedToId: editingItem.assignedToId || "",
        progressPercent: editingItem.progressPercent || 0,
      });
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
            <div className="space-y-4">
              {filteredItems.length === 0 ? (
                <Card className="p-12 text-center">
                  <CardTitle className="mb-2">No Schedule Items</CardTitle>
                  <p className="text-muted-foreground">
                    Add schedule items to see them in the Gantt view.
                  </p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredItems
                    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                    .map((item) => {
                      const startDate = new Date(item.startDate);
                      const endDate = new Date(item.endDate);
                      
                      // Use memoized timeline boundaries
                      const { timelineStart, totalDays } = ganttTimeline;
                      
                      const daysSinceStart = Math.ceil((startDate.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
                      const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                      
                      const leftPercent = (daysSinceStart / totalDays) * 100;
                      const widthPercent = (duration / totalDays) * 100;
                      
                      // Color by type
                      let barColor = "bg-blue-500";
                      if (item.type === "inspection") barColor = "bg-red-500";
                      else if (item.type === "milestone") barColor = "bg-purple-500";
                      else if (item.type === "delivery") barColor = "bg-yellow-500";
                      else if (item.type === "meeting") barColor = "bg-green-500";
                      
                      if (item.status === "completed") barColor = "bg-gray-400";
                      else if (item.status === "on_hold") barColor = "bg-gray-500";

                      return (
                        <Card 
                          key={item.id} 
                          className="p-4 hover-elevate cursor-pointer"
                          onClick={() => {
                            if (schedule?.status !== "locked") {
                              setEditingItem(item);
                              setShowItemDialog(true);
                            }
                          }}
                          data-testid={`gantt-item-${item.id}`}
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-48">
                              <div className="font-medium text-sm mb-1">{item.name}</div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="text-xs">
                                  {item.type}
                                </Badge>
                                <span>{item.status.replace("_", " ")}</span>
                              </div>
                              {item.assignedToName && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {item.assignedToName}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex-1 py-2">
                              <div className="relative h-6 bg-muted rounded">
                                <div
                                  className={`absolute h-full ${barColor} rounded flex items-center justify-center text-xs text-white font-medium`}
                                  style={{
                                    left: `${leftPercent}%`,
                                    width: `${widthPercent}%`,
                                  }}
                                >
                                  {item.progressPercent > 0 && (
                                    <div className="absolute inset-0 bg-green-600 rounded" style={{ width: `${item.progressPercent}%` }} />
                                  )}
                                  <span className="relative z-10 px-2 truncate">
                                    {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              )}
            </div>
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Schedule Item" : "Add Schedule Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the schedule item details." : "Create a new item in the schedule."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label htmlFor="item-description">Description</Label>
              <Textarea
                id="item-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add details about this schedule item..."
                rows={3}
                data-testid="input-item-description"
              />
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
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-start-date">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="item-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  data-testid="input-item-start-date"
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
          </div>
          <DialogFooter>
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
