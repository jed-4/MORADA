import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ScheduleViewProvider } from "@/contexts/ScheduleViewContext";
import { type Schedule as ScheduleType, type ScheduleItem, type Contact, type CompanySettings } from "@shared/schema";
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import "moment/locale/en-gb";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./schedule-calendar.css";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
  Copy,
  X,
  Bookmark,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CasvaScheduleList } from "@/components/schedule/CasvaScheduleList";
import { ContactSelect } from "@/components/ContactSelect";
import Gantt from "./Gantt";
import { ImportScheduleDialog } from "@/components/schedule/ImportScheduleDialog";
import { useScheduleItemStatusOptions } from "@/hooks/useScheduleItemStatusOptions";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { Switch } from "@/components/ui/switch";

interface ScheduleParams {
  projectId: string;
}

export default function Schedule() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Schedule" });
  const weekStartDay = useWeekStartDay();

  const localizer = useMemo(() => {
    moment.locale("en-custom", { week: { dow: weekStartDay, doy: 4 } });
    return momentLocalizer(moment);
  }, [weekStartDay]);
  const params = useParams<ScheduleParams>();
  const projectId = params.projectId || currentProject?.id;

  const [activeView, setActiveView] = useState<"list" | "gantt" | "calendar">("gantt");
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("day");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [pendingAutoLink, setPendingAutoLink] = useState<{ successorId: string } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [descriptionExpanded, setDescriptionExpanded] = useState(true);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showWorkingDaysDialog, setShowWorkingDaysDialog] = useState(false);
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
    useWorkingDaysOverride: null as boolean | null,
  });
  const [taskLinkOffsetsLocal, setTaskLinkOffsetsLocal] = useState<Array<{taskId: string; offsetDays: number; offsetFrom: "start" | "end"}>>([]);
  const [filters, setFilters] = useState({
    status: "all",
    assignee: "all",
    type: "all",
    dateRange: "all",
  });
  
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('schedule-visible-columns');
    return saved ? JSON.parse(saved) : {
      item: true,
      assignee: true,
      type: true,
      dueDate: true,
      status: true,
      completion: true,
    };
  });
  const [newStepName, setNewStepName] = useState("");
  const [showBaselineDialog, setShowBaselineDialog] = useState(false);
  const [activeBaselineId, setActiveBaselineId] = useState<string | null>(null);
  const [baselineName, setBaselineName] = useState("");

  useEffect(() => {
    localStorage.setItem('schedule-visible-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (columnKey: string) => {
    setVisibleColumns((prev: Record<string, boolean>) => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  // Fetch schedule for project
  const { data: schedule, isLoading: scheduleLoading } = useQuery<ScheduleType>({
    queryKey: ["/api/projects", projectId, "schedule"],
    enabled: !!projectId,
  });

  const isUnlocked = schedule?.status !== "locked" && !!schedule;
  const [showLeaveGuardDialog, setShowLeaveGuardDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);
  const [, navigate] = useLocation();

  const scheduleRef = useRef(schedule);
  const isUnlockedRef = useRef(isUnlocked);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { isUnlockedRef.current = isUnlocked; }, [isUnlocked]);

  const lockScheduleAndNavigate = useCallback(async (targetUrl: string) => {
    if (schedule && isUnlocked) {
      try {
        await fetch(`/api/schedules/${schedule.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "locked" }),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
        navigate(targetUrl);
      } catch (e) {
        toast({
          title: "Failed to lock schedule",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    } else {
      navigate(targetUrl);
    }
  }, [schedule, isUnlocked, projectId, navigate, toast]);

  useEffect(() => {
    if (!isUnlocked) return;

    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#") || href === "") return;
      const isScheduleLink = href.includes("/schedule");
      if (isScheduleLink) return;
      e.preventDefault();
      e.stopPropagation();
      pendingNavigationRef.current = href;
      setShowLeaveGuardDialog(true);
    };
    document.addEventListener("click", clickHandler, true);
    return () => {
      document.removeEventListener("click", clickHandler, true);
    };
  }, [isUnlocked]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUnlockedRef.current && scheduleRef.current) {
        e.preventDefault();
        e.returnValue = "Your schedule is unlocked. Leaving will auto-lock it.";
        const s = scheduleRef.current;
        fetch(`/api/schedules/${s.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "locked" }),
        }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (isUnlockedRef.current && scheduleRef.current) {
        const s = scheduleRef.current;
        fetch(`/api/schedules/${s.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "locked" }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
        }).catch(() => {});
      }
    };
  }, [projectId]);

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

  // Fetch steps for editing item
  const { data: itemSteps = [], refetch: refetchSteps } = useQuery({
    queryKey: [`/api/schedule-items/${editingItem?.id}/steps`],
    enabled: !!editingItem?.id,
  });

  const { data: availableChecklists = [] } = useQuery({
    queryKey: [`/api/projects/${projectId}/checklists`],
    enabled: !!projectId && !!editingItem,
  });

  const { data: availableTasks = [] } = useQuery({
    queryKey: [`/api/projects/${projectId}/tasks`],
    enabled: !!projectId && !!editingItem,
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
    onSuccess: async (newItem) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      
      if (pendingAutoLink && newItem?.id) {
        try {
          await fetch(`/api/schedule-items/${pendingAutoLink.successorId}/dependencies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ predecessorId: String(newItem.id), type: 'FS' }),
          });
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
        } catch (error) {
          console.error("Failed to auto-link dependency:", error);
        }
        setPendingAutoLink(null);
      }
      
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
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateItemLinksMutation = useMutation({
    mutationFn: async (data: { id: string; checklistIds?: string[]; taskIds?: string[]; taskLinkOffsets?: Array<{taskId: string; offsetDays: number; offsetFrom: "start" | "end"}> }) => {
      const { id, ...body } = data;
      const response = await fetch(`/api/schedule-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Failed to update links");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update links",
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

  // Quick inline completion toggle mutation (toggles between 0% and 100%)
  const updateCompletionMutation = useMutation({
    mutationFn: async ({ itemId, currentPercent }: { itemId: string; currentPercent: number }) => {
      const newPercent = currentPercent === 100 ? 0 : 100;
      const response = await fetch(`/api/schedule-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ progressPercent: newPercent }),
      });
      if (!response.ok) throw new Error("Failed to update completion");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update completion",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add step mutation
  const addStepMutation = useMutation({
    mutationFn: async (data: { scheduleItemId: string; name: string }) => {
      return await apiRequest(`/api/schedule-items/${data.scheduleItemId}/steps`, "POST", { name: data.name });
    },
    onSuccess: () => refetchSteps(),
  });

  // Toggle step completion mutation
  const toggleStepMutation = useMutation({
    mutationFn: async (data: { id: string; isCompleted: boolean }) => {
      return await apiRequest(`/api/schedule-item-steps/${data.id}`, "PATCH", { isCompleted: data.isCompleted });
    },
    onSuccess: () => refetchSteps(),
  });

  // Delete step mutation
  const deleteStepMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/schedule-item-steps/${id}`, "DELETE");
    },
    onSuccess: () => refetchSteps(),
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const response = await fetch("/api/schedule-items/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds, projectId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete items");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      setSelectedItems(new Set());
      toast({
        title: "Items deleted",
        description: `Successfully deleted ${data.deleted} items.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete items",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Duplicate item mutation
  const duplicateItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest(`/api/schedule-items/${itemId}/duplicate`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Item duplicated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to duplicate", description: error.message, variant: "destructive" });
    },
  });

  // Delete single item mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest(`/api/schedule-items/${itemId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({ title: "Item deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  // Nest item mutation (set parentId)
  const nestItemMutation = useMutation({
    mutationFn: async ({ itemId, parentId }: { itemId: string; parentId: string | null }) => {
      const response = await fetch(`/api/schedule-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ parentId }),
      });
      if (!response.ok) throw new Error("Failed to nest item");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
      toast({
        title: "Item nested",
        description: "The item has been nested under the parent.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to nest item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: nonWorkingDays = [], refetch: refetchNonWorkingDays } = useQuery({
    queryKey: [`/api/companies/${user?.companyId}/non-working-days?scheduleId=${schedule?.id}`],
    enabled: !!user?.companyId && !!schedule?.id,
  });

  const companyHolidays = (nonWorkingDays as any[]).filter((d: any) => !d.scheduleId);
  const scheduleSpecificDays = (nonWorkingDays as any[]).filter((d: any) => d.scheduleId);

  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const updateWorkingDaysMutation = useMutation({
    mutationFn: async (data: { includeSaturday: boolean; includeSunday: boolean; clientVisibilityWeeks?: number | null }) => {
      return await apiRequest(`/api/schedules/${schedule?.id}/working-days`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      toast({ title: "Working days updated" });
    },
  });

  const addNonWorkingDayMutation = useMutation({
    mutationFn: async (data: { date: string; name: string; isRecurring: boolean; scheduleId?: string }) => {
      return await apiRequest(`/api/companies/${user?.companyId}/non-working-days`, "POST", data);
    },
    onSuccess: () => {
      refetchNonWorkingDays();
      toast({ title: "Non-working day added" });
    },
  });

  const deleteNonWorkingDayMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/non-working-days/${id}`, "DELETE");
    },
    onSuccess: () => {
      refetchNonWorkingDays();
      toast({ title: "Non-working day removed" });
    },
  });

  // Fetch schedule templates
  const { data: scheduleTemplates = [] } = useQuery({
    queryKey: ["/api/schedule-templates"],
  });

  const { data: baselines = [] } = useQuery({
    queryKey: [`/api/schedules/${schedule?.id}/baselines`],
    enabled: !!schedule?.id,
  });

  const { data: baselineItems = [] } = useQuery({
    queryKey: [`/api/baselines/${activeBaselineId}/items`],
    enabled: !!activeBaselineId,
  });

  const createBaselineMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return await apiRequest(`/api/schedules/${schedule?.id}/baselines`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/schedules/${schedule?.id}/baselines`] });
      setShowBaselineDialog(false);
      setBaselineName("");
      toast({ title: "Baseline created", description: "Schedule snapshot saved." });
    },
  });

  const deleteBaselineMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/baselines/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/schedules/${schedule?.id}/baselines`] });
      if (activeBaselineId) setActiveBaselineId(null);
      toast({ title: "Baseline deleted" });
    },
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
      useWorkingDaysOverride: null,
    });
    setTaskLinkOffsetsLocal([]);
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
      useWorkingDaysOverride: formData.useWorkingDaysOverride,
      taskLinkOffsets: taskLinkOffsetsLocal.length > 0 ? taskLinkOffsetsLocal : undefined,
    };

    if (editingItem) {
      updateItemMutation.mutate(data);
    } else {
      createItemMutation.mutate(data);
    }
  };

  // Handle export schedule to CSV
  const handleExportSchedule = () => {
    if (!scheduleItems.length) {
      toast({ title: "Nothing to export", description: "Add items to the schedule first.", variant: "destructive" });
      return;
    }
    
    const headers = ["Name", "Type", "Status", "Priority", "Start Date", "End Date", "Duration (days)", "Assignee", "Progress %", "Parent", "Notes"];
    
    const rows = scheduleItems.map(item => {
      const parentItem = scheduleItems.find(si => si.id === item.parentItemId);
      return [
        item.name,
        item.type,
        item.status,
        item.priority || "",
        item.startDate ? new Date(item.startDate).toLocaleDateString('en-AU') : "",
        item.endDate ? new Date(item.endDate).toLocaleDateString('en-AU') : "",
        item.duration?.toString() || "",
        item.assignedToName || "",
        (item.progressPercent || 0).toString(),
        parentItem?.name || "",
        (item.notes || "").replace(/"/g, '""'),
      ];
    });
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule-${pageTitle.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({ title: "Schedule exported", description: "CSV file downloaded." });
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
        useWorkingDaysOverride: editingItem.useWorkingDaysOverride ?? null,
      });
      setTaskLinkOffsetsLocal((editingItem as any).taskLinkOffsets || []);
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
        updateItemStatusMutation: updateStatusMutationInline,
        setShowItemDialog,
        setEditingItem,
        setPendingAutoLink,
      }}
    >
      <div className="flex flex-col h-full bg-background rounded-lg border overflow-hidden">
        {/* UNIFIED 3-ROW HEADER FOR ALL VIEWS */}
        
        {/* Row 1 - Project Controls (36px) */}
        <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
          {/* Left: Project Name + Lock/Unlock Toggle + Online/Offline Indicator */}
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">{pageTitle}</h2>
            
            {/* Online/Offline indicator */}
            <button
              onClick={() => {
                if (schedule?.status === "locked") return;
                if (schedule?.status === "offline") {
                  updateStatusMutation.mutate("online");
                } else {
                  updateStatusMutation.mutate("offline");
                }
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs text-muted-foreground ${schedule?.status === "locked" ? "opacity-50 cursor-not-allowed" : "hover-elevate active-elevate-2"}`}
              disabled={schedule?.status === "locked"}
              data-testid="button-toggle-online"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${schedule?.status === "online" || schedule?.status === "locked" ? "bg-green-500" : "bg-muted-foreground"}`} />
              <span>{schedule?.status === "online" || schedule?.status === "locked" ? "Online" : "Offline"}</span>
            </button>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Lock/Unlock Toggle */}
            {schedule?.status === "locked" ? (
              <button
                onClick={() => {
                  updateStatusMutation.mutate("online");
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="button-unlock-schedule"
              >
                <Lock className="w-3.5 h-3.5" />
                Locked
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm("Lock the schedule? This will make it read-only and visible to clients. Any unsaved changes will be committed.")) {
                    updateStatusMutation.mutate("locked");
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="button-lock-schedule"
              >
                <Unlock className="w-3.5 h-3.5" />
                Unlocked (Edit)
              </button>
            )}
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-primary-foreground border-primary/20 hover:bg-primary/90 active-elevate-2"
              onClick={() => setShowItemDialog(true)}
              disabled={schedule?.status === "locked"}
              data-testid="button-add-item"
            >
              <Plus className="w-3 h-3 inline mr-0.5" />
              Add Item
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center" data-testid="button-more-actions">
                  <MoreVertical className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowLoadTemplateDialog(true)} disabled={schedule?.status === "locked"}>
                  <Upload className="w-4 h-4 mr-2" />
                  Load Template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSaveTemplateDialog(true)} disabled={schedule?.status === "locked" || scheduleItems.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Save as Template
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowImportDialog(true)} disabled={schedule?.status === "locked"}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Schedule
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSchedule} data-testid="button-export-pdf">
                  <Download className="w-4 h-4 mr-2" />
                  Export Schedule
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowBaselineDialog(true)}>
                  <Bookmark className="w-4 h-4 mr-2" />
                  Create Baseline
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="button-settings" onClick={() => setShowWorkingDaysDialog(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Schedule Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border ${filters.assignee !== 'all' ? 'bg-primary/10 border-primary/30' : 'border-border'} [&>svg]:hidden`} data-testid="select-filter-assignee">
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
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border ${filters.status !== 'all' ? 'bg-primary/10 border-primary/30' : 'border-border'} [&>svg]:hidden`} data-testid="select-filter-status">
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
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border ${filters.type !== 'all' ? 'bg-primary/10 border-primary/30' : 'border-border'} [&>svg]:hidden`} data-testid="select-filter-type">
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
              <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border ${filters.dateRange !== 'all' ? 'bg-primary/10 border-primary/30' : 'border-border'} [&>svg]:hidden`} data-testid="select-filter-date-range">
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

            {(baselines as any[]).length > 0 && (
              <Select 
                value={activeBaselineId || "none"} 
                onValueChange={(v) => setActiveBaselineId(v === "none" ? null : v)}
              >
                <SelectTrigger className={`h-6 w-auto px-3 py-0 text-xs rounded-full border ${activeBaselineId ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700' : 'border-border'} [&>svg]:hidden`}>
                  <span>{activeBaselineId ? (baselines as any[]).find((b: any) => b.id === activeBaselineId)?.name || 'Baseline' : 'Baseline'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Baseline</SelectItem>
                  {(baselines as any[]).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({new Date(b.createdAt).toLocaleDateString('en-AU')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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

            {/* Columns Icon Button - only show for List view (Gantt has its own column config) */}
            {activeView === 'list' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button 
                    className="h-6 w-6 flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2"
                    data-testid="button-column-config"
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 p-1 border-2">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-medium px-2 py-1">Visible Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem 
                    onClick={() => toggleColumn('item')}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs"
                    data-testid="checkbox-column-item"
                  >
                    <Checkbox checked={visibleColumns.item} className="pointer-events-none h-3.5 w-3.5" />
                    <span>Item</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => toggleColumn('assignee')}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs"
                    data-testid="checkbox-column-assignee"
                  >
                    <Checkbox checked={visibleColumns.assignee} className="pointer-events-none h-3.5 w-3.5" />
                    <span>Assignee</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => toggleColumn('type')}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs"
                  >
                    <Checkbox checked={visibleColumns.type} className="pointer-events-none h-3.5 w-3.5" />
                    <span>Type</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => toggleColumn('dueDate')}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs"
                    data-testid="checkbox-column-duedate"
                  >
                    <Checkbox checked={visibleColumns.dueDate} className="pointer-events-none h-3.5 w-3.5" />
                    <span>Due Date & Duration</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => toggleColumn('status')}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs"
                    data-testid="checkbox-column-status"
                  >
                    <Checkbox checked={visibleColumns.status} className="pointer-events-none h-3.5 w-3.5" />
                    <span>Status</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => toggleColumn('completion')}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs"
                    data-testid="checkbox-column-completion"
                  >
                    <Checkbox checked={visibleColumns.completion} className="pointer-events-none h-3.5 w-3.5" />
                    <span>Completion %</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
        {scheduleItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <GanttChart className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Build Your Schedule</h3>
              <p className="text-sm text-muted-foreground mb-6">Get started by creating items, loading a template, or importing from a file.</p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => setShowItemDialog(true)} disabled={schedule?.status === "locked"}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Item
                </Button>
                <Button variant="outline" onClick={() => setShowLoadTemplateDialog(true)} disabled={schedule?.status === "locked"}>
                  <Upload className="w-4 h-4 mr-2" />
                  Load Template
                </Button>
                <Button variant="outline" onClick={() => setShowImportDialog(true)} disabled={schedule?.status === "locked"}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import File
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeView === "list" && (
              <div className="flex-1 overflow-auto p-4">
                {filteredItems.length === 0 ? (
                  <Card className="p-12 text-center">
                    <CardTitle className="mb-2">No Matching Items</CardTitle>
                    <p className="text-muted-foreground mb-4">
                      No items match the current filters.
                    </p>
                  </Card>
                ) : (
                  <>
                    {selectedItems.size > 0 && (
                      <div className="flex items-center gap-2 p-2 mb-2 bg-muted/50 rounded-lg border">
                        <span className="text-xs text-muted-foreground">
                          {selectedItems.size} selected
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (!projectId) {
                              toast({
                                title: "Error",
                                description: "No project selected",
                                variant: "destructive",
                              });
                              return;
                            }
                            if (confirm(`Delete ${selectedItems.size} items? This cannot be undone.`)) {
                              bulkDeleteMutation.mutate(Array.from(selectedItems));
                            }
                          }}
                          disabled={bulkDeleteMutation.isPending || !projectId}
                          data-testid="button-bulk-delete"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedItems(new Set())}
                          data-testid="button-clear-selection"
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                    <CasvaScheduleList
                      items={filteredItems}
                      noteCounts={noteCounts}
                      statusOptions={statusOptions}
                      visibleColumns={visibleColumns}
                      selectedItems={selectedItems}
                      onSelectionChange={setSelectedItems}
                      onNestItem={(itemId, parentId) => {
                        nestItemMutation.mutate({ itemId, parentId });
                      }}
                      onStatusChange={(itemId, status) => {
                        updateStatusMutationInline.mutate({ itemId, status });
                      }}
                      onCompletionToggle={(itemId, currentPercent) => {
                        updateCompletionMutation.mutate({ itemId, currentPercent });
                      }}
                      onEditItem={(item) => {
                        setEditingItem(item);
                        setShowItemDialog(true);
                      }}
                      onDuplicateItem={(item) => duplicateItemMutation.mutate(item.id)}
                      onDeleteItem={(itemId) => {
                        if (confirm("Delete this schedule item? This cannot be undone.")) {
                          deleteItemMutation.mutate(itemId);
                        }
                      }}
                    />
                  </>
                )}
              </div>
            )}

            {activeView === "gantt" && (
              <Gantt
                onEditItem={(item) => {
                  setEditingItem(item);
                  setShowItemDialog(true);
                }}
                baselineItems={activeBaselineId ? baselineItems as any[] : []}
              />
            )}

            {activeView === "calendar" && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-center py-1.5">
                  <span className="text-sm font-medium">
                    {calendarDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
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
                    culture="en-custom"
                    data-testid="calendar-view"
                  />
                </div>
              </div>
            )}
          </>
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

            {/* Type */}
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
                  allowBusiness={true}
                  data-testid="select-item-assignee"
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

            {/* Allow on weekends toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="allow-weekends" className="text-sm">Allow on weekends</Label>
                <p className="text-xs text-muted-foreground">Override schedule settings to allow this item on weekends</p>
              </div>
              <Switch
                id="allow-weekends"
                checked={formData.useWorkingDaysOverride === true}
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, useWorkingDaysOverride: checked ? true : null });
                }}
              />
            </div>

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
                          className="p-2 rounded-md border bg-card space-y-1.5"
                          data-testid={`dependency-${dep.id}`}
                        >
                          <div className="flex items-center justify-between">
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
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Lag:</span>
                            <Input
                              type="number"
                              min="0"
                              value={dep.lag ?? 0}
                              onChange={async (e) => {
                                const newLag = parseInt(e.target.value) || 0;
                                try {
                                  const updatedItem = await apiRequest(
                                    `/api/schedule-items/${editingItem.id}/dependencies/${dep.id}`,
                                    "PATCH",
                                    { lag: newLag }
                                  );
                                  setEditingItem(updatedItem);
                                  if (predItem.endDate) {
                                    const predEnd = new Date(predItem.endDate);
                                    const newStart = new Date(predEnd);
                                    newStart.setDate(newStart.getDate() + newLag + 1);
                                    const startStr = newStart.toISOString().split("T")[0];
                                    let endStr = startStr;
                                    if (editingItem.startDate && editingItem.endDate) {
                                      const oldStart = new Date(editingItem.startDate);
                                      const oldEnd = new Date(editingItem.endDate);
                                      const durationMs = oldEnd.getTime() - oldStart.getTime();
                                      const newEnd = new Date(newStart.getTime() + durationMs);
                                      endStr = newEnd.toISOString().split("T")[0];
                                    }
                                    await apiRequest(`/api/schedule-items/${editingItem.id}`, "PATCH", {
                                      startDate: startStr,
                                      endDate: endStr,
                                    });
                                    setFormData(prev => ({ ...prev, startDate: startStr, endDate: endStr }));
                                    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
                                  }
                                } catch (error) {
                                  toast({
                                    title: "Failed to update lag",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              className="h-6 w-16 text-xs"
                              placeholder="0"
                              data-testid={`input-lag-${dep.id}`}
                            />
                            <span className="text-xs text-muted-foreground">days</span>
                          </div>
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

            {editingItem && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label>Checklist Steps</Label>
                  <span className="text-xs text-muted-foreground">
                    {(itemSteps as any[]).filter((s: any) => s.isCompleted).length}/{(itemSteps as any[]).length} done
                  </span>
                </div>
                
                {/* Steps List */}
                <div className="space-y-1">
                  {(itemSteps as any[]).map((step: any) => (
                    <div key={step.id} className="flex items-center gap-2 py-0.5 group">
                      <Checkbox
                        checked={step.isCompleted}
                        onCheckedChange={(checked) => {
                          toggleStepMutation.mutate({ id: step.id, isCompleted: !!checked });
                        }}
                      />
                      <span className={`text-sm flex-1 ${step.isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                        {step.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={() => deleteStepMutation.mutate(step.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                {/* Add Step Input */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add a step..."
                    value={newStepName}
                    onChange={(e) => setNewStepName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newStepName.trim() && editingItem) {
                        addStepMutation.mutate({ scheduleItemId: editingItem.id, name: newStepName.trim() });
                        setNewStepName("");
                      }
                    }}
                    className="h-7 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (newStepName.trim() && editingItem) {
                        addStepMutation.mutate({ scheduleItemId: editingItem.id, name: newStepName.trim() });
                        setNewStepName("");
                      }
                    }}
                    disabled={!newStepName.trim()}
                    className="h-7"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {editingItem && (
              <div className="space-y-3 pt-4 border-t">
                <Label className="text-sm font-medium">Linked Items</Label>
                
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Checklists</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-6 text-xs">
                          <Plus className="w-3 h-3 mr-1" />
                          Link Checklist
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                        {(availableChecklists as any[])
                          .filter((cl: any) => !(editingItem.checklistIds as string[] || []).includes(cl.id))
                          .map((cl: any) => (
                            <DropdownMenuItem
                              key={cl.id}
                              onClick={() => {
                                const newIds = [...(editingItem.checklistIds as string[] || []), cl.id];
                                updateItemLinksMutation.mutate({ id: editingItem.id, checklistIds: newIds });
                                setEditingItem({ ...editingItem, checklistIds: newIds });
                              }}
                            >
                              {cl.name || cl.title}
                            </DropdownMenuItem>
                          ))}
                        {(availableChecklists as any[]).filter((cl: any) => !(editingItem.checklistIds as string[] || []).includes(cl.id)).length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No checklists available</div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {((editingItem.checklistIds as string[]) || []).length > 0 && (
                    <div className="space-y-1">
                      {((editingItem.checklistIds as string[]) || []).map((clId: string) => {
                        const cl = (availableChecklists as any[]).find((c: any) => c.id === clId);
                        return (
                          <div key={clId} className="flex items-center justify-between py-0.5 px-2 rounded hover-elevate group">
                            <span className="text-xs">{cl?.name || cl?.title || clId}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 invisible group-hover:visible"
                              onClick={() => {
                                const newIds = ((editingItem.checklistIds as string[]) || []).filter(id => id !== clId);
                                updateItemLinksMutation.mutate({ id: editingItem.id, checklistIds: newIds });
                                setEditingItem({ ...editingItem, checklistIds: newIds });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Tasks</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-6 text-xs">
                          <Plus className="w-3 h-3 mr-1" />
                          Link Task
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-48 overflow-y-auto">
                        {(availableTasks as any[])
                          .filter((t: any) => !(editingItem.taskIds as string[] || []).includes(t.id))
                          .map((t: any) => (
                            <DropdownMenuItem
                              key={t.id}
                              onClick={() => {
                                const newIds = [...(editingItem.taskIds as string[] || []), t.id];
                                updateItemLinksMutation.mutate({ id: editingItem.id, taskIds: newIds });
                                setEditingItem({ ...editingItem, taskIds: newIds });
                                setTaskLinkOffsetsLocal(prev => [...prev, { taskId: t.id, offsetDays: 0, offsetFrom: "start" as const }]);
                              }}
                            >
                              {t.title || t.name}
                            </DropdownMenuItem>
                          ))}
                        {(availableTasks as any[]).filter((t: any) => !(editingItem.taskIds as string[] || []).includes(t.id)).length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No tasks available</div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {((editingItem.taskIds as string[]) || []).length > 0 && (
                    <div className="space-y-1.5">
                      {((editingItem.taskIds as string[]) || []).map((taskId: string) => {
                        const task = (availableTasks as any[]).find((t: any) => t.id === taskId);
                        const offset = taskLinkOffsetsLocal.find(o => o.taskId === taskId);
                        return (
                          <div key={taskId} className="space-y-1 py-1 px-2 rounded border bg-card">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">{task?.title || task?.name || taskId}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  const newIds = ((editingItem.taskIds as string[]) || []).filter(id => id !== taskId);
                                  updateItemLinksMutation.mutate({ id: editingItem.id, taskIds: newIds });
                                  setEditingItem({ ...editingItem, taskIds: newIds });
                                  setTaskLinkOffsetsLocal(prev => prev.filter(o => o.taskId !== taskId));
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={offset?.offsetDays ?? 0}
                                onChange={(e) => {
                                  const days = parseInt(e.target.value) || 0;
                                  setTaskLinkOffsetsLocal(prev => {
                                    const existing = prev.find(o => o.taskId === taskId);
                                    if (existing) {
                                      return prev.map(o => o.taskId === taskId ? { ...o, offsetDays: days } : o);
                                    }
                                    return [...prev, { taskId, offsetDays: days, offsetFrom: "start" as const }];
                                  });
                                }}
                                className="h-6 w-16 text-xs"
                                placeholder="0"
                              />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">days from</span>
                              <Select
                                value={offset?.offsetFrom || "start"}
                                onValueChange={(value: "start" | "end") => {
                                  setTaskLinkOffsetsLocal(prev => {
                                    const existing = prev.find(o => o.taskId === taskId);
                                    if (existing) {
                                      return prev.map(o => o.taskId === taskId ? { ...o, offsetFrom: value } : o);
                                    }
                                    return [...prev, { taskId, offsetDays: 0, offsetFrom: value }];
                                  });
                                }}
                              >
                                <SelectTrigger className="h-6 w-20 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="start">Start</SelectItem>
                                  <SelectItem value="end">End</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="border-t pt-4 mt-4">
            {editingItem && (
              <Button
                variant="outline"
                onClick={() => {
                  duplicateItemMutation.mutate(editingItem.id);
                  setShowItemDialog(false);
                  setEditingItem(null);
                }}
                disabled={schedule?.status === "locked"}
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </Button>
            )}
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

      <Dialog open={showBaselineDialog} onOpenChange={setShowBaselineDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Baseline</DialogTitle>
            <DialogDescription>
              Save a snapshot of the current schedule for comparison.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Baseline Name</Label>
              <Input
                value={baselineName}
                onChange={(e) => setBaselineName(e.target.value)}
                placeholder={`Baseline ${new Date().toLocaleDateString('en-AU')}`}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBaselineDialog(false)}>Cancel</Button>
              <Button onClick={() => createBaselineMutation.mutate({ name: baselineName || `Baseline ${new Date().toLocaleDateString('en-AU')}` })}>
                Create Baseline
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWorkingDaysDialog} onOpenChange={setShowWorkingDaysDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Working Days</DialogTitle>
            <DialogDescription>
              Configure which days are working days and define company holidays.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Working Days</Label>
              <p className="text-xs text-muted-foreground">Monday to Friday are always working days. Toggle Saturday and Sunday below.</p>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={schedule?.includeSaturday ?? false}
                    onCheckedChange={(checked) => {
                      updateWorkingDaysMutation.mutate({
                        includeSaturday: !!checked,
                        includeSunday: schedule?.includeSunday ?? false,
                      });
                    }}
                  />
                  <span className="text-sm">Saturday</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={schedule?.includeSunday ?? false}
                    onCheckedChange={(checked) => {
                      updateWorkingDaysMutation.mutate({
                        includeSaturday: schedule?.includeSaturday ?? false,
                        includeSunday: !!checked,
                      });
                    }}
                  />
                  <span className="text-sm">Sunday</span>
                </label>
              </div>
            </div>

            {companyHolidays.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Company Non-Working Days</Label>
                <p className="text-xs text-muted-foreground">These apply to all schedules. Manage them in Business Settings.</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {companyHolidays.map((day: any) => (
                    <div key={day.id} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/50">
                      <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium">{day.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(day.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Schedule-Specific Non-Working Days</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const name = prompt("Non-working day name (e.g., Site Closure):");
                    if (!name) return;
                    const date = prompt("Date (YYYY-MM-DD):");
                    if (!date) return;
                    addNonWorkingDayMutation.mutate({ date, name, isRecurring: false, scheduleId: schedule?.id });
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Day
                </Button>
              </div>
              {scheduleSpecificDays.length === 0 ? (
                <p className="text-xs text-muted-foreground">No schedule-specific non-working days. Add closures that only apply to this project's schedule.</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {scheduleSpecificDays.map((day: any) => (
                    <div key={day.id} className="flex items-center justify-between py-1.5 px-2 rounded hover-elevate">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{day.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(day.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteNonWorkingDayMutation.mutate(day.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-3 border-t">
              <Label className="text-sm font-medium">Client Visibility</Label>
              <p className="text-xs text-muted-foreground">
                Override how far ahead clients can see schedule items for this schedule.
                {companySettings?.defaultClientVisibilityWeeks
                  ? ` Company default: ${companySettings.defaultClientVisibilityWeeks} weeks.`
                  : " Company default: show all items."}
                {" "}Leave empty to use the company default.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={52}
                  placeholder={companySettings?.defaultClientVisibilityWeeks ? `${companySettings.defaultClientVisibilityWeeks} (default)` : "All"}
                  value={schedule?.clientVisibilityWeeks ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : parseInt(e.target.value);
                    updateWorkingDaysMutation.mutate({
                      includeSaturday: schedule?.includeSaturday ?? false,
                      includeSunday: schedule?.includeSunday ?? false,
                      clientVisibilityWeeks: val,
                    });
                  }}
                  className="h-8 w-24 text-sm"
                />
                <span className="text-xs text-muted-foreground">weeks ahead</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Guard Dialog */}
      <Dialog open={showLeaveGuardDialog} onOpenChange={setShowLeaveGuardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Schedule Changes</DialogTitle>
            <DialogDescription>
              Your schedule is currently unlocked. If you leave this page, your schedule will be locked to prevent unintended changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                pendingNavigationRef.current = null;
                setShowLeaveGuardDialog(false);
              }}
            >
              Stay on Page
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowLeaveGuardDialog(false);
                const target = pendingNavigationRef.current;
                pendingNavigationRef.current = null;
                if (target) {
                  lockScheduleAndNavigate(target);
                }
              }}
            >
              Lock & Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScheduleViewProvider>
  );
}
