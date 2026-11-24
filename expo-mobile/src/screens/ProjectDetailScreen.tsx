import { Fragment, useState, useEffect, useCallback, useRef, useLayoutEffect, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Alert, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  BookOpen, Calendar, Camera, ChevronLeft, ClipboardList, Clock, FileText, Hammer, Layers, ListChecks, MapPin, Package,
  Palette, Receipt, SquareCheck, SquarePen, Circle, Ellipsis, Users, Info, type LucideIcon,
} from 'lucide-react-native';
import { apiFetch, apiRequest } from '../services/api';
import { formatShortCents } from '../lib/format';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, type RouteProp } from '@react-navigation/native';

import { metrics, size, space, tabular, type, useColors } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../lib/usePermission';
import { useSetSiteLocation } from '../components/SetSiteLocationButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReturnToTwoPane } from '../lib/twoPane';
import { useLayout } from '../lib/useLayout';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useTwoPaneDetail } from '../components/ui/TwoPane';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { haptic } from '../lib/haptics';
import { SkeletonList } from '../components/ui/Skeleton';
import {
  CaptureChip, Card, Checkbox, Divider, EmptyState, FAB, FAB_CLEARANCE, ListRow, ProgressLine, ProjectSquare,
  PropertyRow, SectionCardHeader, SectionTile, StatusDot, fallbackProjectColor,
} from '../components/kit';
import { scheduleDot } from '../lib/scheduleStatus';

interface ProjectNote {
  id: string;
  title?: string | null;
  pinned?: boolean;
  updatedAt?: string;
  archivedAt?: string | null;
}

interface Project {
  id: string;
  name: string;
  jobNumber?: string;
  clientId?: string;
  currentSystemPhase?: string;
  projectSubStatus?: string;
  location?: string;
  color?: string | null;
  startDate?: string;
  endDate?: string;
  proposedStartDate?: string;
  proposedEndDate?: string;
  // Financial fields — server stores ALL values in cents.
  contractPrice?: number;
  contractCost?: number;
  clientBudget?: number;
  budget?: number;
  description?: string;
}

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
}

