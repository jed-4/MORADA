import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { TYPE_COLORS } from "@/lib/taskColors";
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
import { ScheduleActivityFeedPopover } from "@/components/ScheduleActivityFeedPopover";
import { ContactSelect } from "@/components/ContactSelect";
import Gantt from "./Gantt";
import { ImportScheduleDialog } from "@/components/schedule/ImportScheduleDialog";
import { useScheduleItemStatusOptions } from "@/hooks/useScheduleItemStatusOptions";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ScheduleParams {
  projectId: string;
}

// ---------------------------------------------------------------------------
// Schedule history guard (module-scoped)
//
// The Schedule page needs to intercept SPA navigations (programmatic and
// link-click) while the schedule is unlocked, so it can prompt the user
// to lock-and-leave. Previously this was implemented by replacing
// `history.pushState` / `history.replaceState` inside a useEffect and
// restoring them on cleanup. If the cleanup ever failed to run (error
// boundary, hot-reload, fast unmount/remount race) the patched functions
// would leak forever and silently swallow wouter route changes — that's
// the cause of the "back button changes URL but page stays stale" bug.
//
// The fix: patch pushState/replaceState exactly once at module scope and
// look up the active guard via a mutable variable. With no active guard
// the patch is a transparent passthrough, so even a leaked install can't
// break navigation app-wide.
// ---------------------------------------------------------------------------
type ScheduleHistoryGuard = {
  isActive: () => boolean;
  isAllowedUrl: (urlStr: string) => boolean;
  onBlocked: (urlStr: string) => void;
};

let activeScheduleGuard: ScheduleHistoryGuard | null = null;
let scheduleHistoryPatched = false;

function patchHistoryOnce() {
  if (scheduleHistoryPatched || typeof window === "undefined") return;
  scheduleHistoryPatched = true;
  const origPushState = window.history.pushState.bind(window.history);
  const origReplaceState = window.history.replaceState.bind(window.history);
  const wrap = (orig: typeof window.history.pushState) =>
    function (this: History, data: any, unused: string, url?: string | URL | null) {
      const guard = activeScheduleGuard;
      if (guard && url && guard.isActive()) {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (!guard.isAllowedUrl(urlStr)) {
          guard.onBlocked(urlStr);
          return;
        }
      }
      return orig.call(this, data, unused, url);
    };
  window.history.pushState = wrap(origPushState) as typeof window.history.pushState;
  window.history.replaceState = wrap(origReplaceState) as typeof window.history.replaceState;
}

