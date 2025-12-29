import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ScheduleViewProvider } from "@/contexts/ScheduleViewContext";
import { type Schedule as ScheduleType, type ScheduleItem, type Contact } from "@shared/schema";
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import "moment/locale/en-gb";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./schedule-calendar.css";

moment.locale("en-gb");
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
  List as ListIcon,
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
  Search,
  ChevronLeft,
  ChevronRight,
  Columns3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CasvaScheduleList } from "@/components/schedule/CasvaScheduleList";
import { ContactSelect } from "@/components/ContactSelect";
import Gantt from "./Gantt";
import { ImportScheduleDialog } from "@/components/schedule/ImportScheduleDialog";
import { useScheduleItemStatusOptions } from "@/hooks/useScheduleItemStatusOptions";

interface ScheduleParams {
  projectId: string;
}

// Setup moment localizer for BigCalendar
const localizer = momentLocalizer(moment);

export default function Schedule() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Schedule" });
  const params = useParams<ScheduleParams>();
  const projectId = params.projectId || currentProject?.id;

  const [activeView, setActiveView] = useState<"list" | "gantt" | "calendar">("gantt");
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("day");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [descriptionExpanded, setDescriptionExpanded] = useState(true);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [templateFormData, setTemplateFormData] = useState({
    name: "",
    description: "",
    category: "",
  });
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

  // Fetch note counts for all schedule items
  const { data: noteCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['/api/activity-notes/batch-counts', projectId],
    queryFn: async () => {
      const scheduleItemIds = scheduleItems.map(item => item.id);
      if (scheduleItemIds.length === 0) return {};
      
      const response = await apiRequest('/api/activity-notes/batch-counts', 'POST', {
        scheduleItemIds
      });
      return response;
    },
    enabled: scheduleItems.length > 0,
  });

  // Fetch contacts for assignee selection
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  // Fetch schedule item status options from Field Settings using hook
  const { statusOptions: rawStatusOptions } = useScheduleItemStatusOptions();
  
  // Transform status options to match CasvaScheduleList interface
  const statusOptions = useMemo(() => {
    return rawStatusOptions.map((opt: any) => ({
      id: opt.id || opt.key,
      value: opt.key || opt.value,
      label: opt.name || opt.label,
      color: opt.color
    }));
  }, [rawStatusOptions]);

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

  // Quick inline status update mutation
  const updateStatusMutationInline = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const response = await fetch(`/api/schedule-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch schedule templates
  const { data: scheduleTemplates = [] } = useQuery({
    queryKey: ["/api/schedule-templates"],
  });

  // Save current schedule as template
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; category: string }) => {
      if (!schedule) throw new Error("No schedule found");
      if (scheduleItems.length === 0) throw new Error("No schedule items to save");

      // Convert schedule items to template format (without IDs, scheduleId, etc.)
      const templateData = scheduleItems.map(item => ({
        name: item.name,
        description: item.description,
        notes: item.notes,
        type: item.type,
        priority: item.priority,
        duration: item.duration || 1,
        sortOrder: item.sortOrder || 0,
      }));

      return await apiRequest("/api/schedule-templates", "POST", {
        ...data,
        templateData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-templates"] });
      setShowSaveTemplateDialog(false);
      setTemplateFormData({ name: "", description: "", category: "" });
      toast({
        title: "Template saved",
        description: "Your schedule has been saved as a template.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Load template into current schedule
  const loadTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!schedule) throw new Error("No schedule found");
      return await apiRequest(`/api/schedule-templates/${templateId}/apply`, "POST", {
        scheduleId: schedule.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      setShowLoadTemplateDialog(false);
      toast({
        title: "Template loaded",
        description: "Schedule items have been added from the template.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to load template",
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
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = (item.name || '').toLowerCase().includes(query);
        const descMatch = (item.description || '').toLowerCase().includes(query);
        const assigneeMatch = (item.assignedToName || '').toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !assigneeMatch) return false;
      }
      
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
  }, [scheduleItems, filters, searchQuery]);

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

  // Calendar event style getter - lilac events
  const eventStyleGetter = (event: any) => {
    return {
      style: {
        backgroundColor: "#bba7db",
        borderRadius: "4px",
        opacity: 0.9,
        color: "white",
        border: "0px",
        display: "block",
      },
    };
  };

  // Day prop getter - add class to weekends for styling
  const dayPropGetter = (date: Date) => {
    const day = date.getDay();
    if (day === 0 || day === 6) {
      return {
        className: "rbc-weekend-day",
        style: {
          backgroundColor: "#f3f4f6",
        },
      };
    }
    return {};
  };

  return (
    <ScheduleViewProvider
      value={{
        schedule,
        activeView,
        setActiveView,
        filters,
        setFilters,
        searchQuery,
        setSearchQuery,
        contacts,
        updateStatusMutation,
        setShowItemDialog,
        setEditingItem,
      }}
    >
      <div className="flex flex-col h-full bg-background rounded-lg border overflow-hidden">
        {/* UNIFIED 3-ROW HEADER FOR ALL VIEWS */}
        
        {/* Row 1 - Project Controls (36px) */}
        <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
          {/* Left: Project Name + Online/Offline Toggle */}
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">{pageTitle}</h2>
            <button
              onClick={() => {
                if (schedule?.status === "offline") {
                  updateStatusMutation.mutate("online");
                } else {
                  updateStatusMutation.mutate("offline");
                }
              }}
              className="flex items-center gap-1 hover-elevate active-elevate-2 px-1.5 py-0.5 rounded-md transition-all"
              data-testid="button-toggle-online"
            >
              {schedule?.status === "online" ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-muted-foreground">Online</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs text-muted-foreground">Offline</span>
                </>
              )}
            </button>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-primary-foreground border-primary/20 hover:bg-primary/90 active-elevate-2"
              onClick={() => setShowItemDialog(true)}
              disabled={schedule?.status === "locked"}
              data-testid="button-add-item"
            >
              <Plus className="w-3 h-3 inline mr-0.5" />
              Add Item
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
              onClick={() => setShowLoadTemplateDialog(true)}
              disabled={schedule?.status === "locked"}
              data-testid="button-load-template"
            >
              <Upload className="w-3 h-3 inline mr-0.5" />
              Load Template
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
              onClick={() => setShowImportDialog(true)}
              disabled={schedule?.status === "locked"}
              data-testid="button-import-schedule"
            >
              <Upload className="w-3 h-3 inline mr-0.5" />
              Import
            </button>
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-export-pdf"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-settings"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Row 2 - Views, Filters & Timeline Scale (consolidated) */}
        <div className="h-9 bg-background flex items-center justify-between px-2 gap-2 border-b border-border flex-shrink-0">
          {/* Left: View Buttons + Separator + Filter Pills */}
          <div className="flex items-center gap-1.5 flex-1">
            {/* View Toggle Buttons */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setActiveView('gantt')}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'gantt' ? 'bg-primary text-primary-foreground border-primary/20' : 'hover-elevate'} active-elevate-2`}
                data-testid="button-view-gantt"
              >
                <GanttChart className="w-3 h-3 inline mr-0.5" />
                Gantt
              </button>
              <button
                onClick={() => setActiveView('calendar')}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'calendar' ? 'bg-primary text-primary-foreground border-primary/20' : 'hover-elevate'} active-elevate-2`}
                data-testid="button-view-calendar"
              >
                <CalendarIcon className="w-3 h-3 inline mr-0.5" />
                Calendar
              </button>
              <button
                onClick={() => setActiveView('list')}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${activeView === 'list' ? 'bg-primary text-primary-foreground border-primary/20' : 'hover-elevate'} active-elevate-2`}
                data-testid="button-view-list"
              >
                <ListIcon className="w-3 h-3 inline mr-0.5" />
                List
              </button>
            </div>

            {/* Separator */}
            <div className="w-px h-4 bg-border" />

            {/* Search bar - only show for List/Calendar views */}
            {activeView !== 'gantt' && (
              <div className="relative w-40">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 pr-2 py-0 h-6 text-xs border rounded-md"
                  data-testid="input-search-items"
                />
              </div>
            )}

            {/* Filter Pills - distinct pill style */}
            <Select value={filters.assignee} onValueChange={(value) => setFilters({ ...filters, assignee: value })}>
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border-dashed ${filters.assignee !== 'all' ? 'bg-muted border-solid' : ''} [&>svg]:hidden`} data-testid="select-filter-assignee">
                <span>{filters.assignee !== 'all' ? contacts.find(c => c.id === filters.assignee)?.name || 'Assignee' : 'Assignee'}</span>
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

            <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border-dashed ${filters.status !== 'all' ? 'bg-muted border-solid' : ''} [&>svg]:hidden`} data-testid="select-filter-status">
                <span>{filters.status !== 'all' ? statusOptions.find(o => o.value === filters.status)?.label || filters.status : 'Status'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.length > 0 ? (
                  statusOptions.map((opt: any) => (
                    <SelectItem key={opt.id} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>

            <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border-dashed ${filters.type !== 'all' ? 'bg-muted border-solid' : ''} [&>svg]:hidden`} data-testid="select-filter-type">
                <span>{filters.type !== 'all' ? filters.type.charAt(0).toUpperCase() + filters.type.slice(1) : 'Type'}</span>
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

            <Select value={filters.dateRange} onValueChange={(value) => setFilters({ ...filters, dateRange: value })}>
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border-dashed ${filters.dateRange !== 'all' ? 'bg-muted border-solid' : ''} [&>svg]:hidden`} data-testid="select-filter-date-range">
                <span>{filters.dateRange !== 'all' ? filters.dateRange.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Date'}</span>
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

          {/* Right: Today + Columns + Day/Week/Month */}
          <div className="flex items-center gap-1.5">
            {/* Calendar Navigation - only show for Calendar */}
            {activeView === 'calendar' && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => {
                    const newDate = new Date(calendarDate);
                    if (calendarView === 'day') {
                      newDate.setDate(newDate.getDate() - 1);
                    } else if (calendarView === 'week') {
                      newDate.setDate(newDate.getDate() - 7);
                    } else if (calendarView === 'month') {
                      newDate.setMonth(newDate.getMonth() - 1);
                    }
                    setCalendarDate(newDate);
                  }}
                  className="h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2"
                  data-testid="button-calendar-prev"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setCalendarDate(new Date())}
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
                  data-testid="button-scroll-to-today"
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    const newDate = new Date(calendarDate);
                    if (calendarView === 'day') {
                      newDate.setDate(newDate.getDate() + 1);
                    } else if (calendarView === 'week') {
                      newDate.setDate(newDate.getDate() + 7);
                    } else if (calendarView === 'month') {
                      newDate.setMonth(newDate.getMonth() + 1);
                    }
                    setCalendarDate(newDate);
                  }}
                  className="h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2"
                  data-testid="button-calendar-next"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Today Button - only show for Gantt/List */}
            {activeView !== 'calendar' && (
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
                data-testid="button-scroll-to-today"
              >
                Today
              </button>
            )}

            {/* Columns Icon Button - only show for Gantt/List */}
            {(activeView === 'gantt' || activeView === 'list') && (
              <button 
                className="h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2"
                data-testid="button-column-config"
              >
                <Columns3 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Separator */}
            <div className="w-px h-4 bg-border" />

            {/* Timeline Scale Buttons */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  if (activeView === 'calendar') {
                    setCalendarView('day');
                  } else {
                    setZoomLevel('day');
                  }
                }}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  (activeView === 'calendar' && calendarView === 'day') || (activeView !== 'calendar' && zoomLevel === 'day')
                    ? 'bg-primary text-primary-foreground border-primary/20'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-zoom-day"
              >
                Day
              </button>
              <button
                onClick={() => {
                  if (activeView === 'calendar') {
                    setCalendarView('week');
                  } else {
                    setZoomLevel('week');
                  }
                }}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  (activeView === 'calendar' && calendarView === 'week') || (activeView !== 'calendar' && zoomLevel === 'week')
                    ? 'bg-primary text-primary-foreground border-primary/20'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-zoom-week"
              >
                Week
              </button>
              <button
                onClick={() => {
                  if (activeView === 'calendar') {
                    setCalendarView('month');
                  } else {
                    setZoomLevel('month');
                  }
                }}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  (activeView === 'calendar' && calendarView === 'month') || (activeView !== 'calendar' && zoomLevel === 'month')
                    ? 'bg-primary text-primary-foreground border-primary/20'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-zoom-month"
              >
                Month
              </button>
              {activeView === 'calendar' && (
                <button
                  onClick={() => setCalendarView('agenda')}
                  className={`h-6 w-auto px-2 text-xs border rounded-md ${
                    calendarView === 'agenda'
                      ? 'bg-primary text-primary-foreground border-primary/20'
                      : 'hover-elevate'
                  } active-elevate-2`}
                  data-testid="button-zoom-agenda"
                >
                  Agenda
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content - conditional rendering based on activeView */}
        {activeView === "list" && (
          <div className="flex-1 overflow-auto p-4">
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
                noteCounts={noteCounts}
                statusOptions={statusOptions}
                onStatusChange={(itemId, status) => {
                  updateStatusMutationInline.mutate({ itemId, status });
                }}
                onEditItem={(item) => {
                  setEditingItem(item);
                  setShowItemDialog(true);
                }}
              />
            )}
          </div>
        )}

        {activeView === "gantt" && (
          <Gantt
            onEditItem={(item) => {
              setEditingItem(item);
              setShowItemDialog(true);
            }}
          />
        )}

        {activeView === "calendar" && (
          <div className="h-full flex flex-col">
            <div className="flex-1 p-1" style={{ minHeight: '600px' }}>
              <BigCalendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                eventPropGetter={eventStyleGetter}
                dayPropGetter={dayPropGetter}
                onSelectEvent={(event) => {
                  if (schedule?.status !== "locked") {
                    setEditingItem(event.resource as ScheduleItem);
                    setShowItemDialog(true);
                  }
                }}
                views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                view={calendarView}
                onView={(view) => setCalendarView(view as "month" | "week" | "day" | "agenda")}
                date={calendarDate}
                onNavigate={(date) => setCalendarDate(date)}
                popup
                toolbar={false}
                culture="en-GB"
                data-testid="calendar-view"
              />
            </div>
          </div>
        )}
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
                <ContactSelect
                  value={formData.assignedToId || ""}
                  onValueChange={(value) => setFormData({ ...formData, assignedToId: value || "" })}
                  placeholder="None"
                  data-testid="select-item-assignee"
                />
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
                  required
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
                  required
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
                      {scheduleItems
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
                      {scheduleItems.filter(item => 
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
                      const predItem = scheduleItems.find(i => i.id === dep.id);
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

      {/* Save Template Dialog */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent data-testid="dialog-save-template">
          <DialogHeader>
            <DialogTitle>Save Schedule as Template</DialogTitle>
            <DialogDescription>
              Save your current schedule ({scheduleItems.length} items) as a reusable template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={templateFormData.name}
                onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                placeholder="e.g., Standard Residential Build"
                data-testid="input-template-name"
              />
            </div>
            <div>
              <Label htmlFor="template-category">Category</Label>
              <Select
                value={templateFormData.category}
                onValueChange={(value) => setTemplateFormData({ ...templateFormData, category: value })}
              >
                <SelectTrigger id="template-category" data-testid="select-template-category">
                  <SelectValue placeholder="Select a category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="renovation">Renovation</SelectItem>
                  <SelectItem value="extension">Extension</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateFormData.description}
                onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
                placeholder="Describe when to use this template..."
                rows={3}
                data-testid="textarea-template-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSaveTemplateDialog(false);
                setTemplateFormData({ name: "", description: "", category: "" });
              }}
              data-testid="button-cancel-save-template"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!templateFormData.name) {
                  toast({
                    title: "Validation Error",
                    description: "Please enter a template name",
                    variant: "destructive",
                  });
                  return;
                }
                saveTemplateMutation.mutate(templateFormData);
              }}
              disabled={saveTemplateMutation.isPending}
              data-testid="button-save-template"
            >
              {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Template Dialog */}
      <Dialog open={showLoadTemplateDialog} onOpenChange={setShowLoadTemplateDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-load-template">
          <DialogHeader>
            <DialogTitle>Load Schedule Template</DialogTitle>
            <DialogDescription>
              Choose a template to add schedule items to your current schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {scheduleTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No templates available.</p>
                <p className="text-sm mt-2">Save your first template using "Save as Template".</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {scheduleTemplates.map((template: any) => (
                  <Card
                    key={template.id}
                    className="p-4 hover-elevate cursor-pointer"
                    onClick={() => loadTemplateMutation.mutate(template.id)}
                    data-testid={`template-card-${template.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{template.name}</h4>
                          {template.category && (
                            <Badge variant="outline" className="capitalize">
                              {template.category}
                            </Badge>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>{template.templateData?.length || 0} items</span>
                          {template.createdByName && (
                            <span>Created by {template.createdByName}</span>
                          )}
                        </div>
                      </div>
                      <Upload className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLoadTemplateDialog(false)}
              data-testid="button-cancel-load-template"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportScheduleDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        mode="project"
        projectId={projectId}
        scheduleId={schedule?.id}
      />
    </ScheduleViewProvider>
  );
}