interface Task {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

interface ScheduleItem {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  parentItemId?: string;
  progressPercent?: number | null;
}

interface ChecklistInstance {
  id: string;
  name: string;
  status: 'active' | 'in_progress' | 'completed' | 'cancelled';
  completedCount: number;
  totalCount: number;
  createdAt?: string;
}

interface ChecklistItem {
  id: string;
  instanceId: string;
  groupId?: string;
  groupName?: string;
  description: string;
  order: number;
  isRequired: boolean;
  status: 'pending' | 'completed' | 'na';
}

interface SiteDiaryEntry {
  id: string;
  title?: string;
  entryDateTime?: string;
  weather?: { condition?: string; temp?: number } | null;
  notes?: string;
  createdByName?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
  /**
   * Rendered in the right panel of the Projects list on a big screen (iPhone
   * Duo unfolded). There is no stack header there, so we pad for the status
   * bar ourselves, and never pop back to the list on unfold.
   */
  embedded?: boolean;
};

const PHASE_LABELS: Record<string, string> = {
  lead: 'Lead',
  pre_construction: 'Pre-construction',
  construction: 'Construction',
  post_construction: 'Post-construction',
  completed: 'Completed',
};

const sentence = (key?: string) => {
  if (!key) return '';
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const isDone = (s?: string) => s === 'completed' || s === 'done';

const shortDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
const longDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const dayDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

export default function ProjectDetailScreen({ navigation, route, embedded }: Props) {
  const { projectId, progress: listProgress } = route.params as { projectId: string; progress?: number | null };
  const insets = useSafeAreaInsets();
  // Folded with this project open on the right: a back button floats top-left.
  const { heldOnFold } = useTwoPaneDetail();
  const { isWide } = useLayout();
  const embeddedTop = insets.top + (heldOnFold ? 50 : 12);
  // Unfolding on this screen (pushed from the list) goes back to the list with
  // this project open on the right, so you keep your place.
  useReturnToTwoPane({ navigation, listRoute: 'ProjectsList', id: projectId, embedded });
  const { user } = useAuth();
  const canViewFinancials = (() => {
    const r = (user?.roleName ?? '').toLowerCase();
    return r.includes('admin') || r.includes('owner') || r.includes('general manager');
  })();
  const [project, setProject] = useState<Project | null>(null);
  const [clientContact, setClientContact] = useState<Contact | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    projectInfo: false,
    tasks: false,
    schedule: false,
    siteDiary: false,
    checklists: true,
  });
  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstance[]>([]);
  const [expandedChecklist, setExpandedChecklist] = useState<string | null>(null);
  const [checklistItems, setChecklistItems] = useState<Record<string, ChecklistItem[]>>({});
  const [loadingChecklistItems, setLoadingChecklistItems] = useState<Record<string, boolean>>({});
  const [collapsedChecklistGroups, setCollapsedChecklistGroups] = useState<Record<string, boolean>>({});
  const [siteDiaryEntries, setSiteDiaryEntries] = useState<SiteDiaryEntry[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const c = useColors();
  const captureSheetRef = useRef<SheetRef>(null);
  const moreSheetRef = useRef<SheetRef>(null);
  const siteLocation = useSetSiteLocation(projectId);

  // Gates the Labour Hours tile. The endpoint behind it enforces the same
  // permission; this only stops the UI offering it.
  const canViewLabourHours = usePermission('financial.budget_labour');
  const canViewSelections = usePermission('projects.selections');
  const canViewDefects = usePermission('projects.defects');
  const canViewDeliveries = usePermission('projects.deliveries');
  const canAddDiary = usePermission('projects.site_diary', 'add');
  const canAddDefect = usePermission('projects.defects', 'add');

  // The one-row nav bar replaces the stack header (design: "‹ Projects ••• ").
  useLayoutEffect(() => {
    if (!embedded) navigation.setOptions({ headerShown: false });
  }, [navigation, embedded]);


  // Notes card: pinned first, then most recently edited. Refetched on focus so a
  // note written from here shows when you come back.
  const loadNotes = useCallback(async () => {
    const list = await apiFetch<ProjectNote[]>(`/api/notes?projectId=${projectId}`).catch(() => null);
    if (!list) return;
    setNotes(
      list
        .filter(n => !n.archivedAt)
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    );
  }, [projectId]);
  const notesFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!notesFocusedOnce.current) {
        notesFocusedOnce.current = true;
        return;
      }
      loadNotes();
    }, [loadNotes]),
  );

  const fetchData = useCallback(async () => {
    try {
      const [projectData, tasksData, scheduleData, collapsedPrefs, checklistData, diaryData] = await Promise.all([
        apiFetch<Project>(`/api/projects/${projectId}`),
        apiFetch<Task[]>(`/api/tasks?projectId=${projectId}`).catch(() => []),
        apiFetch<ScheduleItem[]>(`/api/projects/${projectId}/schedule-items`).catch(() => []),
        apiFetch<any>('/api/user-view-preferences/mobile-project-detail-collapsed').catch(() => null),
        apiFetch<ChecklistInstance[]>(`/api/checklist-instances?projectId=${projectId}`).catch(() => []),
        apiFetch<SiteDiaryEntry[]>(`/api/projects/${projectId}/site-diary-entries`).catch(() => []),
        loadNotes(),
      ]);
      setProject(projectData);
      setTasks((tasksData || []).filter((t: Task) => (t as any).type === 'task'));
      setScheduleItems(scheduleData || []);
      // Oldest first, so the checklists sit in the order they were added —
      // the API returns them newest first. Matches the web checklists page,
      // the dashboard widget and the mobile Checklists screen.
      setChecklistInstances([...(checklistData || [])].sort((a: ChecklistInstance, b: ChecklistInstance) =>
        (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0)));
      setSiteDiaryEntries((diaryData || []).slice(0, 8));
      if (collapsedPrefs?.preferences) {
        setCollapsed(prev => ({ ...prev, ...collapsedPrefs.preferences }));
      }
      // Fetch client contact if project has a clientId
      if (projectData?.clientId) {
        apiFetch<Contact>(`/api/contacts/${projectData.clientId}`)
          .then(ct => setClientContact(ct))
          .catch(() => setClientContact(null));
      } else {
        setClientContact(null);
      }
    } catch (e) {
      console.error('Failed to fetch project:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, loadNotes]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setChecklistItems({});
    setLoadingChecklistItems({});
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const toggleSection = (key: string) => {
    haptic.select();
    setCollapsed(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      apiRequest('/api/user-view-preferences/mobile-project-detail-collapsed', 'PUT', { preferences: updated }).catch(() => {});
      return updated;
    });
  };

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const dateOnlyStr = (dateStr?: string) => {
    if (!dateStr) return '';
    return dateStr.slice(0, 10);
  };

  const todayStr = getTodayStr();
  const tomorrowStr = getTomorrowStr();

  const openTasks = tasks.filter(t => !isDone(t.status));
  const todayTasks = openTasks.filter(t => dateOnlyStr(t.dueDate) === todayStr);
  // Next few open tasks with a due date after today, soonest first.
  const upcomingTasks = openTasks
    .filter(t => dateOnlyStr(t.dueDate) > todayStr)
    .sort((a, b) => dateOnlyStr(a.dueDate).localeCompare(dateOnlyStr(b.dueDate)));

  const nearScheduleItems = scheduleItems.filter(item => {
    const start = dateOnlyStr(item.startDate);
    const end = dateOnlyStr(item.endDate) || start;
    return (start <= tomorrowStr && end >= todayStr);
  });
  const todayItems = nearScheduleItems.filter(item => {
    const start = dateOnlyStr(item.startDate);
    const end = dateOnlyStr(item.endDate) || start;
    return start <= todayStr && end >= todayStr;
  });
  const tomorrowOnlyItems = nearScheduleItems.filter(item => {
    const start = dateOnlyStr(item.startDate);
    const end = dateOnlyStr(item.endDate) || start;
    return (start <= tomorrowStr && end >= tomorrowStr) && !(start <= todayStr && end >= todayStr);
  });

  const go = (screen: string, extra?: Record<string, unknown>) => {
    if (!project) return;
    navigation.navigate(screen, { projectId, projectName: project.name, projectColor: project.color ?? null, ...extra });
  };

  const tiles = [
    { key: 'tasks', icon: SquareCheck, label: 'Tasks', count: openTasks.length, onPress: () => go('ProjectTasks') },
    { key: 'schedule', icon: Calendar, label: 'Schedule', count: nearScheduleItems.length, onPress: () => go('Schedule') },
    { key: 'notes', icon: FileText, label: 'Notes', onPress: () => go('Notes') },
    // Only offered to roles that can view selections at all; what they then see
    // (approved-only, costs or not) is decided server-side.
    ...(canViewSelections ? [{ key: 'selections', icon: Palette, label: 'Selections', onPress: () => go('Selections') }] : []),
    { key: 'scope', icon: Layers, label: 'Scope', onPress: () => go('Scope') },
    { key: 'siteDiary', icon: BookOpen, label: 'Diary', onPress: () => go('SiteDiary') },
    { key: 'checklists', icon: ClipboardList, label: 'Checklists', count: checklistInstances.length, onPress: () => go('Checklists') },
    ...(canViewDefects ? [{ key: 'defects', icon: Hammer, label: 'Defects', onPress: () => go('DefectsList') }] : []),
    ...(canViewDeliveries ? [{ key: 'deliveries', icon: Package, label: 'Deliveries', onPress: () => go('DeliveriesList') }] : []),
    { key: 'receiptCapture', icon: Receipt, label: 'Receipt', onPress: () => go('ReceiptCapture') },
    // Only offered to users who can view the labour budget.
    ...(canViewLabourHours ? [{ key: 'labourHours', icon: Clock, label: 'Labour hours', onPress: () => go('LabourHours') }] : []),
  ] as { key: string; icon: typeof Calendar; label: string; count?: number; onPress: () => void }[];

  // ── FAB capture sheet: Photo / Diary / Defect / Receipt ──────────────────
  const runCapture = (action: 'photo' | 'diary' | 'defect' | 'receipt') => {
    haptic.light();
    captureSheetRef.current?.dismiss();
    setTimeout(async () => {
      if (action === 'diary') return go('SiteDiary');
      if (action === 'defect') return go('DefectCapture');
      if (action === 'receipt') return go('ReceiptCapture');
      // Photo to diary: camera first, then the diary opens a new entry with it.
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera access is needed to take photos.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (result.canceled || !result.assets[0]) return;
        go('SiteDiary', { captureUri: result.assets[0].uri });
      } catch (e) {
        console.warn('Project capture camera failed:', e);
        Alert.alert('Camera Unavailable', 'Could not open the camera.');
      }
    }, 300);
  };

  // ── Checklists (unchanged behaviour, restyled) ───────────────────────────
  const fetchChecklistItems = async (instanceId: string) => {
    if (checklistItems[instanceId]) return;
    setLoadingChecklistItems(prev => ({ ...prev, [instanceId]: true }));
    try {
      const items = await apiFetch<ChecklistItem[]>(`/api/checklist-instances/${instanceId}/items`);
      setChecklistItems(prev => ({ ...prev, [instanceId]: items || [] }));
    } catch {
      setChecklistItems(prev => ({ ...prev, [instanceId]: [] }));
    } finally {
      setLoadingChecklistItems(prev => ({ ...prev, [instanceId]: false }));
    }
  };

  const toggleChecklistExpand = (instanceId: string) => {
    if (expandedChecklist === instanceId) {
      setExpandedChecklist(null);
    } else {
      setExpandedChecklist(instanceId);
      fetchChecklistItems(instanceId);
    }
  };

  const toggleChecklistItem = (item: ChecklistItem) => {
    if (item.status === 'na') return;
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    if (newStatus === 'completed') haptic.success(); else haptic.select();
    setChecklistItems(prev => ({
      ...prev,
      [item.instanceId]: (prev[item.instanceId] || []).map(i => i.id === item.id ? { ...i, status: newStatus } : i),
    }));
    const delta = newStatus === 'completed' ? 1 : -1;
    setChecklistInstances(prev => prev.map(inst => inst.id === item.instanceId ? { ...inst, completedCount: Math.max(0, inst.completedCount + delta) } : inst));
    apiRequest(`/api/checklist-instance-items/${item.id}`, 'PATCH', { status: newStatus }).catch((err: any) => {
      setChecklistItems(prev => ({
        ...prev,
        [item.instanceId]: (prev[item.instanceId] || []).map(i => i.id === item.id ? { ...i, status: item.status } : i),
      }));
      setChecklistInstances(prev => prev.map(inst => inst.id === item.instanceId ? { ...inst, completedCount: Math.max(0, inst.completedCount - delta) } : inst));
      Alert.alert('Error', err?.message || 'Failed to update checklist item.');
    });
  };

  const toggleChecklistGroup = (groupKey: string) => {
    setCollapsedChecklistGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const groupChecklistItems = (items: ChecklistItem[]) => {
    const groups: Record<string, ChecklistItem[]> = {};
    const ungrouped: ChecklistItem[] = [];
    for (const item of items) {
      if (item.groupName) {
        if (!groups[item.groupName]) groups[item.groupName] = [];
        groups[item.groupName].push(item);
      } else {
        ungrouped.push(item);
      }
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.order - b.order);
    }
    ungrouped.sort((a, b) => a.order - b.order);
    return { groups, ungrouped };
  };

  const pd = metrics.projectDetail;

  // ── Nav bar ──────────────────────────────────────────────────────────────
  const navBar = embedded ? null : (
    <View style={[styles.nav, { paddingTop: insets.top + pd.navPad.top }]}>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={metrics.hitSlop}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.navBack}
      >
        <ChevronLeft size={metrics.pageHeader.back} color={c.link} strokeWidth={metrics.iconStroke} />
        <Text style={[type.rowTitle, { color: c.link }]}>Projects</Text>
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => moreSheetRef.current?.present()}
        hitSlop={metrics.hitSlop}
        accessibilityRole="button"
        accessibilityLabel="More actions"
      >
        <Ellipsis size={metrics.pageHeader.back} color={c.icon} strokeWidth={metrics.iconStroke} />
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }, embedded && { paddingTop: insets.top }]}>
        {navBar}
        <SkeletonList />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }, embedded && { paddingTop: insets.top }]}>
        {navBar}
        <EmptyState icon={Layers} title="Project not found" helper="It may have been archived or you no longer have access." />
      </View>
    );
  }

  const price = canViewFinancials
    ? formatShortCents(project.contractPrice ?? project.contractCost ?? project.clientBudget ?? project.budget)
    : null;
  const stage = [PHASE_LABELS[project.currentSystemPhase ?? ''] ?? sentence(project.currentSystemPhase), sentence(project.projectSubStatus)]
    .filter(Boolean)
    .join(' · ');
  const metaLine = [clientContact?.name, stage].filter(Boolean).join(' · ');
  // Progress rides in from the Projects list; arriving any other way, work it
  // out the server's way (mean of top-level schedule items' progress).
  const topItems = scheduleItems.filter(i => !i.parentItemId);
  const progress =
    typeof listProgress === 'number'
      ? listProgress
      : topItems.length > 0
        ? Math.round(topItems.reduce((sum, i) => sum + (i.progressPercent || 0), 0) / topItems.length)
        : null;
  const projectColor = project.color || fallbackProjectColor(project.id);
  /** "16 Nov", or "16 – 18 Nov" style range; one date when start = end. */
  const itemDates = (item: ScheduleItem) => {
    const a = shortDate(item.startDate);
    const b = item.endDate ? shortDate(item.endDate) : '';
    return !b || b === a ? a : `${a} – ${b}`;
  };
  const start = project.startDate ?? project.proposedStartDate;
  const finish = project.proposedEndDate ?? project.endDate;
  const phone = clientContact?.phone || clientContact?.mobile;

  /** A section card: header (+ caret when collapsible) and its rows. The card draws the dividers. */
  const sectionCard = (
    opts: { id?: string; title: string; icon?: LucideIcon; count?: number | string | null; onOpen?: () => void },
    rows?: ReactNode,
  ) => {
    const open = opts.id ? !collapsed[opts.id] : false;
    return (
      <Card variant="list" style={open ? styles.sectionCard : undefined}>
        <SectionCardHeader
          prominent
          icon={opts.icon}
          title={opts.title}
          count={opts.count === 0 ? undefined : opts.count}
          open={open}
          divider={false}
          onToggle={opts.id ? () => toggleSection(opts.id!) : undefined}
          onOpen={opts.onOpen}
        />
        {open ? rows : null}
      </Card>
    );
  };

  /** Rows inside an expanded checklist: a rule between each, like the card rows. */
  const withDividers = (rows: ReactNode[]) =>
    rows.map((row, i) => (
      <Fragment key={i}>
        {i > 0 ? <Divider /> : null}
        {row}
      </Fragment>
    ));

  const subLabel = (text: string) => (
    <Text key={`sub:${text}`} style={[type.caption, styles.subLabel, { color: c.muted }]}>
      {text}
    </Text>
  );

  const renderChecklistItem = (item: ChecklistItem) => (
    <ListRow
      key={item.id}
      lead={
        <Checkbox
          checked={item.status === 'completed'}
          disabled={item.status === 'na'}
          onPress={() => toggleChecklistItem(item)}
          accessibilityLabel={item.description}
        />
      }
      title={item.description}
      done={item.status === 'completed' || item.status === 'na'}
      strike={item.status === 'completed'}
      trailing={item.isRequired ? <Text style={[type.caption, { color: c.danger }]}>Required</Text> : item.status === 'na' ? 'N/A' : undefined}
    />
  );

  // Section cards: one column on a phone, two on the Duo (D02).
  const sec_overview = (
    <>
        {/* Overview */}
        {sectionCard({ id: 'projectInfo', title: 'Overview', icon: Info }, [
          stage ? <PropertyRow key="stage" label="Stage" value={stage} /> : null,
          start ? <PropertyRow key="start" label="Start" value={longDate(start)} /> : null,
          finish ? <PropertyRow key="finish" label="Est. completion" value={longDate(finish)} /> : null,
          clientContact?.name ? (
            <PropertyRow
              key="client"
              label="Client"
              value={clientContact.name}
              onPress={() => navigation.navigate('ClientDetail', { contactId: clientContact.id, contactName: clientContact.name })}
            />
          ) : null,
          phone ? <PropertyRow key="phone" label="Phone" value={phone} /> : null,
          clientContact?.email ? <PropertyRow key="email" label="Email" value={clientContact.email} link /> : null,
          project.location ? <PropertyRow key="address" label="Address" value={project.location} /> : null,
          project.jobNumber ? <PropertyRow key="job" label="Job number" value={project.jobNumber} /> : null,
          !stage && !start && !finish && !clientContact?.name && !project.location && !project.jobNumber ? (
            <PropertyRow key="none" label="Details" placeholder="Nothing on file yet" />
          ) : null,
        ])}
    </>
  );
  const sec_tasks = (
    <>
        {/* Tasks */}
        {sectionCard({ id: 'tasks', title: 'Tasks', icon: SquareCheck, count: openTasks.length, onOpen: () => go('ProjectTasks') }, [
          todayTasks.length === 0 ? (
            <Text key="none" style={[type.body, styles.quietRow, { color: c.muted }]}>Nothing due today</Text>
          ) : null,
          ...[...todayTasks, ...upcomingTasks].slice(0, pd.maxTaskRows).map(task => (
            <ListRow
              key={task.id}
              onPress={() => go('ProjectTasks')}
              lead={<Circle size={size.checkbox} color={c.faint} strokeWidth={metrics.iconStroke} />}
              title={task.title}
              trailing={dateOnlyStr(task.dueDate) === todayStr ? 'Today' : dayDate(task.dueDate)}
            />
          )),
        ])}
    </>
  );
  const sec_schedule = (
    <>
        {/* Schedule: today & tomorrow */}
        {sectionCard({ id: 'schedule', title: 'Schedule', icon: Calendar, count: nearScheduleItems.length, onOpen: () => go('Schedule') }, [
          nearScheduleItems.length === 0 ? (
            <Text key="none" style={[type.body, styles.quietRow, { color: c.muted }]}>Nothing scheduled today or tomorrow</Text>
          ) : null,
          todayItems.length > 0 ? subLabel('Today') : null,
          ...todayItems.map(item => (
            <ListRow
              key={item.id}
              onPress={() => go('Schedule')}
              title={item.name}
              subtitle={itemDates(item)}
              trailing={item.status ? <StatusDot status={scheduleDot(item.status)} label={sentence(item.status)} /> : undefined}
            />
          )),
          tomorrowOnlyItems.length > 0 ? subLabel('Tomorrow') : null,
          ...tomorrowOnlyItems.map(item => (
            <ListRow
              key={item.id}
              onPress={() => go('Schedule')}
              title={item.name}
              subtitle={itemDates(item)}
              trailing={item.status ? <StatusDot status={scheduleDot(item.status)} label={sentence(item.status)} /> : undefined}
            />
          )),
        ])}
    </>
  );
  const sec_diary = (
    <>
        {/* Site diary */}
        {sectionCard(
          { id: 'siteDiary', title: 'Site diary', icon: BookOpen, count: siteDiaryEntries.length >= 8 ? '8+' : siteDiaryEntries.length, onOpen: () => go('SiteDiary') },
          siteDiaryEntries.length === 0 ? (
            <Text style={[type.body, styles.quietRow, { color: c.muted }]}>No diary entries yet</Text>
          ) : (
            siteDiaryEntries.slice(0, pd.maxDiaryRows).map(entry => (
              <ListRow
                key={entry.id}
                onPress={() => go('SiteDiary')}
                title={entry.title || (entry.entryDateTime ? `Diary · ${dayDate(entry.entryDateTime)}` : 'Diary entry')}
                titleLines={1}
                trailing={dayDate(entry.entryDateTime)}
              />
            ))
          ),
        )}
    </>
  );
  const sec_notes = (
    <>
        {/* Notes: latest few, › for the full list, and a quick way to add one. */}
        {sectionCard(
          { id: 'notes', title: 'Notes', icon: FileText, count: notes.length, onOpen: () => go('Notes') },
          [
            ...notes.slice(0, pd.maxNoteRows).map(note => (
              <ListRow
                key={note.id}
                onPress={() => go('NoteEditor', { noteId: note.id, scope: 'project' })}
                title={note.title || 'Untitled'}
                titleLines={1}
                trailing={note.updatedAt ? dayDate(note.updatedAt) : undefined}
              />
            )),
            <ListRow
              key="new"
              onPress={() => go('NoteEditor', { scope: 'project' })}
              lead={<SquarePen size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStroke} />}
              title="New note"
            />,
          ],
        )}
    </>
  );
  const sec_checklists = (
    <>
        {/* Checklists (expand a checklist to tick items here) */}
        {sectionCard(
          { id: 'checklists', title: 'Checklists', icon: ClipboardList, count: checklistInstances.length, onOpen: () => go('Checklists') },
          checklistInstances.length === 0 ? (
            <Text style={[type.body, styles.quietRow, { color: c.muted }]}>No checklists</Text>
          ) : (
            checklistInstances.map(inst => {
              const isExpanded = expandedChecklist === inst.id;
              const progress = inst.totalCount > 0 ? inst.completedCount / inst.totalCount : 0;
              const items = checklistItems[inst.id] || [];
              const { groups, ungrouped } = groupChecklistItems(items);
              return (
                <View key={inst.id}>
                  <Pressable
                    onPress={() => toggleChecklistExpand(inst.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                    style={styles.checklistHead}
                  >
                    <Text style={[type.rowTitle, { color: c.text }]} numberOfLines={2}>{inst.name}</Text>
                    <ProgressLine value={progress} inlineLabel={`${inst.completedCount} of ${inst.totalCount}`} />
                  </Pressable>
                  {isExpanded ? (
                    loadingChecklistItems[inst.id] ? (
                      <ActivityIndicator style={styles.checklistLoading} size="small" color={c.accent} />
                    ) : items.length === 0 ? (
                      <Text style={[type.body, styles.quietRow, { color: c.muted }]}>No items</Text>
                    ) : (
                      <View>
                        {withDividers(ungrouped.map(renderChecklistItem))}
                        {Object.entries(groups).map(([groupName, grpItems]) => {
                          const gk = `${inst.id}:${groupName}`;
                          const gCollapsed = collapsedChecklistGroups[gk];
                          const doneInGroup = grpItems.filter(i => i.status === 'completed' || i.status === 'na').length;
                          return (
                            <View key={groupName}>
                              <Pressable onPress={() => toggleChecklistGroup(gk)} accessibilityRole="button" style={styles.checklistGroup}>
                                <Text style={[type.metaSemi, { color: c.muted, flex: 1 }]} numberOfLines={1}>{groupName}</Text>
                                <Text style={[type.meta, tabular, { color: c.muted }]}>{`${doneInGroup}/${grpItems.length}`}</Text>
                              </Pressable>
                              {!gCollapsed && withDividers(grpItems.map(renderChecklistItem))}
                            </View>
                          );
                        })}
                      </View>
                    )
                  ) : null}
                </View>
              );
            })
          ),
        )}
    </>
  );
  const sec_links = (
    <>
        {/* Header-only cards: open the section */}
        {canViewSelections ? sectionCard({ title: 'Selections', icon: Palette, onOpen: () => go('Selections') }) : null}
        {sectionCard({ title: 'Scope', icon: Layers, onOpen: () => go('Scope') })}
        {canViewDefects ? sectionCard({ title: 'Defects', icon: Hammer, onOpen: () => go('DefectsList') }) : null}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {navBar}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isWide ? styles.scrollWide : readableFrame, embedded && { paddingTop: embeddedTop }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        {/* Project header */}
        <View>
          {isWide && project.jobNumber ? (
            <Text style={[type.meta, tabular, { color: c.muted }]}>{`#${project.jobNumber}`}</Text>
          ) : null}
          <View style={styles.titleRow}>
            <ProjectSquare color={project.color} fallbackKey={project.id} size="card" />
            <Text style={[type.title, { color: c.text, flex: 1 }]} numberOfLines={2}>
              {project.name}
            </Text>
            {price ? <Text style={[type.price, tabular, { color: c.text }]}>{price}</Text> : null}
            {/* Embedded (Duo right pane) has no nav bar, so its ••• lives here. */}
            {embedded ? (
              <Pressable
                onPress={() => moreSheetRef.current?.present()}
                hitSlop={metrics.hitSlop}
                accessibilityRole="button"
                accessibilityLabel="More actions"
              >
                <Ellipsis size={metrics.pageHeader.back} color={c.icon} strokeWidth={metrics.iconStroke} />
              </Pressable>
            ) : null}
          </View>
          {(metaLine || typeof progress === 'number') ? (
            <View style={styles.metaBlock}>
              {metaLine ? <Text style={[type.body, { color: c.muted }]}>{metaLine}</Text> : null}
              {typeof progress === 'number' ? (
                <ProgressLine value={progress / 100} color={projectColor} trackColor={c.hairline} />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Section tiles */}
        <ScrollView
          horizontal
          // Duo: the nine tiles fit in one row, so no sideways scroll.
          scrollEnabled={!isWide}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.tilesRow, isWide && styles.tilesRowWide]}
          style={isWide ? styles.tilesScrollWide : styles.tilesScroll}
        >
          {tiles.map(t => (
            <SectionTile key={t.key} icon={t.icon} label={t.label} count={t.count ? t.count : null} onPress={t.onPress} />
          ))}
        </ScrollView>

        {isWide ? (
          <View style={styles.duoCols}>
            <View style={styles.duoMain}>
              {sec_overview}
              {sec_schedule}
              {sec_checklists}
            </View>
            <View style={styles.duoSide}>
              {sec_tasks}
              {sec_diary}
              {sec_notes}
              {sec_links}
            </View>
          </View>
        ) : (
          <>
            {sec_overview}
            {sec_tasks}
            {sec_schedule}
            {sec_diary}
            {sec_notes}
            {sec_checklists}
            {sec_links}
          </>
        )}
      </ScrollView>

      <FAB onPress={() => captureSheetRef.current?.present()} label="Add to this project" />

      <Sheet ref={captureSheetRef} title={`Add to ${project.name}`}>
        <View style={styles.sheetChips}>
          {canAddDiary ? <CaptureChip variant="sheet" icon={Camera} label="Photo" onPress={() => runCapture('photo')} /> : null}
          {canAddDiary ? <CaptureChip variant="sheet" icon={SquarePen} label="Diary" onPress={() => runCapture('diary')} /> : null}
          {canAddDefect ? <CaptureChip variant="sheet" icon={Hammer} label="Defect" onPress={() => runCapture('defect')} /> : null}
          <CaptureChip variant="sheet" icon={Receipt} label="Receipt" onPress={() => runCapture('receipt')} />
        </View>
      </Sheet>

      <Sheet ref={moreSheetRef} title={project.name}>
        <View style={styles.sheetBody}>
          <Card variant="list">
            <ListRow
              lead={<MapPin size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
              title="Set site location (I'm on site now)"
              trailing={siteLocation.busy ? <ActivityIndicator size="small" color={c.accent} /> : undefined}
              onPress={() => { moreSheetRef.current?.dismiss(); siteLocation.confirm(); }}
            />
            {clientContact?.name ? (
              <ListRow
                lead={<Users size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
                title="Client details"
                chevron
                onPress={() => {
                  moreSheetRef.current?.dismiss();
                  navigation.navigate('ClientDetail', { contactId: clientContact.id, contactName: clientContact.name });
                }}
              />
            ) : null}
            <ListRow
              lead={<ListChecks size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
              title="All tasks"
              chevron
              onPress={() => { moreSheetRef.current?.dismiss(); go('ProjectTasks'); }}
            />
          </Card>
        </View>
      </Sheet>
    </View>
  );
}

const pd = metrics.projectDetail;

const styles = StyleSheet.create({
  container: { flex: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: pd.navHeight,
    paddingRight: pd.navPad.right,
    paddingBottom: pd.navPad.bottom,
    paddingLeft: pd.navPad.left,
  },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: pd.navGap },
  scrollContent: {
    paddingHorizontal: space.screenX,
    paddingTop: pd.contentTop,
    paddingBottom: FAB_CLEARANCE + space.screenBottom,
    gap: pd.contentGap,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: pd.headerGap },
  metaBlock: { paddingLeft: pd.metaPadLeft, gap: pd.metaGap, marginTop: space.inlineSm },
  // Tiles run to the screen edge so the last one is visibly cut off.
  tilesScroll: { marginHorizontal: -space.screenX, flexGrow: 0 },
  tilesScrollWide: { flexGrow: 0 },
  tilesRowWide: { paddingHorizontal: 0 },
  // Duo (D02): padding 12/28; info + schedule on the left, tasks on the right (340).
  scrollWide: { paddingHorizontal: pd.duoPadX },
  duoCols: { flexDirection: 'row', alignItems: 'flex-start', gap: pd.duoColGap },
  duoMain: { flex: 1, minWidth: 0, gap: pd.duoCardGap },
  duoSide: { width: pd.duoSide, gap: pd.duoCardGap },
  tilesRow: { gap: pd.tileGap, paddingHorizontal: space.screenX },
  sectionCard: { paddingBottom: pd.cardPadBottom },
  quietRow: { paddingVertical: metrics.listRow.padY },
  subLabel: { paddingTop: metrics.listRow.padY, paddingBottom: metrics.workspace.subLabelPad.bottom },
  checklistHead: { paddingVertical: metrics.listRow.padY, gap: space.inline },
  checklistGroup: { flexDirection: 'row', alignItems: 'center', gap: space.inline, paddingTop: space.section, paddingBottom: space.inlineSm },
  checklistLoading: { paddingVertical: space.section },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inline, paddingHorizontal: space.screenX, paddingTop: space.inline },
  sheetBody: { paddingHorizontal: space.screenX, paddingTop: space.inline },
});
