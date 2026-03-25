import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { computeMoveCascade } from "@/lib/scheduleCascade";
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
  ChevronsDownUp,
  ChevronsUpDown,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  X,
  Bookmark,
  Globe,
  HardHat,
  Check,
  Flag,
  Loader2,
  ArrowUpDown,
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

  const [scheduleCategory, setScheduleCategory] = useState<"construction" | "preconstruction">("construction");
  const [activeView, setActiveView] = useState<"list" | "gantt" | "calendar">("gantt");
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("day");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showOfflineConfirm, setShowOfflineConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [pendingAutoLink, setPendingAutoLink] = useState<{ successorId?: string; predecessorId?: string; insertAfterItemId?: string; lag?: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [newItemDependencies, setNewItemDependencies] = useState<any[]>([]);
  const [showCreateLinked, setShowCreateLinked] = useState(false);
  const [createLinkedForm, setCreateLinkedForm] = useState({ name: '', startDate: '', duration: '1' });
  const [allCollapsed, setAllCollapsed] = useState(false);
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
  const [durationInput, setDurationInput] = useState<string>("1");
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    localStorage.setItem('schedule-visible-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (columnKey: string) => {
    setVisibleColumns((prev: Record<string, boolean>) => ({
      ...prev,
      [columnKey]: !prev[columnKey],
    }));
  };

  // Fetch all schedules for project to detect preconstruction
  const { data: allProjectSchedules = [] } = useQuery<ScheduleType[]>({
    queryKey: ["/api/projects", projectId, "schedules"],
    enabled: !!projectId,
  });
  const hasPreconstruction = allProjectSchedules.some(s => (s as any).scheduleCategory === "preconstruction");

  // Fetch schedule for project (filtered by category)
  const { data: schedule, isLoading: scheduleLoading } = useQuery<ScheduleType>({
    queryKey: ["/api/projects", projectId, "schedule", { category: scheduleCategory }],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/schedule?category=${scheduleCategory}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch schedule");
      }
      return res.json();
    },
    enabled: !!projectId,
  });

  const invalidateScheduleItems = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/schedule-items`] });
    if (schedule?.id) {
      queryClient.invalidateQueries({ queryKey: [`/api/schedules/${schedule.id}/items`] });
    }
  }, [projectId, schedule?.id]);

  const isUnlocked = schedule?.status !== "locked" && !!schedule;
  const [showLeaveGuardDialog, setShowLeaveGuardDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);
  const [, navigate] = useLocation();

  const scheduleRef = useRef(schedule);
  const isUnlockedRef = useRef(isUnlocked);
  const scrollToTodayRef = useRef<(() => void) | null>(null);
  const insertAfterItemRef = useRef<((newItemId: string, afterItemId: string) => void) | null>(null);
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
        isUnlockedRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
        navigate(targetUrl);
      } catch (e) {
        toast({
          title: "Failed to lock schedule",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    } else {
      isUnlockedRef.current = false;
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
      const isScheduleLink = href.includes("/schedule") && href.includes(projectId || "");
      if (isScheduleLink) return;
      e.preventDefault();
      e.stopPropagation();
      pendingNavigationRef.current = href;
      setShowLeaveGuardDialog(true);
    };

    const handlePopState = () => {
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

    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    const interceptNav = (orig: typeof history.pushState) =>
      function (this: History, data: any, unused: string, url?: string | URL | null) {
        if (url && isUnlockedRef.current) {
          const urlStr = typeof url === 'string' ? url : url.toString();
          const isScheduleLink = urlStr.includes("/schedule") && urlStr.includes(projectId || "");
          if (!isScheduleLink) {
            pendingNavigationRef.current = urlStr;
            setShowLeaveGuardDialog(true);
            return;
          }
        }
        return orig.call(this, data, unused, url);
      };
    history.pushState = interceptNav(origPushState) as typeof history.pushState;
    history.replaceState = interceptNav(origReplaceState) as typeof history.replaceState;

    document.addEventListener("click", clickHandler, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", clickHandler, true);
      window.removeEventListener("popstate", handlePopState);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
    };
  }, [isUnlocked, projectId]);

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

  // Fetch schedule items - when we have a schedule, fetch by scheduleId for category-specific items
  const { data: scheduleItems = [], isLoading: itemsLoading } = useQuery<ScheduleItem[]>({
    queryKey: schedule?.id ? [`/api/schedules/${schedule.id}/items`] : [`/api/projects/${projectId}/schedule-items`],
    enabled: !!projectId && (!!schedule?.id || scheduleCategory === "construction"),
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
    queryKey: [`/api/tasks`, { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?projectId=${projectId}`, { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json() as any[];
      return all.filter((t: any) => t.status !== "done" && t.status !== "completed");
    },
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
          status: "online",
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

  // Update schedule lock status (does not affect online/offline visibility)
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle schedule online/offline (visibility — separate from lock state)
  const toggleOnlineMutation = useMutation({
    mutationFn: async (isOnline: boolean) => {
      if (!schedule) throw new Error("No schedule found");
      const response = await fetch(`/api/schedules/${schedule.id}/online`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isOnline }),
      });
      if (!response.ok) throw new Error("Failed to update online status");
      return response.json() as Promise<ScheduleType>;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
      toast({
        title: updated.isOnline ? "Schedule is Online" : "Schedule is Offline",
        description: updated.isOnline
          ? "External users with access can now see this schedule."
          : "Schedule is hidden from external users.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update online status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sort schedule items by start date (re-assigns sortOrder values, preserving hierarchy)
  const sortByDateMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) throw new Error("No schedule");

      // Helper: earliest start date among an item's own date or its children's dates
      const effectiveDate = (item: ScheduleItem): number => {
        if (item.startDate) return new Date(item.startDate).getTime();
        const childDates = scheduleItems
          .filter((c) => c.parentItemId === item.id && c.startDate)
          .map((c) => new Date(c.startDate!).getTime());
        return childDates.length ? Math.min(...childDates) : Infinity;
      };

      const updates: { id: string; sortOrder: number; parentItemId: string | null }[] = [];
      let counter = 0;

      // 1. Sort top-level parents by effective start date
      const topLevel = scheduleItems
        .filter((i) => !i.parentItemId)
        .sort((a, b) => effectiveDate(a) - effectiveDate(b));

      for (const parent of topLevel) {
        updates.push({ id: parent.id, sortOrder: counter++, parentItemId: null });

        // 2. Sort children under this parent by their own start date
        const children = scheduleItems
          .filter((c) => c.parentItemId === parent.id)
          .sort((a, b) => {
            const aDate = a.startDate ? new Date(a.startDate).getTime() : Infinity;
            const bDate = b.startDate ? new Date(b.startDate).getTime() : Infinity;
            return aDate - bDate;
          });

        for (const child of children) {
          updates.push({ id: child.id, sortOrder: counter++, parentItemId: parent.id });
        }
      }

      const response = await fetch("/api/schedule-items/batch-sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ updates }),
      });
      if (!response.ok) throw new Error("Failed to sort items");
      return response.json();
    },
    onSuccess: () => {
      invalidateScheduleItems();
      toast({ title: "Sorted by date", description: "Schedule items have been re-ordered by start date." });
    },
    onError: (error: Error) => {
      toast({ title: "Sort failed", description: error.message, variant: "destructive" });
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
      invalidateScheduleItems();
      
      if (pendingAutoLink && newItem?.id) {
        try {
          if (pendingAutoLink.predecessorId) {
            await fetch(`/api/schedule-items/${newItem.id}/dependencies`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ predecessorId: pendingAutoLink.predecessorId, type: 'FS', lag: pendingAutoLink.lag ?? 0 }),
            });
          } else if (pendingAutoLink.successorId) {
            await fetch(`/api/schedule-items/${pendingAutoLink.successorId}/dependencies`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ predecessorId: String(newItem.id), type: 'FS' }),
            });
          }
          await invalidateScheduleItems();
          
          if (pendingAutoLink.insertAfterItemId && insertAfterItemRef.current) {
            setTimeout(() => {
              if (insertAfterItemRef.current) {
                insertAfterItemRef.current(newItem.id, pendingAutoLink.insertAfterItemId!);
              }
            }, 100);
          }
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
      setPendingAutoLink(null);
      toast({
        title: "Failed to create item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update schedule item
  const applyTaskOffsets = async (
    item: ScheduleItem,
    offsets: Array<{ taskId: string; offsetDays: number; offsetFrom: "start" | "end" }>
  ) => {
    const validOffsets = offsets.filter(o => o.taskId && (o.offsetDays !== 0 || o.offsetFrom));
    for (const o of validOffsets) {
      const refDate = o.offsetFrom === "end" ? item.endDate : item.startDate;
      if (!refDate) continue;
      const base = new Date(refDate as any);
      if (isNaN(base.getTime())) continue;
      const due = new Date(base);
      due.setDate(due.getDate() + o.offsetDays);
      await fetch(`/api/tasks/${o.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dueDate: due.toISOString() }),
      });
    }
  };

  const updateItemMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!editingItem) throw new Error("No item selected");
      const { _originalStart: _os, _originalEnd: _oe, ...body } = data;
      const response = await fetch(`/api/schedule-items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Failed to update item");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: async (updatedItem, variables) => {
      if (taskLinkOffsetsLocal.length > 0) {
        await applyTaskOffsets(updatedItem, taskLinkOffsetsLocal);
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      }

      const origStart: Date | null = variables._originalStart ?? null;
      const origEnd: Date | null = variables._originalEnd ?? null;
      if ((origStart || origEnd) && updatedItem.startDate && updatedItem.endDate) {
        const effectiveOrigStart = origStart ?? new Date(updatedItem.startDate as string);
        const effectiveOrigEnd = origEnd ?? new Date(updatedItem.endDate as string);
        const cacheKey = schedule?.id
          ? [`/api/schedules/${schedule.id}/items`]
          : [`/api/projects/${projectId}/schedule-items`];
        const currentItems: ScheduleItem[] =
          queryClient.getQueryData<ScheduleItem[]>(cacheKey) ?? scheduleItems;

        const cascadeUpdates = computeMoveCascade({
          movedItemId: updatedItem.id,
          originalStart: effectiveOrigStart,
          originalEnd: effectiveOrigEnd,
          newStart: new Date(updatedItem.startDate as string),
          newEnd: new Date(updatedItem.endDate as string),
          allItems: currentItems,
          isNonWorking: isNonWorkingDay,
        });

        if (cascadeUpdates.length > 0) {
          queryClient.setQueryData<ScheduleItem[]>(cacheKey, prev =>
            prev
              ? prev.map(it => {
                  const u = cascadeUpdates.find(a => a.id === it.id);
                  return u ? { ...it, startDate: u.startDate, endDate: u.endDate } : it;
                })
              : prev
          );
          await Promise.all(
            cascadeUpdates.map(u =>
              apiRequest(`/api/schedule-items/${u.id}`, "PATCH", { startDate: u.startDate, endDate: u.endDate })
            )
          );
        }
      }

      invalidateScheduleItems();
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
      invalidateScheduleItems();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update links",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createLinkedTaskMutation = useMutation({
    mutationFn: async (scheduleItem: ScheduleItem) => {
      const taskPayload: Record<string, unknown> = {
        title: scheduleItem.name,
        taskContextType: "project",
        projectId: projectId,
        type: "task",
        content: "",
      };
      if (scheduleItem.startDate) taskPayload.startDate = scheduleItem.startDate;
      if (scheduleItem.endDate) taskPayload.dueDate = scheduleItem.endDate;

      const taskRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(taskPayload),
      });
      if (!taskRes.ok) {
        const err = await taskRes.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to create task");
      }
      const task = await taskRes.json();

      const newIds = [...((scheduleItem.taskIds as string[]) || []), task.id];
      const linkRes = await fetch(`/api/schedule-items/${scheduleItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskIds: newIds }),
      });
      if (!linkRes.ok) throw new Error("Task created but failed to link");
      return { task, updatedItem: await linkRes.json() as ScheduleItem };
    },
    onSuccess: ({ task, updatedItem }) => {
      setEditingItem(updatedItem);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      invalidateScheduleItems();
      toast({ title: "Task created", description: `"${task.title}" linked to this schedule item.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
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
      invalidateScheduleItems();
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
      invalidateScheduleItems();
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

  // Reorder step mutation
  const reorderStepMutation = useMutation({
    mutationFn: async ({ id, sortOrder }: { id: string; sortOrder: number }) => {
      return await apiRequest(`/api/schedule-item-steps/${id}`, "PATCH", { sortOrder });
    },
    onSuccess: () => refetchSteps(),
  });

  const { data: bspProjects = [] } = useQuery<any[]>({
    queryKey: ["/api/business-schedule/projects"],
  });

  const bspProject = useMemo(
    () => (bspProjects as any[]).find((p: any) => p.id === projectId) ?? null,
    [bspProjects, projectId]
  );

  const setBspMilestoneMutation = useMutation({
    mutationFn: async ({ field, itemId }: { field: 'milestoneStartItemId' | 'milestoneEndItemId'; itemId: string | null }) => {
      return apiRequest(`/api/business-schedule/projects/${projectId}`, "PATCH", { [field]: itemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-schedule/projects"] });
    },
  });

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const steps = itemSteps as any[];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= steps.length) return;
    const currentStep = steps[index];
    const swapStep = steps[swapIndex];
    const currentOrder = currentStep.sortOrder ?? index;
    const swapOrder = swapStep.sortOrder ?? swapIndex;
    reorderStepMutation.mutate({ id: currentStep.id, sortOrder: swapOrder });
    reorderStepMutation.mutate({ id: swapStep.id, sortOrder: currentOrder });
  };

  // Bulk delete mutation
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ itemIds, status }: { itemIds: string[]; status: string }) => {
      await Promise.all(
        itemIds.map(id => apiRequest(`/api/schedule-items/${id}`, "PATCH", { status }))
      );
    },
    onSuccess: (_data, variables) => {
      invalidateScheduleItems();
      setSelectedItems(new Set());
      toast({ title: `${variables.itemIds.length} items updated` });
    },
    onError: () => {
      toast({ title: "Failed to update items", variant: "destructive" });
    },
  });

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
      invalidateScheduleItems();
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
      invalidateScheduleItems();
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
      invalidateScheduleItems();
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
        body: JSON.stringify({ parentItemId: parentId }),
      });
      if (!response.ok) throw new Error("Failed to nest item");
      return response.json() as Promise<ScheduleItem>;
    },
    onSuccess: () => {
      invalidateScheduleItems();
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

  const isNonWorkingDay = (date: Date): boolean => {
    const day = date.getDay();
    if (day === 0 && !schedule?.includeSunday) return true;
    if (day === 6 && !schedule?.includeSaturday) return true;
    return false;
  };

  const addWorkingDays = (date: Date, days: number): Date => {
    let d = new Date(date);
    let remaining = Math.abs(days);
    const step = days >= 0 ? 1 : -1;
    while (remaining > 0) {
      d = new Date(d);
      d.setDate(d.getDate() + step);
      if (!isNonWorkingDay(d)) remaining--;
    }
    return d;
  };

  const countWorkingDays = (start: Date, end: Date): number => {
    let count = 0;
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setHours(0, 0, 0, 0);
    if (s <= e) {
      let current = new Date(s);
      while (current <= e) {
        if (!isNonWorkingDay(current)) count++;
        current.setDate(current.getDate() + 1);
      }
    }
    return count;
  };

  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const updateWorkingDaysMutation = useMutation({
    mutationFn: async (data: { includeSaturday?: boolean; includeSunday?: boolean; clientVisibilityWeeks?: number | null; businessAssignColor?: string | null; businessAssignStatus?: string | null }) => {
      return await apiRequest(`/api/schedules/${schedule?.id}/working-days`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
    },
  });

  const createPreconstructionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/schedules", "POST", {
        projectId,
        scheduleCategory: "preconstruction",
        name: "Preconstruction Schedule",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
      setScheduleCategory("preconstruction");
      toast({ title: "Preconstruction schedule created" });
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
      invalidateScheduleItems();
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
    setDurationInput("1");
    setNewItemDependencies([]);
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

    const dur = parseInt(durationInput, 10);
    if (!dur || dur <= 0) {
      toast({
        title: "Validation Error",
        description: "Duration must be at least 1 day",
        variant: "destructive",
      });
      return;
    }

    const data: any = {
      scheduleId: schedule.id,
      ...formData,
      assignedToId: formData.assignedToId === "" ? null : formData.assignedToId,
      parentItemId: formData.parentItemId === "" ? null : formData.parentItemId,
      useWorkingDaysOverride: formData.useWorkingDaysOverride,
      taskLinkOffsets: taskLinkOffsetsLocal.length > 0 ? taskLinkOffsetsLocal : undefined,
    };

    if (editingItem && editingItem.id) {
      if (editingItem.startDate) {
        data._originalStart = new Date(editingItem.startDate as string);
      }
      if (editingItem.endDate) {
        data._originalEnd = new Date(editingItem.endDate as string);
      }
      updateItemMutation.mutate(data);
    } else {
      const deps = editingItem?.dependencies 
        ? (editingItem.dependencies as any[]) 
        : newItemDependencies;
      if (deps && deps.length > 0) {
        data.dependencies = deps.map((d: any) => ({
          id: d.id,
          type: d.type || 'FS',
          lag: d.lag ?? 0,
        }));
      }
      createItemMutation.mutate(data);
    }
  };

  // Handle export schedule to CSV
  const handleExportSchedule = () => {
    if (!scheduleItems.length) {
      toast({ title: "Nothing to export", description: "Add items to the schedule first.", variant: "destructive" });
      return;
    }
    
    const headers = ["Name", "Type", "Status", "Priority", "Start Date", "End Date", "Duration (working days)", "Assignee", "Progress %", "Parent", "Notes"];
    
    const rows = scheduleItems.map(item => {
      const parentItem = scheduleItems.find(si => si.id === item.parentItemId);
      return [
        item.name,
        item.type,
        statusOptions.find((o: any) => o.value === item.status)?.label || item.status,
        item.priority || "",
        item.startDate ? new Date(item.startDate).toLocaleDateString('en-AU') : "",
        item.endDate ? new Date(item.endDate).toLocaleDateString('en-AU') : "",
        item.startDate && item.endDate ? countWorkingDays(new Date(item.startDate), new Date(item.endDate)).toString() : (item.duration?.toString() || ""),
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
      const sd = editingItem.startDate ? new Date(editingItem.startDate) : null;
      const ed = editingItem.endDate ? new Date(editingItem.endDate) : null;
      if (sd && ed) {
        setDurationInput(countWorkingDays(sd, ed).toString());
      } else {
        setDurationInput("");
      }
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
        insertAfterItemRef,
        scrollToTodayRef,
      }}
    >
      <div className="flex flex-col h-full bg-background rounded-lg border overflow-hidden">
        {/* Schedule Category Tabs - only shown when preconstruction schedule exists */}
        {hasPreconstruction && (
          <div className="h-8 bg-muted/30 flex items-center px-2 gap-1 border-b border-border flex-shrink-0">
            <button
              onClick={() => setScheduleCategory("construction")}
              className={`h-6 px-3 text-xs rounded-md flex items-center gap-1.5 transition-colors ${
                scheduleCategory === "construction"
                  ? "bg-primary text-primary-foreground"
                  : "hover-elevate text-muted-foreground"
              }`}
            >
              <GanttChart className="w-3 h-3" />
              Construction
            </button>
            <button
              onClick={() => setScheduleCategory("preconstruction")}
              className={`h-6 px-3 text-xs rounded-md flex items-center gap-1.5 transition-colors ${
                scheduleCategory === "preconstruction"
                  ? "bg-primary text-primary-foreground"
                  : "hover-elevate text-muted-foreground"
              }`}
            >
              <HardHat className="w-3 h-3" />
              Preconstruction
            </button>
          </div>
        )}
        {/* UNIFIED 3-ROW HEADER FOR ALL VIEWS */}
        
        {/* Row 1 - Project Controls (36px) */}
        <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
          {/* Left: Project Name + Lock/Unlock Toggle + Online/Offline Indicator */}
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">{pageTitle}</h2>
            
            {/* Online/Offline toggle (controls visibility, independent of lock state) */}
            <button
              onClick={() => {
                if (toggleOnlineMutation.isPending) return;
                if (schedule?.isOnline) {
                  // Going offline — require confirmation
                  setShowOfflineConfirm(true);
                } else {
                  toggleOnlineMutation.mutate(true);
                }
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs text-muted-foreground hover-elevate active-elevate-2"
              disabled={toggleOnlineMutation.isPending}
              data-testid="button-toggle-online"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${schedule?.isOnline ? "bg-green-500" : "bg-muted-foreground"}`} />
              <span>{schedule?.isOnline ? "Online" : "Offline"}</span>
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
                onClick={() => setShowLockConfirm(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="button-lock-schedule"
              >
                <Unlock className="w-3.5 h-3.5" />
                Unlocked (Edit)
              </button>
            )}
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-primary-foreground border-primary/20 hover:bg-primary/90 active-elevate-2"
              onClick={() => { setEditingItem(null); resetForm(); setShowItemDialog(true); }}
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
                <DropdownMenuItem
                  onClick={() => sortByDateMutation.mutate()}
                  disabled={sortByDateMutation.isPending || scheduleItems.length === 0}
                >
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  {sortByDateMutation.isPending ? "Sorting..." : "Sort by Date"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="button-settings" onClick={() => setShowWorkingDaysDialog(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Schedule Settings
                </DropdownMenuItem>
                {!hasPreconstruction && scheduleCategory === "construction" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => createPreconstructionMutation.mutate()}
                      disabled={createPreconstructionMutation.isPending}
                    >
                      <HardHat className="w-4 h-4 mr-2" />
                      {createPreconstructionMutation.isPending ? "Creating..." : "Open Preconstruction Schedule"}
                    </DropdownMenuItem>
                  </>
                )}
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

            {/* Collapse/Expand all + Search bar - only show for List/Calendar views */}
            {activeView !== 'gantt' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setAllCollapsed(prev => !prev)}
                title={allCollapsed ? "Expand all" : "Collapse all"}
              >
                {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
              </Button>
            )}
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
                onClick={() => scrollToTodayRef.current?.()}
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
                <Button onClick={() => { setEditingItem(null); resetForm(); setShowItemDialog(true); }} disabled={schedule?.status === "locked"}>
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
                      <div className="flex items-center flex-wrap gap-2 p-2 mb-2 bg-muted/50 rounded-lg border">
                        <span className="text-xs text-muted-foreground shrink-0">
                          {selectedItems.size} selected
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => bulkStatusMutation.mutate({ itemIds: Array.from(selectedItems), status: 'completed' })}
                          disabled={bulkStatusMutation.isPending}
                          data-testid="button-bulk-complete"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Mark complete
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => bulkStatusMutation.mutate({ itemIds: Array.from(selectedItems), status: 'in_progress' })}
                          disabled={bulkStatusMutation.isPending}
                          data-testid="button-bulk-in-progress"
                        >
                          Mark in progress
                        </Button>
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
                      allCollapsed={allCollapsed}
                      locked={schedule?.status === 'locked'}
                      onNestItem={(itemId, parentId) => {
                        nestItemMutation.mutate({ itemId, parentId });
                      }}
                      onReorderItem={async (itemId, afterItemId, newParentId) => {
                        const movingItem = scheduleItems.find(i => i.id === itemId);
                        if (!movingItem) return;
                        
                        const siblingItems = scheduleItems
                          .filter(i => (i.parentItemId || null) === (newParentId || null))
                          .filter(i => i.id !== itemId)
                          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                        
                        let insertIdx = 0;
                        if (afterItemId) {
                          let afterIdx = siblingItems.findIndex(i => i.id === afterItemId);
                          if (afterIdx < 0) {
                            const afterItem = scheduleItems.find(i => i.id === afterItemId);
                            if (afterItem?.parentItemId) {
                              afterIdx = siblingItems.findIndex(i => i.id === afterItem.parentItemId);
                            }
                          }
                          insertIdx = afterIdx >= 0 ? afterIdx + 1 : siblingItems.length;
                        }
                        siblingItems.splice(insertIdx, 0, movingItem);
                        
                        const targetParent = newParentId ?? null;
                        
                        const updates = siblingItems.map((item, idx) => {
                          const update: any = { id: item.id, sortOrder: idx };
                          if (item.id === itemId) {
                            update.parentItemId = targetParent;
                          }
                          return update;
                        });
                        
                        try {
                          await fetch("/api/schedule-items/batch-sort", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ updates }),
                          });
                          invalidateScheduleItems();
                        } catch (error) {
                          toast({ title: "Failed to reorder", variant: "destructive" });
                        }
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
                      onAddSubItem={(parentItem) => {
                        setEditingItem({ parentItemId: parentItem.id } as any);
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
                nonWorkingDays={nonWorkingDays as any[]}
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

      <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              This will make the schedule read-only and visible to clients. Any unsaved changes will be committed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { updateStatusMutation.mutate("locked"); setShowLockConfirm(false); }}>
              Lock Schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOfflineConfirm} onOpenChange={setShowOfflineConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take Schedule Offline?</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the schedule from external users. They will no longer be able to see it until you bring it back online.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { toggleOnlineMutation.mutate(false); setShowOfflineConfirm(false); }}>
              Take Offline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={(open) => {
        setShowItemDialog(open);
        if (!open) {
          setPendingAutoLink(null);
          setEditingItem(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingItem && editingItem.id ? `Edit: ${editingItem.name || "Schedule Item"}` : "Add Schedule Item"}</DialogTitle>
            <DialogDescription>
              {editingItem && editingItem.id ? "Update the schedule item details." : "Create a new item in the schedule."}
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
                    const newStart = e.target.value;
                    const dur = parseInt(durationInput, 10);
                    if (newStart && formData.endDate) {
                      if (editingItem?.id && formData.startDate) {
                        // Editing an existing item: shift end date by the same calendar-day
                        // delta so working duration is preserved and FS successors cascade
                        const oldStartMs = new Date(formData.startDate).getTime();
                        const newStartMs = new Date(newStart).getTime();
                        const calDeltaDays = Math.round((newStartMs - oldStartMs) / 86400000);
                        const newEnd = new Date(formData.endDate);
                        newEnd.setDate(newEnd.getDate() + calDeltaDays);
                        const newEndStr = newEnd.toISOString().split('T')[0];
                        setFormData({ ...formData, startDate: newStart, endDate: newEndStr });
                        setDurationInput(countWorkingDays(new Date(newStart), newEnd).toString());
                      } else {
                        setFormData({ ...formData, startDate: newStart });
                        setDurationInput(countWorkingDays(new Date(newStart), new Date(formData.endDate)).toString());
                      }
                    } else if (newStart && !formData.endDate && !isNaN(dur) && dur > 0) {
                      const end = addWorkingDays(new Date(newStart), dur - 1);
                      setFormData({ ...formData, startDate: newStart, endDate: end.toISOString().split('T')[0] });
                    } else {
                      setFormData({ ...formData, startDate: newStart });
                    }
                  }}
                  required
                  data-testid="input-item-start-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-duration">Duration (working days)</Label>
                <Input
                  id="item-duration"
                  type="number"
                  min="1"
                  placeholder="Auto"
                  value={durationInput}
                  onChange={(e) => {
                    setDurationInput(e.target.value);
                  }}
                  onBlur={() => {
                    const raw = parseInt(durationInput, 10);
                    const days = isNaN(raw) || raw < 1 ? 1 : raw;
                    if (raw < 1 || isNaN(raw)) {
                      setDurationInput('1');
                    }
                    if (days > 0) {
                      if (formData.startDate) {
                        const start = new Date(formData.startDate);
                        const end = addWorkingDays(start, days - 1);
                        setFormData({ ...formData, endDate: end.toISOString().split('T')[0] });
                      } else if (formData.endDate) {
                        const end = new Date(formData.endDate);
                        const start = addWorkingDays(end, -(days - 1));
                        setFormData({ ...formData, startDate: start.toISOString().split('T')[0] });
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
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
                  onChange={(e) => {
                    const newEnd = e.target.value;
                    const dur = parseInt(durationInput, 10);
                    if (formData.startDate && newEnd) {
                      setFormData({ ...formData, endDate: newEnd });
                      setDurationInput(countWorkingDays(new Date(formData.startDate), new Date(newEnd)).toString());
                    } else if (!formData.startDate && newEnd && !isNaN(dur) && dur > 0) {
                      const start = addWorkingDays(new Date(newEnd), -(dur - 1));
                      setFormData({ ...formData, endDate: newEnd, startDate: start.toISOString().split('T')[0] });
                    } else {
                      setFormData({ ...formData, endDate: newEnd });
                    }
                  }}
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
              <Label htmlFor="item-parent">Stage</Label>
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

            {/* Type / Status / Assignee / Progress — compact 2×2 grid */}
            {(() => {
              const isParentWithChildren = !!(editingItem && !editingItem.parentItemId && scheduleItems.some(i => i.parentItemId === editingItem.id));
              const showProgress = !!(editingItem || formData.status === "in_progress");
              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="item-type" className="text-xs text-muted-foreground">Type</Label>
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

                  {!isParentWithChildren && (
                    <div className="space-y-1">
                      <Label htmlFor="item-status" className="text-xs text-muted-foreground">Status</Label>
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
                  )}

                  {!isParentWithChildren && (
                    <div className="space-y-1">
                      <Label htmlFor="item-assignee" className="text-xs text-muted-foreground">Assignee</Label>
                      <ContactSelect
                        value={formData.assignedToId || ""}
                        onValueChange={(value) => setFormData({ ...formData, assignedToId: value || "" })}
                        placeholder="None"
                        allowBusiness={true}
                        data-testid="select-item-assignee"
                      />
                    </div>
                  )}

                  {showProgress && !isParentWithChildren && (
                    <div className="space-y-1">
                      <Label htmlFor="item-progress" className="text-xs text-muted-foreground">Progress %</Label>
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
              );
            })()}

            {/* Dependencies Section */}
            {(() => {
              const isEditingExisting = !!(editingItem && editingItem.id);
              const isNewViaInsert = !!(editingItem && !editingItem.id);
              const activeDeps: any[] = isEditingExisting
                ? ((editingItem!.dependencies as any[]) || [])
                : isNewViaInsert
                  ? ((editingItem!.dependencies as any[]) || [])
                  : newItemDependencies;
              const setActiveDeps = (deps: any[]) => {
                if (isEditingExisting || isNewViaInsert) {
                  setEditingItem({ ...editingItem!, dependencies: deps } as any);
                } else {
                  setNewItemDependencies(deps);
                }
              };
              const editingId = editingItem?.id || null;
              return (
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
                          item.id !== editingId && 
                          !activeDeps.some((d: any) => d.id === item.id)
                        )
                        .map(item => (
                          <DropdownMenuItem
                            key={item.id}
                            onClick={async () => {
                              if (!isEditingExisting) {
                                setActiveDeps([...activeDeps, { id: item.id, type: 'FS', lag: 0, _name: item.name }]);
                                toast({ title: "Dependency added" });
                              } else {
                                try {
                                  const updatedItem = await apiRequest(`/api/schedule-items/${editingId}/dependencies`, "POST", {
                                    predecessorId: item.id,
                                    type: "FS",
                                  });
                                  setEditingItem(updatedItem);
                                  invalidateScheduleItems();
                                  toast({ title: "Dependency added" });
                                } catch (error: any) {
                                  toast({
                                    title: "Failed to add dependency",
                                    description: error.error || error.message || "This would create a circular dependency",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                            data-testid={`option-add-dependency-${item.id}`}
                          >
                            {item.name}
                          </DropdownMenuItem>
                        ))}
                      {scheduleItems.filter(item => 
                        item.id !== editingId && 
                        !activeDeps.some((d: any) => d.id === item.id)
                      ).length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No available items
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCreateLinked(v => !v);
                      setCreateLinkedForm({ name: '', startDate: formData.endDate || '', duration: '1' });
                    }}
                    data-testid="button-create-linked-task"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create &amp; link task
                  </Button>
                </div>

                {showCreateLinked && (
                  <div className="p-3 rounded-md border bg-muted/30 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">New linked predecessor task</div>
                    <Input
                      placeholder="Task name"
                      value={createLinkedForm.name}
                      onChange={e => setCreateLinkedForm(f => ({ ...f, name: e.target.value }))}
                      data-testid="input-linked-task-name"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={createLinkedForm.startDate}
                        onChange={e => setCreateLinkedForm(f => ({ ...f, startDate: e.target.value }))}
                        className="flex-1"
                        data-testid="input-linked-task-start"
                      />
                      <Input
                        type="number"
                        min="1"
                        placeholder="Duration (days)"
                        value={createLinkedForm.duration}
                        onChange={e => setCreateLinkedForm(f => ({ ...f, duration: e.target.value }))}
                        className="w-28"
                        data-testid="input-linked-task-duration"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!createLinkedForm.name.trim()}
                        onClick={async () => {
                          if (!createLinkedForm.name.trim() || !projectId) return;
                          try {
                            const duration = Math.max(1, parseInt(createLinkedForm.duration) || 1);
                            let endDate = createLinkedForm.startDate;
                            if (createLinkedForm.startDate) {
                              const start = new Date(createLinkedForm.startDate + 'T00:00:00');
                              endDate = addWorkingDays(start, duration - 1).toISOString().split('T')[0];
                            }
                            const newTask = await apiRequest(`/api/projects/${projectId}/schedule-items`, "POST", {
                              name: createLinkedForm.name.trim(),
                              startDate: createLinkedForm.startDate || null,
                              endDate: endDate || null,
                              duration,
                              type: 'task',
                              status: 'not_started',
                            });
                            if (isEditingExisting && editingId) {
                              const updatedItem = await apiRequest(`/api/schedule-items/${editingId}/dependencies`, "POST", {
                                predecessorId: newTask.id,
                                type: "FS",
                              });
                              setEditingItem(updatedItem);
                            } else {
                              setActiveDeps([...activeDeps, { id: newTask.id, type: 'FS', lag: 0, _name: newTask.name }]);
                            }
                            invalidateScheduleItems();
                            setShowCreateLinked(false);
                            setCreateLinkedForm({ name: '', startDate: '', duration: '1' });
                            toast({ title: "Task created and linked" });
                          } catch (err: any) {
                            toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
                          }
                        }}
                        data-testid="button-confirm-linked-task"
                      >
                        Create &amp; link
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCreateLinked(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {activeDeps.length > 0 ? (
                    activeDeps.map((dep: any) => {
                      const predItem = scheduleItems.find(i => i.id === dep.id) || (dep._name ? { id: dep.id, name: dep._name } as any : null);
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
                              {dep.lag != null && dep.lag > 0 && (
                                <span className="text-xs text-muted-foreground">{dep.lag}d lag</span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={async () => {
                                if (!isEditingExisting) {
                                  setActiveDeps(activeDeps.filter((d: any) => d.id !== dep.id));
                                  toast({ title: "Dependency removed" });
                                } else {
                                  try {
                                    const updatedItem = await apiRequest(
                                      `/api/schedule-items/${editingId}/dependencies/${dep.id}`,
                                      "DELETE"
                                    );
                                    setEditingItem(updatedItem);
                                    invalidateScheduleItems();
                                    toast({ title: "Dependency removed" });
                                  } catch (error) {
                                    toast({
                                      title: "Failed to remove dependency",
                                      variant: "destructive",
                                    });
                                  }
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
                              value={dep.lag ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updatedDeps = activeDeps.map((d: any) =>
                                  d.id === dep.id ? { ...d, lag: val === "" ? "" : parseInt(val) } : d
                                );
                                setActiveDeps(updatedDeps);
                              }}
                              onBlur={async (e) => {
                                const newLag = parseInt(e.target.value) || 0;
                                const updatedDeps = activeDeps.map((d: any) =>
                                  d.id === dep.id ? { ...d, lag: newLag } : d
                                );
                                setActiveDeps(updatedDeps);
                                if (!isEditingExisting) {
                                  if (predItem.endDate) {
                                    const predEnd = new Date(predItem.endDate);
                                    const newStart = addWorkingDays(predEnd, newLag + 1);
                                    const startStr = newStart.toISOString().split("T")[0];
                                    let endStr = startStr;
                                    if (formData.startDate && formData.endDate) {
                                      const workDuration = countWorkingDays(new Date(formData.startDate), new Date(formData.endDate));
                                      const newEnd = addWorkingDays(newStart, Math.max(0, workDuration - 1));
                                      endStr = newEnd.toISOString().split("T")[0];
                                    }
                                    setFormData(prev => ({ ...prev, startDate: startStr, endDate: endStr }));
                                  }
                                } else {
                                  try {
                                    const updatedItem = await apiRequest(
                                      `/api/schedule-items/${editingId}/dependencies/${dep.id}`,
                                      "PATCH",
                                      { lag: newLag }
                                    );
                                    if (predItem.endDate) {
                                      const predEnd = new Date(predItem.endDate);
                                      const newStart = addWorkingDays(predEnd, newLag + 1);
                                      const startStr = newStart.toISOString().split("T")[0];
                                      let endStr = startStr;
                                      if (editingItem!.startDate && editingItem!.endDate) {
                                        const workDuration = countWorkingDays(new Date(editingItem!.startDate), new Date(editingItem!.endDate));
                                        const newEnd = addWorkingDays(newStart, Math.max(0, workDuration - 1));
                                        endStr = newEnd.toISOString().split("T")[0];
                                      }
                                      const dateUpdatedItem = await apiRequest(`/api/schedule-items/${editingId}`, "PATCH", {
                                        startDate: startStr,
                                        endDate: endStr,
                                      });
                                      setEditingItem({ ...dateUpdatedItem, dependencies: updatedDeps });
                                      setFormData(prev => ({ ...prev, startDate: startStr, endDate: endStr }));
                                      invalidateScheduleItems();
                                      toast({ title: "Lag updated and dates adjusted" });
                                    } else {
                                      setEditingItem({ ...updatedItem, dependencies: updatedDeps });
                                    }
                                  } catch (error) {
                                    toast({
                                      title: "Failed to update lag",
                                      variant: "destructive",
                                    });
                                  }
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

                {editingItem?.id && (() => {
                  const successors = scheduleItems.filter(item =>
                    item.id !== editingItem.id &&
                    (item.dependencies as any[] || []).some((d: any) => d.id === editingItem.id)
                  );
                  if (successors.length === 0) return null;
                  return (
                    <div className="space-y-2 mt-4 pt-3 border-t border-dashed">
                      <Label className="text-muted-foreground">Successors (depends on this item)</Label>
                      <div className="space-y-1.5">
                        {successors.map(successor => {
                          const depInfo = (successor.dependencies as any[]).find((d: any) => d.id === editingItem.id);
                          return (
                            <div
                              key={successor.id}
                              className="p-2 rounded-md border border-dashed bg-muted/30 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <div className="text-sm">{successor.name}</div>
                                <Badge variant="outline" className="text-xs">
                                  {depInfo?.type || "FS"}
                                </Badge>
                                {depInfo?.lag != null && depInfo.lag > 0 && (
                                  <span className="text-xs text-muted-foreground">{depInfo.lag}d lag</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">successor</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
              );
            })()}

            {editingItem && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label>Sub-items</Label>
                  <span className="text-xs text-muted-foreground">
                    {(itemSteps as any[]).filter((s: any) => s.isCompleted).length}/{(itemSteps as any[]).length} done
                  </span>
                </div>
                
                {/* Sub-items List */}
                <div className="space-y-1">
                  {(itemSteps as any[]).map((step: any, index: number) => (
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
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleMoveStep(index, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleMoveStep(index, 'down')}
                          disabled={index === (itemSteps as any[]).length - 1}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => deleteStepMutation.mutate(step.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Add Sub-item Input */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add a sub-item..."
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

            {/* Advanced section — Allow on weekends, Build markers, Linked Items */}
              <div className="pt-3 border-t">
                <button
                  type="button"
                  className="flex items-center gap-1.5 w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowAdvanced(v => !v)}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
                  <span className="font-medium">Advanced</span>
                </button>

                {showAdvanced && (
                  <div className="space-y-4 mt-3">
                    {/* Allow on weekends */}
                    <div className="flex items-center justify-between py-1">
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

                    {/* Business Schedule Build Markers */}
                    {bspProject && editingItem && editingItem.id && (
                      <div className="space-y-2 pt-3 border-t">
                        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Business Schedule Markers</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const isCurrent = bspProject.milestoneStartItemId === String(editingItem.id);
                              setBspMilestoneMutation.mutate({ field: 'milestoneStartItemId', itemId: isCurrent ? null : String(editingItem.id) });
                            }}
                            className={bspProject.milestoneStartItemId === String(editingItem.id) ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : ""}
                          >
                            <Flag className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                            {bspProject.milestoneStartItemId === String(editingItem.id) ? "Clear Build Start" : "Set as Build Start"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const isCurrent = bspProject.milestoneEndItemId === String(editingItem.id);
                              setBspMilestoneMutation.mutate({ field: 'milestoneEndItemId', itemId: isCurrent ? null : String(editingItem.id) });
                            }}
                            className={bspProject.milestoneEndItemId === String(editingItem.id) ? "border-rose-500 text-rose-600 dark:text-rose-400" : ""}
                          >
                            <Flag className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
                            {bspProject.milestoneEndItemId === String(editingItem.id) ? "Clear Build End" : "Set as Build End"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Mark this item as the Build Start or End date shown on the Business Schedule.
                        </p>
                      </div>
                    )}

                    {/* Linked Items */}
                    {editingItem && (
                      <div className="space-y-3 pt-3 border-t">
                        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Linked Items</Label>

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
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                disabled={createLinkedTaskMutation.isPending}
                                onClick={() => createLinkedTaskMutation.mutate(editingItem)}
                              >
                                {createLinkedTaskMutation.isPending
                                  ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  : <Plus className="w-3 h-3 mr-1" />}
                                Create Task
                              </Button>
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
                                          setTaskLinkOffsetsLocal(prev => [...prev, { taskId: t.id, offsetDays: 0, offsetFrom: "end" as const }]);
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
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Input
                                        type="number"
                                        min="0"
                                        value={Math.abs(offset?.offsetDays ?? 0)}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => {
                                          const absVal = Math.max(0, parseInt(e.target.value) || 0);
                                          const currentDir = (offset?.offsetDays ?? 0) < 0 ? -1 : 1;
                                          const days = currentDir * absVal;
                                          setTaskLinkOffsetsLocal(prev => {
                                            const existing = prev.find(o => o.taskId === taskId);
                                            if (existing) return prev.map(o => o.taskId === taskId ? { ...o, offsetDays: days } : o);
                                            return [...prev, { taskId, offsetDays: days, offsetFrom: "end" as const }];
                                          });
                                        }}
                                        className="h-6 w-14 text-xs"
                                        placeholder="0"
                                      />
                                      <span className="text-xs text-muted-foreground">days</span>
                                      <Select
                                        value={(offset?.offsetDays ?? 0) < 0 ? "before" : "after"}
                                        onValueChange={(dir: "before" | "after") => {
                                          const absVal = Math.abs(offset?.offsetDays ?? 0);
                                          const days = dir === "before" ? -absVal : absVal;
                                          setTaskLinkOffsetsLocal(prev => {
                                            const existing = prev.find(o => o.taskId === taskId);
                                            if (existing) return prev.map(o => o.taskId === taskId ? { ...o, offsetDays: days } : o);
                                            return [...prev, { taskId, offsetDays: days, offsetFrom: "end" as const }];
                                          });
                                        }}
                                      >
                                        <SelectTrigger className="h-6 w-20 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="before">before</SelectItem>
                                          <SelectItem value="after">after</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Select
                                        value={offset?.offsetFrom || "end"}
                                        onValueChange={(value: "start" | "end") => {
                                          setTaskLinkOffsetsLocal(prev => {
                                            const existing = prev.find(o => o.taskId === taskId);
                                            if (existing) return prev.map(o => o.taskId === taskId ? { ...o, offsetFrom: value } : o);
                                            return [...prev, { taskId, offsetDays: offset?.offsetDays ?? 0, offsetFrom: value }];
                                          });
                                        }}
                                      >
                                        <SelectTrigger className="h-6 w-24 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="start">start date</SelectItem>
                                          <SelectItem value="end">end date</SelectItem>
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
                )}
              </div>
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

            <div className="space-y-3 pt-3 border-t">
              <Label className="text-sm font-medium">Business Auto-Assign</Label>
              <p className="text-xs text-muted-foreground">
                When a task is assigned to the business, automatically apply a Gantt bar colour and set a status.
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Gantt bar colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(schedule as any)?.businessAssignColor ?? '#9ca3af'}
                      onChange={(e) => {
                        updateWorkingDaysMutation.mutate({ businessAssignColor: e.target.value });
                      }}
                      className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5"
                      title="Pick a colour for business-assigned tasks"
                    />
                    {(schedule as any)?.businessAssignColor && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2 text-muted-foreground"
                        onClick={() => updateWorkingDaysMutation.mutate({ businessAssignColor: null })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Auto status</Label>
                  <Select
                    value={(schedule as any)?.businessAssignStatus ?? ''}
                    onValueChange={(val) => {
                      updateWorkingDaysMutation.mutate({ businessAssignStatus: val || null });
                    }}
                  >
                    <SelectTrigger className="w-[160px] h-8 text-sm">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {statusOptions.map((opt: any) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            {opt.color && (
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                            )}
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
