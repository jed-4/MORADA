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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, apiRequest } from '../services/api';
import { addToQueue, isOnline } from '../services/offlineQueue';
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

  const renderItemRow = (item: ChecklistItem) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.itemRow, { borderColor: colors.border }]}
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
          <Text style={[styles.itemAssignee, { color: colors.secondary }]}>{item.assigneeName}</Text>
        )}
      </View>
      {item.notes && (
        <Ionicons name="chatbubble" size={12} color="#3b82f6" style={{ marginRight: 4 }} />
      )}
      {item.isRequired && (
        <View style={[styles.requiredBadge, { backgroundColor: '#ef444420' }]}>
          <Text style={[styles.requiredText, { color: '#ef4444' }]}>Req</Text>
        </View>
      )}
    </TouchableOpacity>
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
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
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
              { borderColor: !selectedProjectId ? colors.accent : colors.border },
              !selectedProjectId && { backgroundColor: colors.accent + '20' },
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
                { borderColor: selectedProjectId === p.id ? colors.accent : colors.border },
                selectedProjectId === p.id && { backgroundColor: colors.accent + '20' },
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
  expandIndicatorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, gap: 12 },
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
    gap: 10,
  },
  itemContent: { flex: 1 },
  itemDescription: { fontSize: 14 },
  itemStrikethrough: { textDecorationLine: 'line-through' },
  itemAssignee: { fontSize: 11, marginTop: 2 },
  requiredBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  requiredText: { fontSize: 10, fontWeight: '600' },
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
