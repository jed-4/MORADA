import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

interface ScopeStage {
  id: string;
  name: string;
  displayOrder: number;
}

interface GearItem {
  name: string;
  checked: boolean;
  photoUrl?: string;
}

interface ChecklistItemEntry {
  id: string;
  text: string;
  completed: boolean;
}

interface ScopeItem {
  id: string;
  projectId: string;
  stage: string;
  title: string;
  description?: string;
  itemType: string;
  displayOrder: number;
  isCompleted: boolean;
  gearList?: GearItem[];
  checklistItems?: ChecklistItemEntry[];
  parentId?: string | null;
}

interface ScopeItemTypeDef {
  id: string;
  name: string;
  displayOrder: number;
  visibleToRoles: string[];
  companyId: string;
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getTypeBadgeColor(type: string, isDark: boolean): { bg: string; text: string } {
  const t = type.toLowerCase();
  if (t === 'e-note') return { bg: isDark ? '#7c3aed33' : '#ede9fe', text: isDark ? '#c4b5fd' : '#7c3aed' };
  if (t === 'note') return { bg: isDark ? '#0284c733' : '#e0f2fe', text: isDark ? '#7dd3fc' : '#0284c7' };
  if (t === 'material') return { bg: isDark ? '#d9770633' : '#ffedd5', text: isDark ? '#fdba74' : '#c2410c' };
  if (t === 'tool') return { bg: isDark ? '#15803d33' : '#dcfce7', text: isDark ? '#86efac' : '#15803d' };
  if (t === 'proposal') return { bg: isDark ? '#b4530033' : '#fef3c7', text: isDark ? '#fcd34d' : '#92400e' };
  if (t === 'checklist') return { bg: isDark ? '#0f766e33' : '#ccfbf1', text: isDark ? '#5eead4' : '#0f766e' };
  return { bg: isDark ? '#33415533' : '#f1f5f9', text: isDark ? '#94a3b8' : '#475569' };
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

export default function ScopeScreen({ navigation, route }: Props) {
  const { projectId } = route.params as { projectId: string };
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [stages, setStages] = useState<ScopeStage[]>([]);
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [typeDefs, setTypeDefs] = useState<ScopeItemTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', success: '#22c55e' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#cbd5e1', success: '#16a34a' };

  const roleName = user?.roleName ?? '';
  const isAdmin =
    roleName.toLowerCase().includes('admin') ||
    roleName.toLowerCase().includes('owner') ||
    roleName.toLowerCase().includes('general manager');
  const currentRoleId = user?.roleId ?? null;
  // Edit permission: team members and suppliers can mark items complete; clients are read-only.
  // userCategory is the canonical permission signal for scope item completion throughout the app
  // (team = internal staff, supplier = subcontractor, client = owner/purchaser, read-only only).
  const canEdit = user?.userCategory !== 'client';

  const visibleTypeDefs = typeDefs.filter(def => {
    const roles = (def.visibleToRoles as string[]) ?? [];
    if (roles.length === 0) return true;
    if (isAdmin) return true;
    if (!currentRoleId) return false;
    return roles.includes(currentRoleId);
  });

  const isItemVisible = useCallback(
    (item: ScopeItem): boolean => {
      // No type definitions configured for this company — show all items
      if (typeDefs.length === 0) return true;
      const type = (item.itemType || 'scope').toLowerCase();
      const allDef = typeDefs.find(d => d.name.toLowerCase() === type);
      // Item has a type not present in company definitions (e.g. legacy/deleted type)
      // Default to visible rather than hiding unexpectedly
      if (!allDef) return true;
      // Type exists but not visible to this role — hide for non-admins
      const visibleDef = visibleTypeDefs.find(d => d.name.toLowerCase() === type);
      if (!visibleDef && !isAdmin) return false;
      return true;
    },
    [typeDefs, visibleTypeDefs, isAdmin]
  );

  const fetchData = useCallback(async () => {
    try {
      const [stagesData, itemsData, typeDefsData] = await Promise.all([
        apiFetch<ScopeStage[]>(`/api/projects/${projectId}/scope-stages`).catch(() => []),
        apiFetch<ScopeItem[]>(`/api/projects/${projectId}/scope`).catch(() => []),
        apiFetch<ScopeItemTypeDef[]>('/api/scope-item-types').catch(() => []),
      ]);
      setStages((stagesData || []).sort((a, b) => a.displayOrder - b.displayOrder));
      setItems(itemsData || []);
      setTypeDefs(typeDefsData || []);
    } catch (e) {
      console.error('Failed to fetch scope data:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleCompletion = async (item: ScopeItem) => {
    if (!canEdit) return;
    const newVal = !item.isCompleted;
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isCompleted: newVal } : i)));
    try {
      await apiRequest(`/api/scope/${item.id}`, 'PATCH', { isCompleted: newVal });
    } catch {
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isCompleted: item.isCompleted } : i)));
    }
  };

  const sectionData = stages.map(stage => ({
    stage,
    data: items
      .filter(item => item.stage === stage.name && !item.parentId && isItemVisible(item))
      .sort((a, b) => a.displayOrder - b.displayOrder),
  })).filter(s => s.data.length > 0);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, flex: 1 }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (sectionData.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, flex: 1 }]}>
        <Ionicons name="layers-outline" size={40} color={colors.muted} />
        <Text style={[styles.emptyText, { color: colors.secondary }]}>No scope items yet</Text>
        <Text style={[styles.emptySubText, { color: colors.muted }]}>Scope items will appear here once added</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <SectionList
        sections={sectionData}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <View style={[styles.stageHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
            <Text style={[styles.stageHeaderText, { color: colors.text }]}>{section.stage.name}</Text>
            <Text style={[styles.stageCount, { color: colors.secondary }]}>
              {section.data.filter(i => i.isCompleted).length}/{section.data.length}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const expanded = expandedItems.has(item.id);
          const typeKey = item.itemType || 'scope';
          const typeBadge = getTypeBadgeColor(typeKey, isDark);
          const descText = stripHtml(item.description);
          const gearList = (item.gearList as GearItem[] | null) ?? [];
          const checklistItems = (item.checklistItems as ChecklistItemEntry[] | null) ?? [];
          const hasDetail = descText.length > 0 || gearList.length > 0 || checklistItems.length > 0;

          return (
            <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.itemRow}>
                <TouchableOpacity
                  style={[styles.checkboxArea, !canEdit && styles.disabled]}
                  onPress={() => toggleCompletion(item)}
                  activeOpacity={canEdit ? 0.6 : 1}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[
                    styles.checkbox,
                    {
                      borderColor: item.isCompleted ? colors.success : colors.muted,
                      backgroundColor: item.isCompleted ? colors.success + '20' : 'transparent',
                    }
                  ]}>
                    {item.isCompleted ? (
                      <Ionicons name="checkmark" size={13} color={colors.success} />
                    ) : null}
                  </View>
                </TouchableOpacity>

                <View style={styles.itemContent}>
                  <View style={styles.itemTopRow}>
                    <View style={[styles.typeBadge, { backgroundColor: typeBadge.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: typeBadge.text }]}>
                        {typeKey.charAt(0).toUpperCase() + typeKey.slice(1).toLowerCase()}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.itemTitle,
                      {
                        color: item.isCompleted ? colors.secondary : colors.text,
                        textDecorationLine: item.isCompleted ? 'line-through' : 'none',
                      },
                    ]}
                    numberOfLines={expanded ? undefined : 2}
                  >
                    {item.title}
                  </Text>
                </View>

                {hasDetail ? (
                  <TouchableOpacity
                    style={styles.expandBtn}
                    onPress={() => toggleExpand(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.secondary}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>

              {expanded && hasDetail ? (
                <View style={[styles.expandedContent, { borderTopColor: colors.border }]}>
                  {descText.length > 0 ? (
                    <Text style={[styles.descText, { color: colors.secondary }]}>{descText}</Text>
                  ) : null}

                  {gearList.length > 0 ? (
                    <View style={styles.gearSection}>
                      <Text style={[styles.gearSectionTitle, { color: colors.secondary }]}>Materials / Gear</Text>
                      {gearList.map((gear, idx) => (
                        <View key={idx} style={styles.gearRow}>
                          <Ionicons
                            name={gear.checked ? 'checkbox' : 'square-outline'}
                            size={16}
                            color={gear.checked ? colors.success : colors.muted}
                          />
                          <Text style={[styles.gearName, { color: gear.checked ? colors.secondary : colors.text }]}>
                            {gear.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {checklistItems.length > 0 ? (
                    <View style={styles.gearSection}>
                      <Text style={[styles.gearSectionTitle, { color: colors.secondary }]}>Checklist</Text>
                      {checklistItems.map((ci, idx) => (
                        <View key={ci.id || idx} style={styles.gearRow}>
                          <Ionicons
                            name={ci.completed ? 'checkbox' : 'square-outline'}
                            size={16}
                            color={ci.completed ? colors.success : colors.muted}
                          />
                          <Text style={[styles.gearName, { color: ci.completed ? colors.secondary : colors.text }]}>
                            {ci.text}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubText: {
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 32,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  stageHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stageCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  itemCard: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
  },
  checkboxArea: {
    paddingTop: 2,
    marginRight: 10,
  },
  disabled: {
    opacity: 0.6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  expandBtn: {
    paddingLeft: 8,
    paddingTop: 2,
  },
  expandedContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 10,
  },
  descText: {
    fontSize: 13,
    lineHeight: 19,
  },
  gearSection: {
    gap: 6,
  },
  gearSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  gearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gearName: {
    fontSize: 13,
    flex: 1,
  },
});
