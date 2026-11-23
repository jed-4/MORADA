import { useState, useEffect, useCallback, useLayoutEffect, useRef, type JSX } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  TextInput,
  Alert,
  Platform,
  Pressable,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, ClipboardList, FileText, Image as ImageIcon, MessageSquare, Paperclip, Plus, Search, SendHorizontal, Trash2, User, UserX, X } from 'lucide-react-native';
import { apiFetch, apiRequest, uploadFileFromUri } from '../services/api';
import { addToQueue, isOnline } from '../services/offlineQueue';
import { usePersistedState } from '../lib/usePersistedState';
import { useAuth } from '../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme, useColors, lightTheme, metrics, radii, size, space, tabular, type } from '../theme';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { SkeletonList } from '../components/ui/Skeleton';
import { haptic } from '../lib/haptics';
import {
  Avatar, ButtonRow, Card, Checkbox, CollapsedGroupList, DetailHeader, EmptyState, GroupHeader, ListRow, ModalSheet, PageHeader,
  ProgressLine, ProjectSquare, SecondaryButton, TextField, initialsOf, type CollapsedGroup,
} from '../components/kit';
import { SwipeRow } from '../components/ui/SwipeRow';
import { TwoPane } from '../components/ui/TwoPane';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useLayout } from '../lib/useLayout';
interface Project {
  id: string;
  name: string;
  color?: string | null;
}

interface ChecklistInstance {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  assigneeName?: string;
  projectId: string;
  completedCount: number;
  totalCount: number;
  createdAt?: string;
}

interface ChecklistItem {
  id: string;
  instanceId: string;
  groupId?: string;
  groupName?: string;
  groupOrder?: number;
  description: string;
  order: number;
  isRequired: boolean;
  status: 'pending' | 'completed' | 'na';
  responseType: 'checkbox' | 'text' | 'single_choice' | 'multiple_choice';
  notes?: string;
  assigneeName?: string;
  assigneeId?: string;
  attachmentIds?: any[];
}

interface TeamMember {
  id: string;
  displayName: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

// Oldest first. Mirrors compareCreatedAt in shared/utils.ts — mobile can't
// reach the web app's @shared alias, so it keeps its own copy.
function compareCreatedAt(
  a: { createdAt?: string | null } | null | undefined,
  b: { createdAt?: string | null } | null | undefined,
): number {
  const at = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
  return at - bt;
}

// The number a user typed at the front of a name: "3. Slab" -> 3, "ITP013 -
// Dilapidation" -> 13. Mirrors leadingSequenceNumber in shared/utils.ts —
// mobile can't reach the web app's @shared alias, so it keeps its own copy.
function leadingSequenceNumber(name: string | null | undefined): number | null {
  const text = (name || '').trim();
  if (!text) return null;
  const separated = text.match(/^(\d+)(?:\s*[.)\-:\u2013\u2014]\s*\S|$)/);
  if (separated) return parseInt(separated[1], 10);
  const prefixed = text.match(/^[A-Za-z]{1,6}[-_]?(\d+)(?![\w])/);
  if (prefixed) return parseInt(prefixed[1], 10);
  return null;
}

// Mirrors compareNumberedNames in shared/utils.ts: 0 unless both names are
// numbered, so an unnumbered list keeps the sequence it was stored in.
function compareNumberedNames(a: string | null | undefined, b: string | null | undefined): number {
  const an = leadingSequenceNumber(a);
  const bn = leadingSequenceNumber(b);
  if (an === null || bn === null) return 0;
  return an - bn;
}

// Items render in their authored `order`, then by the number at the front of
// the description. Ties that aren't numbered keep the order the server sent
// (Array.sort is stable) rather than being alphabetised out of it.
function compareItems(a: ChecklistItem, b: ChecklistItem): number {
  return (a.order ?? 0) - (b.order ?? 0) || compareNumberedNames(a.description, b.description);
}

// Groups render in the order their checklist was authored — each item carries
// its parent's position in groupOrder — then by leading number. Unnumbered
// ties keep insertion order.
function compareGroupEntries(
  [nameA, itemsA]: [string, ChecklistItem[]],
  [nameB, itemsB]: [string, ChecklistItem[]],
): number {
  return (itemsA[0]?.groupOrder ?? 0) - (itemsB[0]?.groupOrder ?? 0)
    || compareNumberedNames(nameA, nameB);
}

