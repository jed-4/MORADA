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
  const mutedColor = (hex: string): string => hex + '45';

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

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, projectName: item.name })}
        activeOpacity={0.7}
      >
        <View style={[styles.colorSquare, { backgroundColor: mutedColor(projectColor) }]} />
        <View style={styles.cardBody}>
          {item.projectNumber && (
            <Text style={[styles.cardNumber, { color: colors.secondary }]} numberOfLines={1}>#{item.projectNumber}</Text>
          )}
          <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          {item.clientName && (
            <Text style={[styles.cardSub, { color: colors.secondary }]} numberOfLines={1}>{item.clientName}</Text>
          )}
        </View>
        <Text style={[styles.cardStatus, { color: colors.secondary }]} numberOfLines={1}>
          {getSubStatusLabel(item.projectSubStatus)}
        </Text>
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
      <View style={[styles.header, { backgroundColor: colors.accent + '30' }]}>
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
                  isActive && { backgroundColor: theme.primaryLight },
                ]}
                onPress={() => setActivePhase(phase.key)}
                activeOpacity={0.7}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.pillLabel,
                    { color: isActive ? colors.accent : colors.secondary },
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
    // Leave room for the floating pill (~52 tall) + clearance above the tab bar
    paddingBottom: 80,
    gap: 6,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: lightTheme.borderStrong,
    height: 50,
  },
  colorSquare: {
    width: 50,
    alignSelf: 'stretch',
    borderRadius: 9,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'flex-start',
    gap: 1,
  },
  cardNumber: {
    fontSize: 10,
    fontWeight: '500',
  },
  cardName: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardSub: {
    fontSize: 11,
  },
  cardStatus: {
    fontSize: 11,
    fontWeight: '500',
    paddingRight: 12,
    paddingTop: 8,
    alignSelf: 'flex-start',
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
