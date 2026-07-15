import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, lightTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { compareProjects } from '../lib/projects';

const toTitleCase = (str: string) =>
  str.replace(/_/g, ' ').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
interface Project {
  id: string;
  name: string;
  jobNumber?: string;
  projectNumber?: string;
  clientName?: string;
  currentSystemPhase?: string;
  projectSubStatus?: string;
  address?: string;
  color?: string;
  createdAt?: string;
  // Financial fields — server stores ALL values in cents.
  budget?: number;          // legacy internal budget (cents)
  clientBudget?: number;    // client's budget (cents)
  contractCost?: number;    // agreed contract cost (cents)
  contractPrice?: number;   // locked contract price set at construction (cents)
  // Completion — two sources:
  // `progress`: dynamically computed from schedule item progressPercent (enriched by GET /api/projects)
  // `percentComplete`: manually-set field used by OH predictor, almost always 0
  progress?: number | null;
  percentComplete?: number;
  // Dates
  startDate?: string;
  endDate?: string;
  proposedStartDate?: string;
  proposedEndDate?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

const phases = [
  { key: 'all', label: 'All' },
  { key: 'construction', label: 'Construction' },
  { key: 'pre_construction', label: 'Pre-Con' },
  { key: 'lead', label: 'Lead' },
  { key: 'post_construction', label: 'Post-Con' },
];

export default function ProjectsScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  // Mirror server-side authority check used by GET /api/projects in
  // server/routes.ts: roleName matched case-insensitively against
  // admin / owner / general manager. The backend remains authoritative.
  const canViewFinancials = (() => {
    const r = (user?.roleName ?? '').toLowerCase();
    return (
      r.includes('admin') ||
      r.includes('owner') ||
      r.includes('general manager')
    );
  })();
  const [projects, setProjects] = useState<Project[]>([]);
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [activePhase, setActivePhase] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const insets = useSafeAreaInsets();