function installScheduleHistoryGuard(guard: ScheduleHistoryGuard): () => void {
  patchHistoryOnce();
  activeScheduleGuard = guard;
  return () => {
    if (activeScheduleGuard === guard) {
      activeScheduleGuard = null;
    }
  };
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
  const [ganttSortResetKey, setGanttSortResetKey] = useState(0);
  const [zoomLevel, setZoomLevel] = useState<"day" | "week" | "month">("day");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showOfflineConfirm, setShowOfflineConfirm] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [pendingAutoLink, setPendingAutoLink] = useState<{ successorId?: string; predecessorId?: string; insertAfterItemId?: string; lag?: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [newItemDependencies, setNewItemDependencies] = useState<any[]>([]);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [loadTemplateStartDate, setLoadTemplateStartDate] = useState<string>("");
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
    color: "" as string,
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
      // Invalidate the schedule activity feed and unread count
      queryClient.invalidateQueries({ queryKey: ["/api/schedules", schedule.id, "activity-feed"] });
    }
  }, [projectId, schedule?.id]);

  const isUnlocked = schedule?.status !== "locked" && !!schedule;
  const [showLeaveGuardDialog, setShowLeaveGuardDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);
  // Sentinel used by pendingNavigationRef when the user triggered a browser Back
  // (there is no URL to navigate to — we step back through history instead).
  const BACK_NAV = "__browser_back__";
  // When true, the very next popstate is one WE triggered programmatically (after
  // the user chose Save/Discard for a Back press) and must be allowed through.
  const bypassGuardRef = useRef(false);
  // When true, the next popstate is the forward step we made to cancel a Back
  // press (history.go(1)); we ignore it so the cancel doesn't re-open the dialog.
  const cancelingBackRef = useRef(false);
  const [, navigate] = useLocation();

  const scheduleRef = useRef(schedule);
  const isUnlockedRef = useRef(isUnlocked);
  const scrollToTodayRef = useRef<(() => void) | null>(null);
  const insertAfterItemRef = useRef<((newItemId: string, afterItemId: string) => void) | null>(null);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { isUnlockedRef.current = isUnlocked; }, [isUnlocked]);

  const leaveTo = useCallback((targetUrl: string) => {
    if (targetUrl === BACK_NAV) {
      // The user chose Save/Discard for a Back press. Allow the next popstate
      // through and actually go back one entry to the page they came from.
      bypassGuardRef.current = true;
      window.history.back();
    } else {
      navigate(targetUrl);
    }
  }, [navigate]);

  const finishEditAndNavigate = useCallback(async (targetUrl: string, mode: "commit" | "discard") => {
    if (schedule && isUnlocked) {
      try {
        const res = await fetch(`/api/schedules/${schedule.id}/edit-${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        isUnlockedRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
        invalidateScheduleItems();
        leaveTo(targetUrl);
      } catch (e) {
        // Keep the user on the page so they don't lose work when Save/Discard fails.
        toast({
          title: mode === "commit" ? "Failed to save schedule" : "Failed to discard changes",
          description: "You're still on the schedule — please try again.",
          variant: "destructive",
        });
      }
    } else {
      isUnlockedRef.current = false;
      leaveTo(targetUrl);
    }
  }, [schedule, isUnlocked, projectId, navigate, toast, invalidateScheduleItems, leaveTo]);

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
      // The forward step we made to cancel a Back press — ignore it.
      if (cancelingBackRef.current) {
        cancelingBackRef.current = false;
        return;
      }
      // A back navigation we triggered ourselves after the user chose Save/Discard.
      if (bypassGuardRef.current) {
        bypassGuardRef.current = false;
        return;
      }
      if (isUnlockedRef.current && scheduleRef.current) {
        // Cancel the back navigation by stepping forward to this page again, then
        // prompt the user to Save or Discard. Never commit silently. This adds no
        // history entries, so normal Back behaviour is unaffected once editing ends.
        cancelingBackRef.current = true;
        window.history.go(1);
        pendingNavigationRef.current = BACK_NAV;
        setShowLeaveGuardDialog(true);
      }
    };

    // Install the history guard via a module-shared installer (see bottom of
    // file). It patches pushState/replaceState exactly once and consults a
    // mutable guard object instead of replacing the originals on every mount.
    // This means even if the cleanup below is skipped (error boundary, hot
    // reload, unmount race) the guard simply turns into a passthrough — wouter
    // never loses notifications about route changes.
    const guard: ScheduleHistoryGuard = {
      isActive: () => isUnlockedRef.current,
      onBlocked: (urlStr) => {
        pendingNavigationRef.current = urlStr;
        setShowLeaveGuardDialog(true);
      },
      isAllowedUrl: (urlStr) => urlStr.includes("/schedule") && urlStr.includes(projectId || ""),
    };
    const releaseGuard = installScheduleHistoryGuard(guard);

    document.addEventListener("click", clickHandler, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", clickHandler, true);
      window.removeEventListener("popstate", handlePopState);
      releaseGuard();
    };
  }, [isUnlocked, projectId]);

  useEffect(() => {
    // Refresh / tab-close can only use the browser's native "leave site?" prompt;
    // a custom Save/Discard dialog isn't possible here. We warn the user and do
    // NOT commit or discard silently — their edits stay pending (snapshot intact),
    // so nothing is lost and they can Save or Discard next time they open it.
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUnlockedRef.current && scheduleRef.current) {
        e.preventDefault();
        e.returnValue = "You're still editing this schedule. Your changes are kept as unsaved edits until you Save or Discard.";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Fetch schedule items - when we have a schedule, fetch by scheduleId for category-specific items
  const { data: scheduleItems = [], isLoading: itemsLoading } = useQuery<ScheduleItem[]>({
    queryKey: schedule?.id ? [`/api/schedules/${schedule.id}/items`] : [`/api/projects/${projectId}/schedule-items`],
    enabled: !!projectId && (!!schedule?.id || scheduleCategory === "construction"),
    placeholderData: (prev) => prev,
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

  // Save / Discard editing model.
  // "Edit" snapshots the schedule and unlocks; "Save" commits live edits and
  // locks; "Discard" reverts every change back to the snapshot and locks.
  const editBeginMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) throw new Error("No schedule found");
      return await apiRequest(`/api/schedules/${schedule.id}/edit-begin`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start editing", description: error.message, variant: "destructive" });
    },
  });

  const editCommitMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) throw new Error("No schedule found");
      return await apiRequest(`/api/schedules/${schedule.id}/edit-commit`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
      toast({ title: "Schedule saved", description: "Your changes have been saved and the schedule is locked." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save schedule", description: error.message, variant: "destructive" });
    },
  });

  const editDiscardMutation = useMutation({
    mutationFn: async () => {
      if (!schedule) throw new Error("No schedule found");
      return await apiRequest(`/api/schedules/${schedule.id}/edit-discard`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "schedules"] });
      invalidateScheduleItems();
      toast({ title: "Changes discarded", description: "The schedule has been reverted to how it was before editing." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to discard changes", description: error.message, variant: "destructive" });
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
      if (!schedule) throw new Error("No schedule selected");

      // Always fetch fresh items directly — do not rely on the cached scheduleItems
      // closure variable, which may be empty or stale when the sort button is clicked.
      const itemsRes = await fetch(`/api/schedules/${schedule.id}/items`, { credentials: "include" });
      if (!itemsRes.ok) throw new Error("Failed to load schedule items");
      const items: ScheduleItem[] = await itemsRes.json();

      if (items.length === 0) throw new Error("No items to sort");

      // Helper: safe timestamp — returns a large number for missing/invalid dates
      // so those items sort to the end rather than producing NaN comparisons.
      const safeTs = (dateStr: string | null | undefined): number => {
        if (!dateStr) return Number.MAX_SAFE_INTEGER;
        const t = new Date(dateStr).getTime();
        return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
      };

      // Helper: earliest start date among an item's own date or its children's dates
      const effectiveDate = (item: ScheduleItem): number => {
        const own = safeTs(item.startDate);
        if (own !== Number.MAX_SAFE_INTEGER) return own;
        const childDates = items
          .filter((c) => c.parentItemId === item.id)
          .map((c) => safeTs(c.startDate));
        const min = Math.min(...childDates);
        return childDates.length > 0 && isFinite(min) ? min : Number.MAX_SAFE_INTEGER;
      };

      const updates: { id: string; sortOrder: number; parentItemId: string | null }[] = [];
      let counter = 0;

      // 1. Sort top-level parents by effective start date (stable: MAX_SAFE_INTEGER - MAX_SAFE_INTEGER = 0, not NaN)
      const topLevel = items
        .filter((i) => !i.parentItemId)
        .sort((a, b) => effectiveDate(a) - effectiveDate(b));

      for (const parent of topLevel) {
        updates.push({ id: parent.id, sortOrder: counter++, parentItemId: null });

        // 2. Sort children under this parent by their own start date
        const children = items
          .filter((c) => c.parentItemId === parent.id)
          .sort((a, b) => safeTs(a.startDate) - safeTs(b.startDate));

        for (const child of children) {
          updates.push({ id: child.id, sortOrder: counter++, parentItemId: parent.id });
        }
      }

      const response = await fetch("/api/schedule-items/batch-sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ updates, scheduleId: schedule.id }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Server error ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateScheduleItems();
      setGanttSortResetKey(k => k + 1);
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

      // Compute D0 (earliest start date) for relative-day calculation
      const startDates = scheduleItems
        .map(item => item.startDate ? new Date(item.startDate).getTime() : null)
        .filter((t): t is number => t !== null);
      const day0Ms = startDates.length > 0 ? Math.min(...startDates) : Date.now();
      const day0 = new Date(day0Ms);

      // Convert schedule items to template format.
      // - Keep the original `id` so the apply route can remap parentItemId + dependencies.
      // - Store `relativeStartDay` as a WORKING-DAY offset from D0.
      //   The server apply route uses addWorkingDaysServer(day0, relativeStartDay), so this
      //   must be a working-day count to avoid drift across weekends/holidays.
      //   Formula: countWorkingDays(day0, itemStart) - 1 gives 0-based working-day offset
      //   (countWorkingDays is inclusive: D0→D0 = 1, so minus 1 = 0).
      // - Include `parentItemId`, `dependencies`, and `color` for full fidelity.
      const templateData = scheduleItems.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        notes: item.notes,
        type: item.type,
        priority: item.priority,
        duration: item.duration || 1,
        sortOrder: item.sortOrder || 0,
        color: item.color || null,
        parentItemId: item.parentItemId || null,
        dependencies: (item.dependencies as any[]) || [],
        relativeStartDay: item.startDate
          ? Math.max(0, countWorkingDays(day0, new Date(item.startDate)) - 1)
          : 0,
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
    mutationFn: async ({ templateId, startDate }: { templateId: string; startDate: string }) => {
      if (!schedule) throw new Error("No schedule found");
      return await apiRequest(`/api/schedule-templates/${templateId}/apply`, "POST", {
        scheduleId: schedule.id,
        startDate,
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
      color: "",
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
        color: (editingItem as any).color || "",
      });
      setTaskLinkOffsetsLocal((editingItem as any).taskLinkOffsets || []);
      const sd = editingItem.startDate ? new Date(editingItem.startDate) : null;
      const ed = editingItem.endDate ? new Date(editingItem.endDate) : null;
      if (sd && ed) {
        setDurationInput(countWorkingDays(sd, ed).toString());
      } else {
        setDurationInput("");
      }
      setDescriptionExpanded(!!(editingItem.description));
      setNotesExpanded(!!(editingItem.notes));
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

  // Calendar event style getter — single source of truth for event colour priority:
  //   1. event.color  (user-assigned per-item override)
  //   2. TYPE_COLORS[event.type]  (schedule-item type colour)
  //   3. lavender fallback (TYPE_COLORS.task)
  const eventStyleGetter = (event: any) => {
    const typeColor = TYPE_COLORS[event?.type as keyof typeof TYPE_COLORS];
    const backgroundColor = event?.color || typeColor || TYPE_COLORS.task;
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

  // Day prop getter - add class to weekends for styling. Background colour is applied via the
  // .rbc-weekend-day rule in schedule-calendar.css using hsl(var(--muted)/0.5).
  const dayPropGetter = (date: Date) => {
    const day = date.getDay();
    if (day === 0 || day === 6) {
      return { className: "rbc-weekend-day" };
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
        {/* Single-row toolbar — replaces the previous two-row block. */}
        {(() => {
          const activeFilterCount =
            (filters.assignee !== 'all' ? 1 : 0) +
            (filters.status !== 'all' ? 1 : 0) +
            (filters.type !== 'all' ? 1 : 0) +
            (filters.dateRange !== 'all' ? 1 : 0) +
            (activeBaselineId ? 1 : 0);
          const hasActiveFilters = activeFilterCount > 0;
          const scaleValue = activeView === 'calendar' ? calendarView : zoomLevel;
          const scaleLabel = scaleValue.charAt(0).toUpperCase() + scaleValue.slice(1);
          const setScale = (v: 'day' | 'week' | 'month' | 'agenda') => {
            if (activeView === 'calendar') {
              setCalendarView(v);
            } else if (v !== 'agenda') {
              setZoomLevel(v);
            }
          };
          return (
            <div className="h-9 bg-background flex items-center justify-between px-2 gap-2 border-b border-border/50 flex-shrink-0">
              {/* Left side */}
              <div className="flex items-center gap-1.5 min-w-0">
                {/* Online/Offline chip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        if (toggleOnlineMutation.isPending) return;
                        if (schedule?.isOnline) {
                          setShowOfflineConfirm(true);
                        } else {
                          toggleOnlineMutation.mutate(true);
                        }
                      }}
                      disabled={toggleOnlineMutation.isPending}
                      className="h-6 inline-flex items-center gap-1 px-1.5 rounded-md border border-border/50 text-xs text-muted-foreground hover-elevate active-elevate-2"
                      data-testid="button-toggle-online"
                      aria-label={schedule?.isOnline ? 'Online' : 'Offline'}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${schedule?.isOnline ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      <span className="hidden sm:inline">{schedule?.isOnline ? 'Online' : 'Offline'}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{schedule?.isOnline ? 'Online' : 'Offline'}</TooltipContent>
                </Tooltip>

                {/* View segmented control */}
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveView('gantt')}
                        className={`h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                          activeView === 'gantt'
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'border-border/50 text-muted-foreground'
                        }`}
                        data-testid="button-view-gantt"
                        aria-label="Gantt view"
                      >
                        <GanttChart className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Gantt</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveView('calendar')}
                        className={`h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                          activeView === 'calendar'
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'border-border/50 text-muted-foreground'
                        }`}
                        data-testid="button-view-calendar"
                        aria-label="Calendar view"
                      >
                        <CalendarIcon className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Calendar</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveView('list')}
                        className={`h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                          activeView === 'list'
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'border-border/50 text-muted-foreground'
                        }`}
                        data-testid="button-view-list"
                        aria-label="List view"
                      >
                        <ListIcon className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">List</TooltipContent>
                  </Tooltip>
                </div>

                {/* Divider */}
                <div className="w-px h-4 bg-border" />

                {/* Filter popover */}
                <Popover open={showFilters} onOpenChange={setShowFilters}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          className={`relative h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                            hasActiveFilters
                              ? 'bg-primary/10 text-primary border-primary/20'
                              : 'border-border/50 text-muted-foreground'
                          }`}
                          data-testid="button-filter"
                          aria-label="Filter"
                        >
                          <Filter className="w-3 h-3" />
                          {hasActiveFilters && (
                            <span
                              className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center"
                              data-testid="badge-filter-count"
                            >
                              {activeFilterCount}
                            </span>
                          )}
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {hasActiveFilters ? `Filter (${activeFilterCount})` : 'Filter'}
                    </TooltipContent>
                  </Tooltip>
                  <PopoverContent align="start" className="w-72 p-3 space-y-3" data-testid="popover-filters">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Assignee</Label>
                      <Select value={filters.assignee} onValueChange={(value) => setFilters({ ...filters, assignee: value })}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-filter-assignee">
                          <SelectValue placeholder="All Assignees" />
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
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-filter-status">
                          <SelectValue placeholder="All Statuses" />
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
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-filter-type">
                          <SelectValue placeholder="All Types" />
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
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Date Range</Label>
                      <Select value={filters.dateRange} onValueChange={(value) => setFilters({ ...filters, dateRange: value })}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-filter-date-range">
                          <SelectValue placeholder="All Dates" />
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
                    {(baselines as any[]).length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Baseline</Label>
                        <Select
                          value={activeBaselineId || 'none'}
                          onValueChange={(v) => setActiveBaselineId(v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid="select-filter-baseline">
                            <SelectValue placeholder="No Baseline" />
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
                      </div>
                    )}
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilters({ status: 'all', assignee: 'all', type: 'all', dateRange: 'all' });
                          setActiveBaselineId(null);
                        }}
                        className="w-full text-xs text-primary hover:underline pt-1"
                        data-testid="button-clear-filters"
                      >
                        Clear filters
                      </button>
                    )}
                  </PopoverContent>
                </Popover>

                {/* Timeline scale dropdown */}
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="h-6 inline-flex items-center gap-1 px-2 rounded-md border border-border/50 text-xs text-muted-foreground hover-elevate active-elevate-2"
                          data-testid="button-timeline-scale"
                          aria-label="Timeline scale"
                        >
                          <span>{scaleLabel}</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Timeline scale</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start" className="w-32">
                    <DropdownMenuItem onClick={() => setScale('day')} data-testid="menu-scale-day">
                      Day
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScale('week')} data-testid="menu-scale-week">
                      Week
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setScale('month')} data-testid="menu-scale-month">
                      Month
                    </DropdownMenuItem>
                    {activeView === 'calendar' && (
                      <DropdownMenuItem onClick={() => setScale('agenda')} data-testid="menu-scale-agenda">
                        Agenda
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Today */}
                <button
                  onClick={() => {
                    if (activeView === 'calendar') {
                      setCalendarDate(new Date());
                    } else {
                      scrollToTodayRef.current?.();
                    }
                  }}
                  className="h-6 px-2 text-xs rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="button-scroll-to-today"
                >
                  Today
                </button>
              </div>

              {/* Right side */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {schedule?.id && (
                  <ScheduleActivityFeedPopover
                    scheduleId={schedule.id}
                    onSelectItem={(itemId) => {
                      const target = scheduleItems.find((i: any) => i.id === itemId);
                      if (target) {
                        setEditingItem(target);
                        setShowItemDialog(true);
                      }
                    }}
                  />
                )}

                <div className="w-px h-4 bg-border" />

                {/* Edit / Save / Discard */}
                {schedule?.status === 'locked' ? (
                  <button
                    onClick={() => editBeginMutation.mutate()}
                    disabled={editBeginMutation.isPending}
                    className="h-6 inline-flex items-center gap-1 px-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium hover-elevate active-elevate-2 disabled:opacity-60 disabled:pointer-events-none"
                    data-testid="button-edit-schedule"
                  >
                    <Unlock className="w-3 h-3" />
                    Edit
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => editCommitMutation.mutate()}
                      disabled={editCommitMutation.isPending || editDiscardMutation.isPending}
                      className="h-6 inline-flex items-center gap-1 px-2 rounded-md bg-green-100 dark:bg-green-900/30 text-status-success dark:text-green-400 text-xs font-medium hover-elevate active-elevate-2 disabled:opacity-60 disabled:pointer-events-none"
                      data-testid="button-save-schedule"
                    >
                      <Lock className="w-3 h-3" />
                      Save
                    </button>
                    <button
                      onClick={() => setShowDiscardConfirm(true)}
                      disabled={editCommitMutation.isPending || editDiscardMutation.isPending}
                      className="h-6 inline-flex items-center gap-1 px-2 rounded-md bg-red-100 dark:bg-red-900/30 text-destructive dark:text-red-400 text-xs font-medium hover-elevate active-elevate-2 disabled:opacity-60 disabled:pointer-events-none"
                      data-testid="button-discard-schedule"
                    >
                      <X className="w-3 h-3" />
                      Discard
                    </button>
                  </div>
                )}

                {/* Add Item primary */}
                <button
                  className="h-6 inline-flex items-center gap-0.5 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 disabled:opacity-60 disabled:pointer-events-none"
                  onClick={() => { setEditingItem(null); resetForm(); setShowItemDialog(true); }}
                  disabled={schedule?.status === 'locked'}
                  data-testid="button-add-item"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Item</span>
                </button>

                {/* Options */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                      data-testid="button-more-actions"
                      aria-label="Schedule options"
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowLoadTemplateDialog(true)} disabled={schedule?.status === 'locked'}>
                      <Upload className="w-4 h-4 mr-2" />
                      Load Template
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowSaveTemplateDialog(true)} disabled={schedule?.status === 'locked' || scheduleItems.length === 0}>
                      <Download className="w-4 h-4 mr-2" />
                      Save as Template
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowImportDialog(true)} disabled={schedule?.status === 'locked'}>
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
                      disabled={sortByDateMutation.isPending}
                    >
                      <ArrowUpDown className="w-4 h-4 mr-2" />
                      {sortByDateMutation.isPending ? 'Sorting...' : 'Sort by Date'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem data-testid="button-settings" onClick={() => setShowWorkingDaysDialog(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      Schedule Settings
                    </DropdownMenuItem>
                    {!hasPreconstruction && scheduleCategory === 'construction' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => createPreconstructionMutation.mutate()}
                          disabled={createPreconstructionMutation.isPending}
                        >
                          <HardHat className="w-4 h-4 mr-2" />
                          {createPreconstructionMutation.isPending ? 'Creating...' : 'Open Preconstruction Schedule'}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })()}

        {/* Content - conditional rendering based on activeView */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
              // TODO(data-table): convert list view to shared <DataTable>.
              // The shared DataTable now supports nested rows via the
              // `getSubRows` API (the foundational primitive for this
              // migration). The remaining blocker is the bespoke UX layered
              // on top of <CasvaScheduleList> — hold-to-nest + drag-to-reorder
              // gestures, ripple feedback, ghost drag elements, and inline
              // editing of every cell — none of which the shared DataTable
              // implements today. Migrating without those would silently
              // regress the schedule UX, so this is left on the legacy path
              // until either DataTable grows the missing capabilities or the
              // schedule editing UX is redesigned. Storage scope reserved:
              // "schedule" (legacyConfigKey: "schedule-column-config-v1").
              <div className="flex-1 min-h-0 overflow-auto p-4">
                {filteredItems.length === 0 ? (
                  <Card className="p-12 text-center">
                    <CardTitle className="mb-2">No Matching Items</CardTitle>
                    <p className="text-muted-foreground mb-4">
                      No items match the current filters.
                    </p>
                  </Card>
                ) : (
                  <>
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
                            body: JSON.stringify({ updates, scheduleId: schedule?.id }),
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
                sortResetKey={ganttSortResetKey}
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
      </div>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will undo every change you've made since you started editing and lock the schedule. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { editDiscardMutation.mutate(); setShowDiscardConfirm(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive"
              data-testid="button-confirm-discard"
            >
              Discard Changes
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
            {/* Name + Colour dot */}
            <div className="space-y-2">
              <Label htmlFor="item-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                {/* Colour dot picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-5 h-5 rounded-full border-2 border-border focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-transform hover:scale-110 active:scale-95 flex-shrink-0"
                      style={{ backgroundColor: formData.color || '#A890D4' }}
                      data-testid="button-color-dot"
                      title="Choose colour"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-3" align="start" data-testid="popover-color-picker">
                    <div className="space-y-3">
                      <div className="grid grid-cols-6 gap-1.5">
                        {[
                          '#A890D4','#6B5B95','#B5838D','#E07A5F','#F2CC8F','#81B29A',
                          '#457B9D','#4ECDC4','#FF6B6B','#95D5B2','#3D405B','#A0C4FF',
                        ].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                            style={{
                              backgroundColor: preset,
                              borderColor: (formData.color || '#A890D4').toLowerCase() === preset.toLowerCase() ? 'hsl(var(--primary))' : 'transparent',
                            }}
                            onClick={() => setFormData({ ...formData, color: preset })}
                            title={preset}
                            data-testid={`color-swatch-${preset.replace('#','')}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: formData.color || '#A890D4' }} />
                        <Input
                          className="h-7 text-xs font-mono px-2"
                          value={formData.color || '#A890D4'}
                          maxLength={7}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                              setFormData({ ...formData, color: v });
                            }
                          }}
                          data-testid="input-item-color"
                          placeholder="#A890D4"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <Input
                  id="item-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Foundation Inspection"
                  data-testid="input-item-name"
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
                    const newStart = e.target.value;
                    const dur = parseInt(durationInput, 10);
                    if (newStart && formData.endDate) {
                      if (editingItem?.id && formData.startDate) {
                        // Editing an existing item: preserve working-day duration and
                        // shift end date by the same working-day span from the new start
                        // so that endOffset stays non-zero and FS successors cascade
                        const workingDays = countWorkingDays(new Date(formData.startDate), new Date(formData.endDate));
                        const newEnd = addWorkingDays(new Date(newStart), workingDays - 1);
                        const newEndStr = newEnd.toISOString().split('T')[0];
                        setFormData({ ...formData, startDate: newStart, endDate: newEndStr });
                        setDurationInput(workingDays.toString());
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
                      const wd = countWorkingDays(new Date(formData.startDate), new Date(newEnd));
                      if (wd < 1) {
                        // End date is before start date — clamp: keep start, set end = start (1 working day)
                        setFormData({ ...formData, endDate: formData.startDate });
                        setDurationInput('1');
                      } else {
                        setFormData({ ...formData, endDate: newEnd });
                        setDurationInput(wd.toString());
                      }
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

            {/* Parent Item */}
            {!(editingItem && !editingItem.parentItemId && scheduleItems.some(i => i.parentItemId === editingItem.id)) && (
              <div className="space-y-1">
                <Label htmlFor="item-parent" className="text-xs text-muted-foreground">Parent Item</Label>
                <Select
                  value={formData.parentItemId || "none"}
                  onValueChange={(value) => setFormData({ ...formData, parentItemId: value === "none" ? "" : value })}
                >
                  <SelectTrigger id="item-parent" data-testid="select-parent-item">
                    <SelectValue placeholder="No parent (top level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent (top level)</SelectItem>
                    {parentItems.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((option: any) => (
                            <SelectItem key={option.id} value={option.value}>
                              <div className="flex items-center gap-2">
                                {option.color && (
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: option.color }} />
                                )}
                                {option.label}
                              </div>
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
                </div>

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

            <div className="pt-3 border-t">
                  <div className="space-y-4">
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
      <Dialog
        open={showLoadTemplateDialog}
        onOpenChange={(open) => {
          setShowLoadTemplateDialog(open);
          if (open) {
            const projectStart = (currentProject as any)?.startDate;
            setLoadTemplateStartDate(
              projectStart
                ? format(new Date(projectStart), "yyyy-MM-dd")
                : format(new Date(), "yyyy-MM-dd")
            );
          }
        }}
      >
        <DialogContent className="max-w-2xl" data-testid="dialog-load-template">
          <DialogHeader>
            <DialogTitle>Load Schedule Template</DialogTitle>
            <DialogDescription>
              Choose a start date and a template to apply to your current schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Schedule Start Date</label>
              <Input
                type="date"
                value={loadTemplateStartDate}
                onChange={(e) => setLoadTemplateStartDate(e.target.value)}
                data-testid="input-load-template-start-date"
              />
              <p className="text-xs text-muted-foreground">Day 0 of the template maps to this date.</p>
            </div>
            {scheduleTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No templates available.</p>
                <p className="text-sm mt-2">Save your first template using "Save as Template".</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {scheduleTemplates.map((template: any) => (
                  <Card
                    key={template.id}
                    className={`p-4 hover-elevate ${loadTemplateMutation.isPending ? "opacity-50 pointer-events-none cursor-not-allowed" : "cursor-pointer"}`}
                    onClick={() => {
                      if (!loadTemplateMutation.isPending)
                        loadTemplateMutation.mutate({ templateId: template.id, startDate: loadTemplateStartDate });
                    }}
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
            <DialogTitle>You're still editing this schedule</DialogTitle>
            <DialogDescription>
              You're in the middle of editing. Would you like to save your changes or discard them before leaving?
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
              variant="destructive"
              onClick={() => {
                setShowLeaveGuardDialog(false);
                const target = pendingNavigationRef.current;
                pendingNavigationRef.current = null;
                if (target) {
                  finishEditAndNavigate(target, "discard");
                }
              }}
              data-testid="button-discard-leave"
            >
              Discard & Leave
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowLeaveGuardDialog(false);
                const target = pendingNavigationRef.current;
                pendingNavigationRef.current = null;
                if (target) {
                  finishEditAndNavigate(target, "commit");
                }
              }}
              data-testid="button-save-leave"
            >
              Save & Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Floating bulk action bar — list view only */}
      {selectedItems.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-card border border-border rounded-lg shadow-lg px-3 py-2" data-testid="bulk-action-bar">
          <span className="text-xs font-medium text-muted-foreground mr-1" data-testid="bulk-count">
            {selectedItems.size} selected
          </span>
          <div className="w-px h-4 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={bulkStatusMutation.isPending}
                data-testid="button-bulk-status"
              >
                <ChevronUp className="w-3 h-3 mr-1" />
                Set status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center" className="min-w-[160px]">
              {statusOptions.map((opt: any) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => bulkStatusMutation.mutate({ itemIds: Array.from(selectedItems), status: opt.value })}
                >
                  <div className="w-2 h-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: opt.color || '#6B7280' }} />
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              const allCompleted = Array.from(selectedItems).every(id =>
                scheduleItems.find((i: ScheduleItem) => i.id === id)?.status === 'completed'
              );
              bulkStatusMutation.mutate({
                itemIds: Array.from(selectedItems),
                status: allCompleted ? 'not_started' : 'completed',
              });
            }}
            disabled={bulkStatusMutation.isPending}
            data-testid="button-bulk-toggle-complete"
          >
            <Check className="w-3 h-3 mr-1" />
            {Array.from(selectedItems).every(id =>
              scheduleItems.find((i: ScheduleItem) => i.id === id)?.status === 'completed'
            ) ? 'Mark incomplete' : 'Mark complete'}
          </Button>
          <div className="w-px h-4 bg-border" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive"
            onClick={() => {
              if (!projectId) {
                toast({ title: "Error", description: "No project selected", variant: "destructive" });
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
          <div className="w-px h-4 bg-border" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setSelectedItems(new Set())}
            data-testid="button-clear-selection"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
    </ScheduleViewProvider>
  );
}