export default function ChecklistsScreen({ navigation, route }: Props) {
  const projectId = (route.params as any)?.projectId as string | undefined;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [projects, setProjects] = useState<Project[]>([]);
  const [instances, setInstances] = useState<ChecklistInstance[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsByInstance, setItemsByInstance] = useState<Record<string, ChecklistItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  // Folded phases (keyed instanceId:phase) and open list sections, remembered (GOTCHAS #15).
  const [collapsedGroups, setCollapsedGroups] = usePersistedState<Record<string, boolean>>('checklists.collapsed', {});
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuItem, setMenuItem] = useState<ChecklistItem | null>(null);
  const [menuMode, setMenuMode] = useState<'actions' | 'activity' | 'assignee' | 'attachments'>('actions');
  const [noteText, setNoteText] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const { user } = useAuth();
  const k = useColors();
  const insets = useSafeAreaInsets();
  const projectColor = (route.params as any)?.projectColor as string | null | undefined;
  const projectSheetRef = useRef<SheetRef>(null);
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [openSections, setOpenSections] = usePersistedState<string[]>('checklists.sections', ['active']);

  // The screen draws its own one-row header.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  // Big screen (Duo unfolded): checklists on the left, the open checklist's
  // items on the right. Phone: items expand inline under the card, as before.
  const { isWide } = useLayout();

  // Phone: hardware back closes an open checklist before leaving the screen.
  useEffect(() => {
    if (isWide || !expandedId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setExpandedId(null);
      return true;
    });
    return () => sub.remove();
  }, [isWide, expandedId]);

  const theme = useTheme();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
};

  const fetchInstances = useCallback(async () => {
    try {
      const filterPid = projectId || selectedProjectId;
      const query = filterPid ? `?projectId=${filterPid}` : '';
      const data = await apiFetch<ChecklistInstance[]>(`/api/checklist-instances${query}`);
      // Checklists have no order column of their own, so they hold the order
      // they were added in — same as the web checklists page and the widget.
      const sorted = (data || []).sort(compareCreatedAt);
      setInstances(sorted);
    } catch {
      setInstances([]);
    }
  }, [projectId, selectedProjectId]);

  const fetchMeta = useCallback(async () => {
    if (!projectId) {
      await apiFetch<Project[]>('/api/projects').then(p => setProjects(p || [])).catch(() => setProjects([]));
    } else {
      await apiFetch<Project>(`/api/projects/${projectId}`).then(p => setProjectName(p?.name || '')).catch(() => {});
    }
  }, [projectId]);

  // Meta (project list / project name) only needs loading once per project;
  // instances refetch when the filter changes. Keeping these separate avoids
  // the old overlapping effects that double/triple-fetched on mount.
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  useEffect(() => {
    fetchInstances().finally(() => setLoading(false));
  }, [fetchInstances]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setItemsByInstance({});
    setLoadingItems({});
    // Reload the open checklist's items too — the cache was just cleared, and
    // nothing else would refetch them until another card was tapped.
    const openId = expandedId;
    const reloadOpen = openId
      ? apiFetch<ChecklistItem[]>(`/api/checklist-instances/${openId}/items`)
          .then(items => setItemsByInstance(prev => ({ ...prev, [openId]: (items || []).sort(compareItems) })))
          .catch(() => {})
      : Promise.resolve();
    await Promise.all([fetchMeta(), fetchInstances(), reloadOpen]);
    setRefreshing(false);
  }, [fetchMeta, fetchInstances, expandedId]);

  const fetchItems = useCallback(async (instanceId: string) => {
    if (itemsByInstance[instanceId]) return;
    setLoadingItems(prev => ({ ...prev, [instanceId]: true }));
    try {
      const items = await apiFetch<ChecklistItem[]>(`/api/checklist-instances/${instanceId}/items`);
      const sorted = (items || []).sort(compareItems);
      setItemsByInstance(prev => ({ ...prev, [instanceId]: sorted }));
    } catch {
      setItemsByInstance(prev => ({ ...prev, [instanceId]: [] }));
    } finally {
      setLoadingItems(prev => ({ ...prev, [instanceId]: false }));
    }
  }, [itemsByInstance]);

  const toggleExpand = (instanceId: string) => {
    // Side by side, tapping the open checklist again keeps it open (there is
    // nothing inline to collapse); on a phone it folds the card shut.
    if (expandedId === instanceId && isWide) return;
    if (expandedId === instanceId) {
      setExpandedId(null);
    } else {
      setExpandedId(instanceId);
      fetchItems(instanceId);
    }
  };

  const toggleItemStatus = (item: ChecklistItem) => {
    if (item.status === 'na') return;
    setItemStatus(item, item.status === 'completed' ? 'pending' : 'completed');
  };

  // N/A counts as done in completedCount (server: "na" counts as done).
  const countsDone = (status: ChecklistItem['status']) => status === 'completed' || status === 'na';

  const setItemStatus = (item: ChecklistItem, newStatus: ChecklistItem['status']) => {
    if (newStatus === item.status) return;
    setItemsByInstance(prev => {
      const items = prev[item.instanceId] || [];
      return {
        ...prev,
        [item.instanceId]: items.map(i => i.id === item.id ? { ...i, status: newStatus } : i),
      };
    });
    const delta = (countsDone(newStatus) ? 1 : 0) - (countsDone(item.status) ? 1 : 0);
    setInstances(prev =>
      prev.map(inst =>
        inst.id === item.instanceId
          ? { ...inst, completedCount: Math.max(0, inst.completedCount + delta) }
          : inst
      )
    );
    (async () => {
      const online = await isOnline();
      if (online) {
        apiRequest(`/api/checklist-instance-items/${item.id}`, 'PATCH', { status: newStatus }).catch((e: any) => {
          setItemsByInstance(prev => {
            const items = prev[item.instanceId] || [];
            return {
              ...prev,
              [item.instanceId]: items.map(i => i.id === item.id ? { ...i, status: item.status } : i),
            };
          });
          setInstances(prev =>
            prev.map(inst =>
              inst.id === item.instanceId
                ? { ...inst, completedCount: Math.max(0, inst.completedCount - delta) }
                : inst
            )
          );
          Alert.alert('Error', e?.message || 'Failed to update item.');
        });
      } else {
        await addToQueue({ type: 'update-checklist-item', payload: { id: item.id, status: newStatus } });
      }
    })();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const groupItems = (items: ChecklistItem[]) => {
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
      groups[key].sort(compareItems);
    }
    ungrouped.sort(compareItems);
    return { groups, ungrouped };
  };

  const parseNoteFeed = (notes: string | null | undefined): Array<{ author: string; date: string; text: string }> => {
    if (!notes) return [];
    try {
      const parsed = JSON.parse(notes);
      if (Array.isArray(parsed)) return parsed;
      return [{ author: 'Note', date: new Date().toISOString(), text: notes }];
    } catch {
      return [{ author: 'Note', date: new Date().toISOString(), text: notes }];
    }
  };

  const formatFeedDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const day = d.getDate();
      const month = d.toLocaleString('default', { month: 'short' });
      const hours = d.getHours();
      const mins = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const h = hours % 12 || 12;
      return `${month} ${day} at ${h}:${mins} ${ampm}`;
    } catch {
      return '';
    }
  };

  const openItemMenu = (item: ChecklistItem) => {
    setMenuItem(item);
    setMenuMode('actions');
    setNoteText('');
  };

  const closeMenu = () => {
    setMenuItem(null);
    setMenuMode('actions');
    setNoteText('');
  };

  const fetchTeamMembers = useCallback(async () => {
    setLoadingTeam(true);
    try {
      const data = await apiFetch<TeamMember[]>('/api/users/assignable');
      setTeamMembers(data || []);
    } catch {
      setTeamMembers([]);
    } finally {
      setLoadingTeam(false);
    }
  }, []);

  const handleAddNote = async () => {
    if (!menuItem || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const existingNotes = parseNoteFeed(menuItem.notes);
      const newEntry = {
        author: user?.fullName || user?.firstName || 'You',
        date: new Date().toISOString(),
        text: noteText.trim(),
      };
      existingNotes.push(newEntry);
      const updatedNotes = JSON.stringify(existingNotes);
      await apiRequest(`/api/checklist-instance-items/${menuItem.id}`, 'PATCH', { notes: updatedNotes });
      const updatedItem = { ...menuItem, notes: updatedNotes };
      setMenuItem(updatedItem);
      setItemsByInstance(prev => {
        const items = prev[menuItem.instanceId] || [];
        return { ...prev, [menuItem.instanceId]: items.map(i => i.id === menuItem.id ? { ...i, notes: updatedNotes } : i) };
      });
      setNoteText('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  const handlePickAttachment = async () => {
    if (!menuItem) return;
    const currentAttachments = Array.isArray(menuItem.attachmentIds) ? [...(menuItem.attachmentIds as any[])] : [];
    if (currentAttachments.length >= 3) {
      Alert.alert('Limit reached', 'Maximum 3 attachments per item.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to attach files.');
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        allowsMultipleSelection: false,
      });
    } catch {
      Alert.alert('Error', 'Could not open the photo library.');
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || `attachment-${Date.now()}.jpg`;
    const contentType = asset.mimeType || 'image/jpeg';
    if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
      Alert.alert('File too large', 'Maximum file size is 10MB.');
      return;
    }
    setUploadingAttachment(true);
    try {
      const { objectPath } = await uploadFileFromUri(asset.uri, fileName, contentType);
      const newAttachment = {
        name: fileName,
        path: objectPath,
        contentType,
        size: asset.fileSize || 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user?.fullName || user?.firstName || 'Unknown',
      };
      const updatedAttachments = [...currentAttachments, newAttachment];
      await apiRequest(`/api/checklist-instance-items/${menuItem.id}`, 'PATCH', { attachmentIds: updatedAttachments });
      const updatedItem = { ...menuItem, attachmentIds: updatedAttachments };
      setMenuItem(updatedItem);
      setItemsByInstance(prev => {
        const items = prev[menuItem.instanceId] || [];
        return { ...prev, [menuItem.instanceId]: items.map(i => i.id === menuItem.id ? { ...i, attachmentIds: updatedAttachments } : i) };
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to upload attachment');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async (index: number) => {
    if (!menuItem) return;
    const currentAttachments = Array.isArray(menuItem.attachmentIds) ? [...(menuItem.attachmentIds as any[])] : [];
    currentAttachments.splice(index, 1);
    try {
      await apiRequest(`/api/checklist-instance-items/${menuItem.id}`, 'PATCH', { attachmentIds: currentAttachments });
      const updatedItem = { ...menuItem, attachmentIds: currentAttachments };
      setMenuItem(updatedItem);
      setItemsByInstance(prev => {
        const items = prev[menuItem.instanceId] || [];
        return { ...prev, [menuItem.instanceId]: items.map(i => i.id === menuItem.id ? { ...i, attachmentIds: currentAttachments } : i) };
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to remove attachment');
    }
  };

  const handleAssign = async (memberId: string | null, memberName: string | null) => {
    if (!menuItem) return;
    setSavingAssignee(true);
    try {
      await apiRequest(`/api/checklist-instance-items/${menuItem.id}`, 'PATCH', { assigneeId: memberId, assigneeName: memberName });
      setItemsByInstance(prev => {
        const items = prev[menuItem.instanceId] || [];
        return { ...prev, [menuItem.instanceId]: items.map(i => i.id === menuItem.id ? { ...i, assigneeId: memberId || undefined, assigneeName: memberName || undefined } : i) };
      });
      closeMenu();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update assignee');
    } finally {
      setSavingAssignee(false);
    }
  };

  // Swipe right: tick / untick. Swipe left: set N/A / clear N/A. Same calls
  // (and the same offline queue) as the checkbox. Long-press opens the item's
  // actions (notes, assignee, attachments) — no per-row ⋮.
  const renderItemRow = (item: ChecklistItem) => {
    const done = item.status === 'completed';
    const na = item.status === 'na';
    const attachCount = Array.isArray(item.attachmentIds) ? item.attachmentIds.length : 0;
    const hasMeta = !!item.assigneeName || item.isRequired || na || !!item.notes || attachCount > 0;
    return (
      <SwipeRow
        key={item.id}
        left={na ? null : {
          label: done ? 'Untick' : 'Tick',
          icon: done ? 'arrow-undo' : 'checkmark',
          color: done ? theme.textSecondary : theme.statusSuccessSolid,
          haptic: done ? 'select' : 'success',
          onAction: () => toggleItemStatus(item),
        }}
        right={{
          label: na ? 'Clear N/A' : 'N/A',
          icon: na ? 'arrow-undo' : 'remove-circle-outline',
          color: theme.textSecondary,
          haptic: 'select',
          onAction: () => setItemStatus(item, na ? 'pending' : 'na'),
        }}
      >
        <Pressable
          onLongPress={() => openItemMenu(item)}
          delayLongPress={metrics.longPressMs}
          accessibilityHint="Long-press for notes, assignee and attachments"
          style={[ck.itemRow, { backgroundColor: k.surface }]}
        >
          <View style={ck.check}>
            <Checkbox
              checked={done}
              disabled={na}
              onPress={() => toggleItemStatus(item)}
              accessibilityLabel={item.description}
            />
          </View>
          <View style={ck.itemBody}>
            <Text
              style={[type.checklistItem, { color: done || na ? k.muted : k.text }, done && ck.strike]}
            >
              {item.description}
            </Text>
            {hasMeta ? (
              <View style={ck.itemMeta}>
                {item.assigneeName ? <Text style={[type.caption, { color: k.muted }]}>{initialsOf(item.assigneeName)}</Text> : null}
                {na ? <Text style={[type.caption, { color: k.muted }]}>N/A</Text> : null}
                {/* Red is kept for over budget / rejected (§3.12); required reads as pending. */}
                {item.isRequired && !done && !na ? <Text style={[type.caption, { color: k.status.pendingText }]}>Required</Text> : null}
                {item.notes ? <MessageSquare size={size.icon.caret} color={k.muted} strokeWidth={metrics.iconStroke} /> : null}
                {attachCount > 0 ? (
                  <View style={ck.attach}>
                    <Paperclip size={size.icon.caret} color={k.muted} strokeWidth={metrics.iconStroke} />
                    <Text style={[type.caption, tabular, { color: k.muted }]}>{attachCount}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </SwipeRow>
    );
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups({ ...collapsedGroups, [groupKey]: !collapsedGroups[groupKey] });
  };

  // Expand/Collapse All for one checklist's groups.
  const groupCollapseFor = (instanceId: string) => {
    const items = itemsByInstance[instanceId] || [];
    const { groups: instanceGroups } = groupItems(items);
    const groupKeys = Object.keys(instanceGroups).map(g => `${instanceId}:${g}`);
    const allGroupsCollapsed = groupKeys.length > 0 && groupKeys.every(key => collapsedGroups[key]);
    const hasGroups = groupKeys.length > 1;

    const toggleAllInstanceGroups = () => {
      const newState = !allGroupsCollapsed;
      const updated = { ...collapsedGroups };
      groupKeys.forEach(key => { updated[key] = newState; });
      setCollapsedGroups(updated);
    };
    return { allGroupsCollapsed, hasGroups, toggleAllInstanceGroups };
  };

  /** Phases (item groups): open ones as list cards, folded ones as plain rows. */
  const renderItems = (instanceId: string) => {
    if (loadingItems[instanceId]) {
      return <ActivityIndicator style={ck.loading} size="small" color={k.accent} />;
    }
    const items = itemsByInstance[instanceId] || [];
    if (items.length === 0) {
      return <Text style={[type.body, { color: k.muted }]}>No items</Text>;
    }
    const { groups, ungrouped } = groupItems(items);
    const blocks: JSX.Element[] = [];
    let run: CollapsedGroup[] = [];
    const flush = () => {
      if (run.length) {
        blocks.push(<CollapsedGroupList key={`c-${blocks.length}`} groups={run} />);
        run = [];
      }
    };
    if (ungrouped.length > 0) {
      blocks.push(<Card key="__ungrouped" variant="list">{ungrouped.map(renderItemRow)}</Card>);
    }
    Object.entries(groups).sort(compareGroupEntries).forEach(([groupName, grpItems]) => {
      const groupKey = `${instanceId}:${groupName}`;
      const doneInGroup = grpItems.filter(i => i.status === 'completed' || i.status === 'na').length;
      const count = `${doneInGroup}/${grpItems.length}`;
      if (collapsedGroups[groupKey]) {
        run.push({ key: groupKey, title: groupName, trailing: count, onPress: () => toggleGroup(groupKey) });
        return;
      }
      flush();
      blocks.push(
        <View key={groupKey}>
          <View style={ck.phaseHead}>
            <View style={{ flex: 1 }}>
              <GroupHeader title={groupName} open onToggle={() => toggleGroup(groupKey)} />
            </View>
            <Text style={[type.meta, tabular, ck.phaseCount, { color: k.muted }]}>{count}</Text>
          </View>
          <Card variant="list">{grpItems.map(renderItemRow)}</Card>
        </View>,
      );
    });
    flush();
    return <View style={ck.phases}>{blocks}</View>;
  };

  const instanceProjectName = (inst: ChecklistInstance) =>
    projectId ? projectName : projects.find(p => p.id === inst.projectId)?.name ?? '';

  // One checklist: title, progress, phases. A full page on a phone (over the
  // list, which stays mounted); the right-hand pane on a big screen.
  const renderDetail = () => {
    const instance = expandedId ? instances.find(i => i.id === expandedId) : undefined;
    if (!instance) return null;
    const progress = instance.totalCount > 0 ? instance.completedCount / instance.totalCount : 0;
    const pName = instanceProjectName(instance);
    const { allGroupsCollapsed, hasGroups, toggleAllInstanceGroups } = groupCollapseFor(instance.id);
    return (
      <ScrollView
        contentContainerStyle={[ck.detail, readableFrame, { paddingTop: (isWide ? 0 : insets.top) + metrics.schedule.top, paddingBottom: space.screenBottom + insets.bottom }]}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
      >
        <DetailHeader onBack={isWide ? undefined : () => setExpandedId(null)} />
        <View style={ck.titleBlock}>
          <Text style={[type.heading, { color: k.text }]}>{instance.name}</Text>
          <View style={ck.subLine}>
            <Text style={[type.meta, tabular, { color: k.muted }]}>
              {`${instance.completedCount} of ${instance.totalCount}`}
              {pName ? ' · ' : ''}
            </Text>
            {pName ? (
              <View style={ck.project}>
                <ProjectSquare color={(projectId ? projectColor : null) ?? projects.find(pr => pr.id === instance.projectId)?.color ?? null} fallbackKey={instance.projectId} size="header" />
                <Text style={[type.meta, { color: k.muted }]} numberOfLines={1}>{pName}</Text>
              </View>
            ) : null}
          </View>
          {!!(instance.dueDate || instance.assigneeName) && (
            <Text style={[type.meta, { color: k.muted }]}>
              {[instance.assigneeName, instance.dueDate ? `Due ${formatDate(instance.dueDate)}` : null].filter(Boolean).join(' · ')}
            </Text>
          )}
          <View style={ck.progress}><ProgressLine value={progress} /></View>
          {!!instance.description && (
            <Text style={[type.bodyRead, { color: k.textLong }]}>{instance.description}</Text>
          )}
        </View>
        {hasGroups && (
          <Pressable onPress={toggleAllInstanceGroups} hitSlop={metrics.hitSlop} accessibilityRole="button" style={ck.collapseAll}>
            <Text style={[type.meta, { color: k.muted }]}>{allGroupsCollapsed ? 'Expand all' : 'Collapse all'}</Text>
          </Pressable>
        )}
        {renderItems(instance.id)}
      </ScrollView>
    );
  };

  const openChecklist = (id: string) => {
    haptic.select();
    setExpandedId(id);
    fetchItems(id);
  };

  const renderRow = (inst: ChecklistInstance) => {
    const progress = inst.totalCount > 0 ? inst.completedCount / inst.totalCount : 0;
    const selected = isWide && expandedId === inst.id;
    return (
      <Pressable
        key={inst.id}
        onPress={() => openChecklist(inst.id)}
        accessibilityRole="button"
        accessibilityLabel={`${inst.name}, ${inst.completedCount} of ${inst.totalCount} done`}
        style={({ pressed }) => [ck.row, selected && { backgroundColor: k.tint }, pressed && { opacity: metrics.pressedOpacity }]}
      >
        <View style={ck.rowBody}>
          <Text style={[type.rowTitle, { color: k.text }]} numberOfLines={2}>{inst.name}</Text>
          {!projectId && instanceProjectName(inst) ? (
            <Text style={[type.caption, { color: k.muted }]} numberOfLines={1}>{instanceProjectName(inst)}</Text>
          ) : null}
          <ProgressLine value={progress} inlineLabel={`${inst.completedCount} of ${inst.totalCount}`} />
        </View>
        <ChevronRight size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />
      </Pressable>
    );
  };

  const q = search.trim().toLowerCase();
  const visible = instances.filter(i => !q || i.name.toLowerCase().includes(q));
  const active = visible.filter(i => i.status === 'active' || i.status === 'in_progress');
  const completed = visible.filter(i => i.status === 'completed');
  const cancelled = visible.filter(i => i.status === 'cancelled');
  const sections = [
    { key: 'active', title: 'Active', items: active },
    { key: 'completed', title: 'Completed', items: completed },
    { key: 'cancelled', title: 'Cancelled', items: cancelled },
  ].filter(sct => sct.items.length > 0);

  const headerProject = projectId
    ? (projectName ? { name: projectName, color: projectColor ?? null, id: projectId } : null)
    : { name: projects.find(p => p.id === selectedProjectId)?.name ?? 'All projects', color: null, id: selectedProjectId };

  const pageHeader = (
    <PageHeader
      title="Checklists"
      project={headerProject}
      onBack={() => navigation.goBack()}
      onProjectPress={!projectId && projects.length > 0 ? () => projectSheetRef.current?.present() : undefined}
      actions={[
        searchVisible
          ? { icon: X, label: 'Close search', onPress: () => { setSearch(''); setSearchVisible(false); } }
          : { icon: Search, label: 'Search checklists', onPress: () => setSearchVisible(true) },
      ]}
    />
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: k.bg, paddingTop: insets.top + metrics.schedule.top }]}>
        <View style={ck.pad}>{pageHeader}</View>
        <SkeletonList />
      </View>
    );
  }

  const list = (
    <ScrollView
      contentContainerStyle={[ck.list, { paddingTop: insets.top + metrics.schedule.top }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accent} />}
    >
      {pageHeader}
      {searchVisible && (
        <View style={[ck.search, { backgroundColor: k.surface, borderColor: k.border }]}>
          <Search size={metrics.projects.searchIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search checklists"
            placeholderTextColor={k.faint}
            autoFocus
            style={[type.body, ck.searchInput, { color: k.text }]}
          />
        </View>
      )}
      {sections.length === 0 ? (
        <View style={ck.empty}>
          <EmptyState
            icon={ClipboardList}
            title={q ? 'Nothing matches' : 'No checklists'}
            helper={q ? 'Try another name.' : projectId || selectedProjectId ? 'No checklists on this project yet.' : 'No checklists have been created yet.'}
          />
        </View>
      ) : (
        (() => {
          const out: JSX.Element[] = [];
          let run: CollapsedGroup[] = [];
          const flush = () => {
            if (run.length) {
              out.push(<CollapsedGroupList key={`c-${out.length}`} groups={run} />);
              run = [];
            }
          };
          sections.forEach(sct => {
            // Active starts open; Completed and Cancelled start folded.
            const open = q ? true : openSections.includes(sct.key);
            const toggle = () =>
              setOpenSections(open ? openSections.filter(x => x !== sct.key) : [...openSections, sct.key]);
            if (!open) {
              run.push({ key: sct.key, title: sct.title, meta: String(sct.items.length), onPress: toggle });
              return;
            }
            flush();
            out.push(
              <View key={sct.key}>
                <GroupHeader title={sct.title} meta={sct.items.length} open onToggle={toggle} />
                <Card variant="list">{sct.items.map(renderRow)}</Card>
              </View>,
            );
          });
          flush();
          return out;
        })()
      )}
    </ScrollView>
  );

  return (
    <View style={[styles.container, { backgroundColor: k.bg }]}>
      {/* Always wrapped in TwoPane so the list keeps its place in the tree —
          folding/unfolding never remounts it (scroll position survives). */}
      <TwoPane
        emptyTitle="Select a checklist"
        emptyIcon="checkmark-done-outline"
        detail={isWide ? renderDetail() : null}
        list={list}
      />

      {/* Phone: the open checklist covers the list (which stays mounted). */}
      {!isWide && expandedId ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: k.bg }]}>{renderDetail()}</View>
      ) : null}

      <Sheet ref={projectSheetRef} title="Project" scrollable snapPoints={['60%', '88%']}>
        <View style={ck.sheetBody}>
          <Card variant="list">
            <ListRow
              key="__all"
              title="All projects"
              titleLines={1}
              trailing={!selectedProjectId ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
              onPress={() => { setSelectedProjectId(null); projectSheetRef.current?.dismiss(); }}
            />
            {projects.map(p => (
              <ListRow
                key={p.id}
                title={p.name}
                titleLines={1}
                lead={<ProjectSquare color={p.color} fallbackKey={p.id} />}
                trailing={selectedProjectId === p.id ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                onPress={() => { setSelectedProjectId(p.id); projectSheetRef.current?.dismiss(); }}
              />
            ))}
          </Card>
        </View>
      </Sheet>

      {/* Item menu: actions, then notes / attachments / assign as sub-pages. */}
      <ModalSheet
        visible={!!menuItem}
        onRequestClose={menuMode === 'actions' ? closeMenu : () => setMenuMode('actions')}
        title={menuMode === 'activity' ? 'Notes' : menuMode === 'attachments' ? 'Attachments' : menuMode === 'assignee' ? 'Assign to' : 'Item'}
        cancelLabel={menuMode === 'actions' ? 'Close' : 'Back'}
        onCancel={menuMode === 'actions' ? closeMenu : () => setMenuMode('actions')}
      >
        <View style={ck.menuBody}>
          {menuMode === 'actions' && menuItem ? (
            <>
              <Text style={[type.rowTitle, { color: k.text }]} numberOfLines={3}>{menuItem.description}</Text>
              <Card variant="list">
                <ListRow
                  key="notes"
                  lead={<MessageSquare size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
                  title="Notes"
                  trailing={menuItem.notes ? <Text style={[type.meta, tabular, { color: k.muted }]}>{parseNoteFeed(menuItem.notes).length}</Text> : undefined}
                  chevron
                  onPress={() => setMenuMode('activity')}
                />
                <ListRow
                  key="assign"
                  lead={<User size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
                  title={menuItem.assigneeName ? `Assigned: ${menuItem.assigneeName}` : 'Assign'}
                  titleLines={1}
                  chevron
                  onPress={() => { setMenuMode('assignee'); fetchTeamMembers(); }}
                />
                <ListRow
                  key="attach"
                  lead={<Paperclip size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
                  title="Attachments"
                  trailing={Array.isArray(menuItem.attachmentIds) && menuItem.attachmentIds.length > 0
                    ? <Text style={[type.meta, tabular, { color: k.muted }]}>{menuItem.attachmentIds.length}</Text>
                    : undefined}
                  chevron
                  onPress={() => setMenuMode('attachments')}
                />
              </Card>
            </>
          ) : null}

          {menuMode === 'activity' && menuItem ? (
            <>
              {(() => {
                const entries = parseNoteFeed(menuItem.notes);
                if (entries.length === 0) {
                  return <Text style={[type.meta, ck.menuEmpty, { color: k.muted }]}>No notes yet</Text>;
                }
                return (
                  <ScrollView style={{ maxHeight: metrics.checklists.menuListMax }}>
                    <Card variant="list">
                      {entries.map((entry, idx) => (
                        <View key={idx} style={ck.feedRow}>
                          <Avatar name={entry.author} size="activity" />
                          <View style={ck.feedBody}>
                            <View style={ck.feedHead}>
                              <Text style={[type.metaSemi, { color: k.text }]}>{entry.author}</Text>
                              <Text style={[type.caption, tabular, { color: k.muted }]}>{formatFeedDate(entry.date)}</Text>
                            </View>
                            <Text style={[type.bodyPreview, { color: k.textBody }]}>{entry.text}</Text>
                          </View>
                        </View>
                      ))}
                    </Card>
                  </ScrollView>
                );
              })()}
              <View style={ck.addRow}>
                <View style={ck.flex1}>
                  <TextField
                    placeholder="Add a note"
                    value={noteText}
                    autoCapitalize="sentences"
                    onChangeText={setNoteText}
                    multiline
                    accessibilityLabel="New note"
                  />
                </View>
                <Pressable
                  onPress={handleAddNote}
                  disabled={savingNote || !noteText.trim()}
                  hitSlop={metrics.hitSlop}
                  accessibilityRole="button"
                  accessibilityLabel="Post note"
                  style={[ck.iconBtn, { opacity: savingNote || !noteText.trim() ? metrics.disabledOpacity : 1 }]}
                >
                  {savingNote ? <ActivityIndicator size="small" color={k.accent} /> : <SendHorizontal size={size.icon.header} color={k.accent} strokeWidth={metrics.iconStroke} />}
                </Pressable>
              </View>
            </>
          ) : null}

          {menuMode === 'attachments' && menuItem ? (
            <>
              {(() => {
                const attachments = Array.isArray(menuItem.attachmentIds) ? menuItem.attachmentIds as any[] : [];
                if (attachments.length === 0) {
                  return <Text style={[type.meta, ck.menuEmpty, { color: k.muted }]}>No attachments</Text>;
                }
                return (
                  <ScrollView style={{ maxHeight: metrics.checklists.menuListMax }}>
                    <Card variant="list">
                      {attachments.map((att: any, idx: number) => {
                        const Glyph = att.contentType?.startsWith('image/') ? ImageIcon : FileText;
                        return (
                          <ListRow
                            key={idx}
                            lead={<Glyph size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
                            title={att.name}
                            titleLines={1}
                            subtitle={[att.uploadedBy, att.uploadedAt ? formatFeedDate(att.uploadedAt) : null].filter(Boolean).join(' · ') || undefined}
                            trailing={
                              <Pressable onPress={() => handleRemoveAttachment(idx)} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel={`Remove ${att.name}`}>
                                <Trash2 size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />
                              </Pressable>
                            }
                          />
                        );
                      })}
                    </Card>
                  </ScrollView>
                );
              })()}
              <ButtonRow>
                <SecondaryButton label="Add attachment" icon={Plus} onPress={handlePickAttachment} loading={uploadingAttachment} />
              </ButtonRow>
            </>
          ) : null}

          {menuMode === 'assignee' && menuItem ? (
            loadingTeam ? (
              <ActivityIndicator size="small" color={k.accent} style={ck.menuEmpty} />
            ) : (
              <ScrollView style={{ maxHeight: metrics.checklists.menuListMax + metrics.checklists.menuListMax / 2 }}>
                <Card variant="list">
                  {menuItem.assigneeId ? (
                    <ListRow
                      key="__none"
                      lead={<UserX size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
                      title="Unassign"
                      onPress={savingAssignee ? undefined : () => handleAssign(null, null)}
                    />
                  ) : null}
                  {teamMembers.map(member => {
                    const active = menuItem.assigneeId === member.id;
                    return (
                      <ListRow
                        key={member.id}
                        lead={<Avatar name={member.displayName} />}
                        title={member.displayName}
                        titleLines={1}
                        selected={active}
                        trailing={active ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                        onPress={savingAssignee ? undefined : () => handleAssign(member.id, member.displayName)}
                      />
                    );
                  })}
                </Card>
                {teamMembers.length === 0 ? <Text style={[type.meta, ck.menuEmpty, { color: k.muted }]}>No team members available</Text> : null}
              </ScrollView>
            )
          ) : null}
        </View>
      </ModalSheet>
    </View>
  );
}

const ck = StyleSheet.create({
  pad: { paddingHorizontal: space.screenX, paddingBottom: metrics.scope.gap },
  list: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom, gap: metrics.scope.gap },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    minHeight: metrics.projects.searchHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
    paddingHorizontal: metrics.projects.cardPad,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, paddingVertical: metrics.checklists.rowPadY },
  rowBody: { flex: 1, gap: metrics.checklists.rowGap },
  empty: { minHeight: metrics.emptyState.circle * 6 },
  sheetBody: { paddingHorizontal: space.screenX, paddingTop: space.inline },
  // Detail
  menuBody: { paddingHorizontal: space.screenX, paddingTop: space.inline, paddingBottom: space.screenBottom, gap: metrics.sheet.gap },
  menuEmpty: { textAlign: 'center', paddingVertical: space.screenBottom },
  feedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowGap, paddingVertical: metrics.listRow.padY },
  feedBody: { flex: 1, gap: metrics.listRow.bodyGap },
  feedHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.inline, flexWrap: 'wrap' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  flex1: { flex: 1 },
  iconBtn: { minWidth: metrics.minHit, minHeight: metrics.minHit, alignItems: 'center', justifyContent: 'center' },
  detail: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom, gap: metrics.scope.gap },
  titleBlock: { gap: space.inline },
  subLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  project: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  progress: { paddingTop: space.inlineSm },
  collapseAll: { alignSelf: 'flex-end' },
  phases: { gap: metrics.scope.gap },
  phaseHead: { flexDirection: 'row', alignItems: 'flex-start' },
  phaseCount: { lineHeight: type.rowTitle.lineHeight },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowGap, paddingVertical: metrics.listRow.padY },
  check: { paddingTop: metrics.checklists.checkOffset },
  itemBody: { flex: 1, gap: metrics.checklists.itemGap },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  attach: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm / 2 },
  strike: { textDecorationLine: 'line-through' },
  loading: { paddingVertical: space.section },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
});