  const theme = useTheme();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
    inputBg: theme.card,
};

  const fetchProjects = useCallback(async () => {
    try {
      const data = await apiFetch<Project[]>('/api/projects');
      // Mirror the web ProjectSwitcher's client-side filter: exclude archived
      // and business projects regardless of what the server version returns.
      const active = (data || []).filter((p: any) => !p.isArchived && !p.isBusiness);
      setProjects(active);
      setError(false);
    } catch (e) {
      console.error('Failed to fetch projects:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatusLabels = useCallback(async () => {
    try {
      const cat = await apiFetch<{ options: { key: string; name: string }[] }>(
        '/api/field-categories/by-key/project.status'
      );
      if (cat?.options) {
        const map: Record<string, string> = {};
        for (const opt of cat.options) { map[opt.key] = opt.name; }
        setStatusLabels(map);
      }
    } catch {
      // silently ignore — raw key shown as fallback
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchStatusLabels();
  }, [fetchProjects, fetchStatusLabels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }, [fetchProjects]);

  const GREY = lightTheme.textMuted;
  const getProjectColor = (project: Project): string => project.color || GREY;

  const getSubStatusLabel = (key?: string): string => {
    if (!key) return '';
    return statusLabels[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getFilteredProjects = () => {
    let filtered = activePhase === 'all' ? projects : projects.filter(p => p.currentSystemPhase === activePhase);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        p =>
          p.name?.toLowerCase().includes(q) ||
          p.clientName?.toLowerCase().includes(q) ||
          p.jobNumber?.toLowerCase().includes(q) ||
          p.projectNumber?.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort(compareProjects);
  };

  const renderProjectCard = ({ item }: { item: Project }) => {
    const projectColor = getProjectColor(item);

    // Status chip colour mapping — theme tokens so dark mode gets dark washes
    const chipColors: Record<string, { bg: string; dot: string; text: string }> = {
      construction:      { bg: theme.sageLight, dot: theme.sage, text: theme.sage },
      pre_construction:  { bg: theme.amberLight, dot: theme.amber, text: theme.amber },
      lead:              { bg: theme.primaryLight, dot: theme.primary, text: theme.primary },
      post_construction: { bg: theme.tealLight, dot: theme.teal, text: theme.teal },
    };
    const chip = chipColors[item.currentSystemPhase ?? ''] ?? { bg: theme.primaryLight, dot: theme.primary, text: theme.primary };
    const chipLabel = item.projectSubStatus
      ? getSubStatusLabel(item.projectSubStatus)
      : item.currentSystemPhase
      ? getSubStatusLabel(item.currentSystemPhase)
      : 'Active';

    // `progress` is computed by the server from schedule item progressPercent values.
    // It's null when a project has no schedule items. Only show the bar when it exists.
    const pct = typeof item.progress === 'number' ? item.progress : 0;
    const hasProgress = item.progress != null;

    // Value display — server stores ALL financial fields in CENTS.
    // Pick the most "headline" value available, in priority order.
    const valueCents = item.contractPrice ?? item.contractCost ?? item.clientBudget ?? item.budget;
    const valueStr = valueCents
      ? (() => {
          const dollars = valueCents / 100;
          if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
          if (dollars >= 1_000) return `$${Math.round(dollars / 1_000)}k`;
          return `$${Math.round(dollars)}`;
        })()
      : null;

    // Date display — schema uses proposedEndDate (and legacy endDate).
    const dueDate = item.proposedEndDate ?? item.endDate;
    const dateStr = dueDate
      ? new Date(dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
      : null;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, projectName: item.name })}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        {/* Top colour band */}
        <View style={[styles.cardTopBand, { backgroundColor: projectColor }]} />

        {/* Card body below the band */}
        <View style={styles.cardBody}>

          {/* Row 1: Project name + value (financial fields role-gated) */}
          <View style={styles.cardRow}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {canViewFinancials && valueStr && (
              <Text style={[styles.cardValue, { color: colors.text }]}>{valueStr}</Text>
            )}
          </View>

          {/* Client name */}
          {!!item.clientName && (
            <View style={[styles.cardRow, { marginTop: 3, justifyContent: 'flex-start' }]}>
              <Ionicons name="person-outline" size={11} color={colors.secondary} style={{ marginRight: 4 }} />
              <Text style={[styles.cardClient, { color: colors.secondary }]} numberOfLines={1}>
                {item.clientName}
              </Text>
            </View>
          )}

          {/* Row 2: Status chip + date */}
          <View style={[styles.cardRow, { marginTop: 6 }]}>
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <View style={[styles.chipDot, { backgroundColor: chip.dot }]} />
              <Text style={[styles.chipLabel, { color: chip.text }]}>{toTitleCase(chipLabel)}</Text>
            </View>
            {dateStr && (
              <Text style={[styles.cardDate, { color: colors.secondary }]}>{dateStr}</Text>
            )}
          </View>

          {/* Row 3: Progress bar in the project's own colour + % label. */}
          {hasProgress && (
            <View style={{ marginTop: 10 }}>
              <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
                {pct > 0 && (
                  <View style={[styles.progressFill, {
                    backgroundColor: projectColor,
                    width: `${Math.min(pct, 100)}%`,
                  }]} />
                )}
              </View>
              {pct > 0 && (
                <Text style={[styles.progressLabel, { color: colors.secondary }]}>
                  {Math.round(pct)}% complete
                </Text>
              )}
            </View>
          )}

        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={[styles.emptyText, { color: colors.secondary }]}>
          Couldn't load your projects.
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => { setLoading(true); fetchProjects(); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryBtnText, { color: colors.accent }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filteredProjects = getFilteredProjects();

  const screenBg = isDark ? theme.background : '#F0EBE3';

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* Header — matches Dashboard header exactly */}
      <View style={[styles.header, { backgroundColor: screenBg, paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Projects</Text>
        <TouchableOpacity
          style={styles.searchIconBtn}
          onPress={() => { setSearchVisible(v => !v); if (searchVisible) setSearch(''); }}
          activeOpacity={0.7}
        >
          <Ionicons name={searchVisible ? 'close' : 'search'} size={22} color={colors.secondary} />
        </TouchableOpacity>
        {/* Hairline divider beneath the header */}
        <View style={[styles.headerDivider, { backgroundColor: colors.border }]} />
      </View>

      {/* Expandable search */}
      {searchVisible && (
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.secondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search projects..."
            placeholderTextColor={colors.secondary}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={16} color={colors.secondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Project list */}
      <FlatList
        data={filteredProjects}
        keyExtractor={item => item.id}
        style={{ backgroundColor: screenBg }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        renderItem={renderProjectCard}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color={colors.secondary} />
            <Text style={[styles.emptyText, { color: colors.secondary }]}>
              {search ? 'No projects match your search' : 'No projects found'}
            </Text>
          </View>
        }
      />

      {/* Floating filter pill — hovers above the bottom tab bar */}
      <View pointerEvents="box-none" style={styles.pillWrap}>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: colors.card,
              borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
              borderColor: colors.border,
              shadowOpacity: isDark ? 0.4 : 0.12,
              shadowRadius: isDark ? 16 : 12,
              elevation: isDark ? 12 : 8,
            },
          ]}
        >
          {phases.map(phase => {
            const isActive = activePhase === phase.key;
            return (
              <Pressable
                key={phase.key}
                onPress={() => setActivePhase(phase.key)}
                style={({ pressed }) => [
                  styles.pillBtn,
                  isActive && { backgroundColor: colors.accent },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={[
                    styles.pillLabel,
                    {
                      color: isActive ? lightTheme.card : colors.muted,
                      fontWeight: isActive ? '600' : '500',
                    },
                  ]}
                >
                  {phase.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 0,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerDivider: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  searchIconBtn: {
    padding: 8,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },

  list: {
    paddingHorizontal: 16,
    paddingTop: 10,
    // Clears the floating filter pill (pill ~52 + 14 offset + clearance).
    paddingBottom: 96,
    gap: 10,
  },

  card: {
    flexDirection: 'column',
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 84,
  },
  cardTopBand: {
    height: 4,
    width: '100%',
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  cardValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  cardClient: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  cardDate: {
    fontSize: 11,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  chipLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
  progressBg: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 10,
    marginTop: 4,
  },

  pillWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    zIndex: 10,
  },
  pill: {
    flexDirection: 'row',
    padding: 8,
    borderRadius: 26,
    gap: 4,
    shadowColor: lightTheme.textPrimary,
    shadowOffset: { width: 0, height: 4 },
  },
  pillBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryBtnText: { fontSize: 15, fontWeight: '600' },
});
