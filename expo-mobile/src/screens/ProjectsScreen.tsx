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
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme, lightTheme } from '../theme';
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
  budget?: number;
  contractValue?: number;
  completionPercentage?: number;
  startDate?: string;
  endDate?: string;
  targetCompletionDate?: string;
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [activePhase, setActivePhase] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

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
      setProjects(data || []);
    } catch (e) {
      console.error('Failed to fetch projects:', e);
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
    return [...filtered].sort((a, b) => {
      const jnA = a.projectNumber || a.jobNumber || '';
      const jnB = b.projectNumber || b.jobNumber || '';
      if (jnA && jnB) {
        const cmp = jnA.localeCompare(jnB, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
      } else if (jnA) return -1;
      else if (jnB) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  };

  const renderProjectCard = ({ item }: { item: Project }) => {
    const projectColor = getProjectColor(item);

    // Status chip colour mapping
    const chipColors: Record<string, { bg: string; dot: string; text: string }> = {
      construction:      { bg: '#E8F5F0', dot: '#68B088', text: '#3A7A5A' },
      pre_construction:  { bg: '#FEF3E2', dot: '#F0B964', text: '#8A6020' },
      lead:              { bg: '#F0EAFA', dot: '#A890D4', text: '#6A4A9A' },
      post_construction: { bg: '#E8F5F0', dot: '#70CAD0', text: '#3A7A80' },
    };
    const chip = chipColors[item.currentSystemPhase ?? ''] ?? { bg: '#F0EAFA', dot: '#A890D4', text: '#6A4A9A' };
    const chipLabel = item.projectSubStatus
      ? getSubStatusLabel(item.projectSubStatus)
      : item.currentSystemPhase
      ? getSubStatusLabel(item.currentSystemPhase)
      : 'Active';

    // Progress (0–100 → 0.0–1.0)
    const progress = Math.min(Math.max((item.completionPercentage ?? 0) / 100, 0), 1);
    const hasProgress = (item.completionPercentage ?? 0) > 0;

    // Value display
    const value = item.contractValue ?? item.budget;
    const valueStr = value
      ? value >= 1_000_000
        ? `$${(value / 1_000_000).toFixed(1)}M`
        : `$${Math.round(value / 1000)}k`
      : null;

    // Date display
    const dueDate = item.targetCompletionDate ?? item.endDate;
    const dateStr = dueDate
      ? new Date(dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
      : null;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, projectName: item.name })}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        {/* Left vertical colour stripe */}
        <View style={[styles.cardStripe, { backgroundColor: projectColor }]} />

        {/* Card body */}
        <View style={styles.cardBody}>

          {/* Row 1: Project name + value */}
          <View style={styles.cardRow}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {valueStr && (
              <Text style={[styles.cardValue, { color: colors.text }]}>{valueStr}</Text>
            )}
          </View>

          {/* Row 2: Status chip + date */}
          <View style={[styles.cardRow, { marginTop: 6 }]}>
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <View style={[styles.chipDot, { backgroundColor: chip.dot }]} />
              <Text style={[styles.chipLabel, { color: chip.text }]}>{chipLabel}</Text>
            </View>
            {dateStr && (
              <Text style={[styles.cardDate, { color: colors.secondary }]}>{dateStr}</Text>
            )}
          </View>

          {/* Row 3: Progress bar (only if completion data exists) */}
          {hasProgress && (
            <View style={[styles.progressBg, { backgroundColor: colors.border, marginTop: 10 }]}>
              <View style={[styles.progressFill, { backgroundColor: projectColor, width: `${progress * 100}%` }]} />
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

  const filteredProjects = getFilteredProjects();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header — matches Dashboard header exactly */}
      <View style={[styles.header, { backgroundColor: colors.bg }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Projects</Text>
        <TouchableOpacity
          style={styles.searchIconBtn}
          onPress={() => { setSearchVisible(v => !v); if (searchVisible) setSearch(''); }}
          activeOpacity={0.7}
        >
          <Ionicons name={searchVisible ? 'close' : 'search'} size={22} color={colors.secondary} />
        </TouchableOpacity>
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
      <View
        pointerEvents="box-none"
        style={styles.pillWrap}
      >
        <View
          style={[
            styles.pill,
            {
              backgroundColor: colors.card,
              borderColor: isDark ? 'transparent' : colors.border,
              shadowOpacity: isDark ? 0.45 : 0.12,
            },
          ]}
        >
          {phases.map(phase => {
            const isActive = activePhase === phase.key;
            return (
              <TouchableOpacity
                key={phase.key}
                style={[
                  styles.pillBtn,
                  isActive && { backgroundColor: colors.accent },
                ]}
                onPress={() => setActivePhase(phase.key)}
                activeOpacity={0.7}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.pillLabel,
                    { color: isActive ? '#FFFFFF' : colors.secondary },
                  ]}
                >
                  {phase.label}
                </Text>
              </TouchableOpacity>
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
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    paddingBottom: 90,
    gap: 10,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 84,
  },
  cardStripe: {
    width: 4,
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
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },

  pillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 6,
    borderRadius: 26,
    borderWidth: 1,
    gap: 4,
    // Soft shadow (iOS) + elevation (Android)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
  },
  pillBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12 },
});
