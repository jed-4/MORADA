import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, apiRequest, uploadFileFromUri } from '../services/api';
import { addToQueue, isOnline } from '../services/offlineQueue';
import { useAuth } from '../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

interface Project {
  id: string;
  name: string;
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

export default function ChecklistsScreen({ navigation, route }: Props) {
  const projectId = (route.params as any)?.projectId as string | undefined;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [projects, setProjects] = useState<Project[]>([]);
  const [instances, setInstances] = useState<ChecklistInstance[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsByInstance, setItemsByInstance] = useState<Record<string, ChecklistItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
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

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1' };

  const statusColors: Record<string, string> = {
    active: '#94a3b8',
    in_progress: '#3b82f6',
    completed: '#22c55e',
    cancelled: '#ef4444',
  };

  const statusLabels: Record<string, string> = {
    active: 'Active',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  const fetchInstances = useCallback(async () => {
    try {
      const filterPid = projectId || selectedProjectId;
      const query = filterPid ? `?projectId=${filterPid}` : '';
      const data = await apiFetch<ChecklistInstance[]>(`/api/checklist-instances${query}`);
      const sorted = (data || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setInstances(sorted);
    } catch {
      setInstances([]);
    }
  }, [projectId, selectedProjectId]);

  const fetchData = useCallback(async () => {
    try {
      const promises: Promise<any>[] = [fetchInstances()];
      if (!projectId) {
        promises.push(
          apiFetch<Project[]>('/api/projects').then(p => setProjects(p || [])).catch(() => setProjects([]))
        );
      } else {
        promises.push(
          apiFetch<Project>(`/api/projects/${projectId}`).then(p => setProjectName(p?.name || '')).catch(() => {})
        );
      }
      await Promise.all(promises);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId, fetchInstances]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!projectId) fetchInstances();
  }, [selectedProjectId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setItemsByInstance({});
    setLoadingItems({});
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const fetchItems = useCallback(async (instanceId: string) => {
    if (itemsByInstance[instanceId]) return;
    setLoadingItems(prev => ({ ...prev, [instanceId]: true }));
    try {
      const items = await apiFetch<ChecklistItem[]>(`/api/checklist-instances/${instanceId}/items`);
      const sorted = (items || []).sort((a, b) => (a.description || '').localeCompare(b.description || ''));
      setItemsByInstance(prev => ({ ...prev, [instanceId]: sorted }));
    } catch {
      setItemsByInstance(prev => ({ ...prev, [instanceId]: [] }));
    } finally {
      setLoadingItems(prev => ({ ...prev, [instanceId]: false }));
    }
  }, [itemsByInstance]);

  const toggleExpand = (instanceId: string) => {
    if (expandedId === instanceId) {
      setExpandedId(null);
    } else {
      setExpandedId(instanceId);
      fetchItems(instanceId);
    }
  };

  const toggleItemStatus = (item: ChecklistItem) => {
    if (item.status === 'na') return;
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    setItemsByInstance(prev => {
      const items = prev[item.instanceId] || [];
      return {
        ...prev,
        [item.instanceId]: items.map(i => i.id === item.id ? { ...i, status: newStatus } : i),
      };
    });
    const delta = newStatus === 'completed' ? 1 : -1;
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
        apiRequest(`/api/checklist-instance-items/${item.id}`, 'PATCH', { status: newStatus }).catch(() => {
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
        });
      } else {
        await addToQueue({ type: 'update-checklist-item', payload: { id: item.id, status: newStatus } });
      }
    })();
  };

  const getCheckboxIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'completed': return 'checkbox';
      case 'na': return 'remove-circle-outline';
      default: return 'square-outline';
    }
  };

  const getCheckboxColor = (status: string) => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'na': return colors.muted;
      default: return colors.secondary;
    }
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
      groups[key].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
    }
    ungrouped.sort((a, b) => (a.description || '').localeCompare(b.description || ''));
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
    } catch {
      Alert.alert('Error', 'Failed to add note');
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      allowsMultipleSelection: false,
    });
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
    } catch {
      Alert.alert('Error', 'Failed to upload attachment');
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
    } catch {
      Alert.alert('Error', 'Failed to remove attachment');
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
    } catch {
      Alert.alert('Error', 'Failed to update assignee');
    } finally {
      setSavingAssignee(false);
    }
  };

  const renderItemRow = (item: ChecklistItem) => (
    <View key={item.id} style={[styles.itemRow, { borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.itemCheckArea}
        onPress={() => toggleItemStatus(item)}
        activeOpacity={0.7}
        disabled={item.status === 'na'}
      >
        <Ionicons name={getCheckboxIcon(item.status)} size={22} color={getCheckboxColor(item.status)} />
        <View style={styles.itemContent}>
          <Text
            style={[
              styles.itemDescription,
              { color: item.status === 'completed' ? colors.muted : colors.text },
              item.status === 'completed' && styles.itemStrikethrough,
            ]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
          {item.assigneeName && (
            <Text style={[styles.itemAssigneeText, { color: colors.secondary }]} numberOfLines={1}>
              {item.assigneeName.split(' ')[0]}
            </Text>
          )}
        </View>
        {item.isRequired && (
          <View style={[styles.requiredBadge, { backgroundColor: '#ef444420' }]}>
            <Text style={[styles.requiredText, { color: '#ef4444' }]}>Req</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.itemRightActions}>
        {item.notes && (
          <Ionicons name="chatbubble" size={13} color={colors.accent} />
        )}
        {Array.isArray(item.attachmentIds) && item.attachmentIds.length > 0 && (
          <View style={styles.attachCountBadge}>
            <Ionicons name="attach" size={12} color={colors.accent} />
            <Text style={[styles.attachCountText, { color: colors.accent }]}>{item.attachmentIds.length}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.itemMenuBtn}
          onPress={() => openItemMenu(item)}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={colors.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const renderExpandedItems = (instanceId: string) => {
    if (loadingItems[instanceId]) {
      return (
        <View style={styles.itemsLoading}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      );
    }
    const items = itemsByInstance[instanceId] || [];
    if (items.length === 0) {
      return (
        <View style={styles.itemsEmpty}>
          <Text style={[styles.itemsEmptyText, { color: colors.secondary }]}>No items</Text>
        </View>
      );
    }
    const { groups, ungrouped } = groupItems(items);
    return (
      <View style={[styles.itemsContainer, { borderTopColor: colors.border }]}>
        {ungrouped.length > 0 && ungrouped.map(renderItemRow)}
        {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, grpItems]) => {
          const groupKey = `${instanceId}:${groupName}`;
          const isCollapsed = collapsedGroups[groupKey];
          const completedInGroup = grpItems.filter(i => i.status === 'completed' || i.status === 'na').length;
          return (
            <View key={groupName}>
              <TouchableOpacity
                style={[styles.groupHeaderRow, { borderColor: colors.border }]}
                onPress={() => toggleGroup(groupKey)}
                activeOpacity={0.7}
              >
                <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={14} color={colors.accent} />
                <Text style={[styles.groupHeader, { color: colors.accent }]} numberOfLines={1}>{groupName}</Text>
                <Text style={[styles.groupCount, { color: colors.secondary }]}>
                  {completedInGroup}/{grpItems.length}
                </Text>
              </TouchableOpacity>
              {!isCollapsed && grpItems.map(renderItemRow)}
            </View>
          );
        })}
      </View>
    );
  };

  const renderInstance = (instance: ChecklistInstance) => {
    const isExpanded = expandedId === instance.id;
    const progress = instance.totalCount > 0 ? instance.completedCount / instance.totalCount : 0;
    const statusColor = statusColors[instance.status] || '#94a3b8';

    const items = itemsByInstance[instance.id] || [];
    const { groups: instanceGroups } = groupItems(items);
    const groupKeys = Object.keys(instanceGroups).map(g => `${instance.id}:${g}`);
    const allGroupsCollapsed = groupKeys.length > 0 && groupKeys.every(k => collapsedGroups[k]);
    const hasGroups = groupKeys.length > 1;

    const toggleAllInstanceGroups = () => {
      const newState = !allGroupsCollapsed;
      setCollapsedGroups(prev => {
        const updated = { ...prev };
        groupKeys.forEach(k => { updated[k] = newState; });
        return updated;
      });
    };

    return (
      <View key={instance.id} style={[styles.instanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={styles.instanceHeader}
          onPress={() => toggleExpand(instance.id)}
          activeOpacity={0.7}
        >
          <View style={styles.instanceTop}>
            <View style={styles.instanceTitleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                <Text style={[styles.instanceName, { color: colors.text }]} numberOfLines={1}>{instance.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                    {statusLabels[instance.status] || instance.status}
                  </Text>
                </View>
              </View>
            </View>
            {instance.description && (
              <Text style={[styles.instanceDesc, { color: colors.secondary }]} numberOfLines={1}>{instance.description}</Text>
            )}
          </View>

          <View style={styles.instanceMeta}>
            <View style={styles.progressSection}>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: progress === 1 ? '#22c55e' : colors.accent }]} />
              </View>
              <Text style={[styles.progressText, { color: colors.secondary }]}>
                {instance.completedCount}/{instance.totalCount} completed
              </Text>
            </View>
            <View style={styles.instanceMetaRight}>
              {instance.dueDate && (
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={13} color={colors.secondary} />
                  <Text style={[styles.metaText, { color: colors.secondary }]}>{formatDate(instance.dueDate)}</Text>
                </View>
              )}
              {instance.assigneeName && (
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={13} color={colors.secondary} />
                  <Text style={[styles.metaText, { color: colors.secondary }]}>{instance.assigneeName}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.expandIndicatorRow}>
            <View style={styles.expandIndicatorSpacer} />
            <View style={styles.expandIndicatorCenter}>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </View>
            <View style={styles.expandIndicatorRight}>
              {isExpanded && hasGroups && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); toggleAllInstanceGroups(); }}
                  style={styles.collapseAllBelowBtn}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={allGroupsCollapsed ? 'chevron-down' : 'chevron-up'} size={13} color={colors.secondary} />
                  <Text style={[styles.collapseAllText, { color: colors.secondary }]}>
                    {allGroupsCollapsed ? 'Expand All' : 'Collapse All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && renderExpandedItems(instance.id)}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {!projectId && projects.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={[styles.filterScroll, { borderBottomColor: colors.border }]}
        >
          <TouchableOpacity
            style={[
              styles.filterPill,
              {
                borderColor: !selectedProjectId ? colors.accent : colors.border,
                backgroundColor: !selectedProjectId ? colors.accent + '20' : 'transparent',
              },
            ]}
            onPress={() => setSelectedProjectId(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterPillText, { color: !selectedProjectId ? colors.accent : colors.secondary }]}>All</Text>
          </TouchableOpacity>
          {projects.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.filterPill,
                {
                  borderColor: selectedProjectId === p.id ? colors.accent : colors.border,
                  backgroundColor: selectedProjectId === p.id ? colors.accent + '20' : 'transparent',
                },
              ]}
              onPress={() => setSelectedProjectId(p.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.filterPillText, { color: selectedProjectId === p.id ? colors.accent : colors.secondary }]}
                numberOfLines={1}
              >
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {instances.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="checkmark-done-outline" size={40} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No checklists</Text>
            <Text style={[styles.emptyDesc, { color: colors.secondary }]}>
              {projectId || selectedProjectId ? 'No checklists found for this project' : 'No checklists have been created yet'}
            </Text>
          </View>
        ) : (
          instances.map(renderInstance)
        )}
      </ScrollView>

      <Modal
        visible={!!menuItem}
        transparent
        animationType="slide"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.modalOverlay} onPress={closeMenu}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ justifyContent: 'flex-end', flex: 1 }}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                <View style={[styles.modalHandle, { backgroundColor: colors.muted }]} />

                {menuMode === 'actions' && menuItem && (
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>{menuItem.description}</Text>
                    <TouchableOpacity
                      style={styles.modalAction}
                      onPress={() => setMenuMode('activity')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chatbubbles-outline" size={20} color={menuItem.notes ? colors.accent : colors.secondary} />
                      <Text style={[styles.modalActionText, { color: colors.text }]}>Notes</Text>
                      {menuItem.notes && (
                        <View style={[styles.menuBadge, { backgroundColor: colors.accent + '20' }]}>
                          <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '600' }}>{parseNoteFeed(menuItem.notes).length}</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalAction}
                      onPress={() => { setMenuMode('assignee'); fetchTeamMembers(); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={menuItem.assigneeName ? 'person' : 'person-outline'} size={20} color={menuItem.assigneeName ? colors.accent : colors.secondary} />
                      <Text style={[styles.modalActionText, { color: colors.text }]}>
                        {menuItem.assigneeName ? `Assigned: ${menuItem.assigneeName}` : 'Assign'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalAction}
                      onPress={() => setMenuMode('attachments')}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="attach" size={20} color={Array.isArray(menuItem.attachmentIds) && menuItem.attachmentIds.length > 0 ? colors.accent : colors.secondary} />
                      <Text style={[styles.modalActionText, { color: colors.text }]}>
                        Attachments
                      </Text>
                      {Array.isArray(menuItem.attachmentIds) && menuItem.attachmentIds.length > 0 && (
                        <View style={[styles.menuBadge, { backgroundColor: colors.accent + '20' }]}>
                          <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '600' }}>{menuItem.attachmentIds.length}</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
                )}

                {menuMode === 'activity' && menuItem && (
                  <View>
                    <View style={styles.modalSubHeader}>
                      <TouchableOpacity onPress={() => setMenuMode('actions')} activeOpacity={0.7}>
                        <Ionicons name="arrow-back" size={22} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={[styles.modalTitle, { color: colors.text, flex: 1 }]}>Notes</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 220, marginBottom: 12 }}>
                      {(() => {
                        const entries = parseNoteFeed(menuItem.notes);
                        if (entries.length === 0) {
                          return (
                            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                              <Ionicons name="chatbubbles-outline" size={28} color={colors.muted} />
                              <Text style={{ color: colors.secondary, fontSize: 13, marginTop: 8 }}>No notes yet</Text>
                            </View>
                          );
                        }
                        return entries.map((entry, idx) => (
                          <View key={idx} style={styles.feedEntry}>
                            <View style={[styles.feedAvatar, { backgroundColor: colors.accent + '20' }]}>
                              <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700' }}>
                                {entry.author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{entry.author}</Text>
                                <Text style={{ color: colors.secondary, fontSize: 10 }}>{formatFeedDate(entry.date)}</Text>
                              </View>
                              <Text style={{ color: colors.text, fontSize: 13, marginTop: 2 }}>{entry.text}</Text>
                            </View>
                          </View>
                        ));
                      })()}
                    </ScrollView>
                    <View style={[styles.feedInputRow, { borderTopColor: colors.border }]}>
                      <TextInput
                        style={[styles.feedInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}
                        placeholder="Add a note..."
                        placeholderTextColor={colors.muted}
                        value={noteText}
                        onChangeText={setNoteText}
                        multiline
                        textAlignVertical="top"
                      />
                      <TouchableOpacity
                        style={[styles.feedSendBtn, { backgroundColor: noteText.trim() ? colors.accent : colors.muted }]}
                        onPress={handleAddNote}
                        activeOpacity={0.7}
                        disabled={savingNote || !noteText.trim()}
                      >
                        {savingNote ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="send" size={16} color="#fff" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {menuMode === 'attachments' && menuItem && (
                  <View>
                    <View style={styles.modalSubHeader}>
                      <TouchableOpacity onPress={() => setMenuMode('actions')} activeOpacity={0.7}>
                        <Ionicons name="arrow-back" size={22} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={[styles.modalTitle, { color: colors.text, flex: 1 }]}>Attachments</Text>
                    </View>
                    {(() => {
                      const attachments = Array.isArray(menuItem.attachmentIds) ? menuItem.attachmentIds as any[] : [];
                      if (attachments.length === 0) {
                        return (
                          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                            <Ionicons name="cloud-upload-outline" size={28} color={colors.muted} />
                            <Text style={{ color: colors.secondary, fontSize: 13, marginTop: 8 }}>No attachments</Text>
                          </View>
                        );
                      }
                      return (
                        <ScrollView style={{ maxHeight: 200 }}>
                          {attachments.map((att: any, idx: number) => (
                            <View key={idx} style={[styles.attachmentRow, { borderColor: colors.border }]}>
                              <Ionicons
                                name={att.contentType?.startsWith('image/') ? 'image-outline' : 'document-outline'}
                                size={18}
                                color={colors.accent}
                              />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>{att.name}</Text>
                                <Text style={{ color: colors.secondary, fontSize: 10 }}>
                                  {att.uploadedBy} {att.uploadedAt ? `- ${formatFeedDate(att.uploadedAt)}` : ''}
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleRemoveAttachment(idx)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </ScrollView>
                      );
                    })()}
                    <TouchableOpacity
                      style={[styles.saveBtn, { backgroundColor: colors.accent, marginTop: 12, flexDirection: 'row', gap: 6 }]}
                      onPress={handlePickAttachment}
                      activeOpacity={0.7}
                      disabled={uploadingAttachment}
                    >
                      {uploadingAttachment ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="add" size={18} color="#fff" />
                          <Text style={styles.saveBtnText}>Add Attachment</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {menuMode === 'assignee' && menuItem && (
                  <View>
                    <View style={styles.modalSubHeader}>
                      <TouchableOpacity onPress={() => setMenuMode('actions')} activeOpacity={0.7}>
                        <Ionicons name="arrow-back" size={22} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={[styles.modalTitle, { color: colors.text, flex: 1 }]}>Assign To</Text>
                    </View>
                    {menuItem.assigneeId && (
                      <TouchableOpacity
                        style={[styles.assignRow, { borderColor: colors.border }]}
                        onPress={() => handleAssign(null, null)}
                        activeOpacity={0.7}
                        disabled={savingAssignee}
                      >
                        <Ionicons name="close-circle-outline" size={20} color={colors.secondary} />
                        <Text style={[styles.assignRowText, { color: colors.secondary }]}>Unassign</Text>
                      </TouchableOpacity>
                    )}
                    {loadingTeam ? (
                      <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 20 }} />
                    ) : teamMembers.length === 0 ? (
                      <Text style={{ color: colors.secondary, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>No team members available</Text>
                    ) : (
                      <ScrollView style={{ maxHeight: 300 }}>
                        {teamMembers.map(member => (
                          <TouchableOpacity
                            key={member.id}
                            style={[styles.assignRow, { borderColor: colors.border }, menuItem.assigneeId === member.id && { backgroundColor: colors.accent + '15' }]}
                            onPress={() => handleAssign(member.id, member.displayName)}
                            activeOpacity={0.7}
                            disabled={savingAssignee}
                          >
                            <View style={[styles.assignAvatar, { backgroundColor: colors.accent + '20' }]}>
                              <Text style={[styles.assignAvatarText, { color: colors.accent }]}>
                                {member.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </Text>
                            </View>
                            <Text style={[styles.assignRowText, { color: colors.text }]}>{member.displayName}</Text>
                            {menuItem.assigneeId === member.id && (
                              <Ionicons name="checkmark" size={18} color={colors.accent} style={{ marginLeft: 'auto' }} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  filterScroll: { borderBottomWidth: 1 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterPill: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    maxWidth: 150,
  },
  filterPillText: { fontSize: 13, fontWeight: '500' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  instanceCard: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  instanceHeader: { padding: 12 },
  instanceTop: { marginBottom: 6 },
  instanceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  instanceName: { fontSize: 15, fontWeight: '600', flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  instanceDesc: { fontSize: 12, marginTop: 4 },
  instanceMeta: { gap: 6 },
  progressSection: { gap: 3 },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressText: { fontSize: 11 },
  instanceMetaRight: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11 },
  expandIndicatorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  expandIndicatorSpacer: { flex: 1 },
  expandIndicatorCenter: { alignItems: 'center' },
  expandIndicatorRight: { flex: 1, alignItems: 'flex-end' },
  itemsContainer: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  collapseAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  collapseAllHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  collapseAllBelowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  collapseAllText: { fontSize: 11, fontWeight: '500' },
  itemsLoading: { padding: 20, alignItems: 'center' },
  itemsEmpty: { padding: 16, alignItems: 'center' },
  itemsEmptyText: { fontSize: 13 },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  groupCount: {
    fontSize: 11,
    fontWeight: '500',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  itemCheckArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  itemContent: { flex: 1 },
  itemDescription: { fontSize: 14 },
  itemStrikethrough: { textDecorationLine: 'line-through' },
  itemAssigneeText: { fontSize: 11, marginTop: 2 },
  itemRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  attachCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  attachCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemMenuBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requiredBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  requiredText: { fontSize: 10, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 10,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  modalActionText: {
    fontSize: 15,
    flex: 1,
  },
  modalSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 12,
  },
  saveBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  assignRowText: {
    fontSize: 14,
    flex: 1,
  },
  assignAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignAvatarText: {
    fontSize: 11,
    fontWeight: '600',
  },
  menuBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: -4,
  },
  feedEntry: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  feedAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedInputRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  feedInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    minHeight: 40,
    maxHeight: 80,
  },
  feedSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyState: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },
});
