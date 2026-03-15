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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [activePhase, setActivePhase] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', inputBg: '#1e293b' }
    : { bg: '#ffffff', card: '#f5f5f4', text: '#1c1917', secondary: '#78716c', border: '#e7e5e4', accent: '#9b7fc4', muted: '#d6d3d1', inputBg: '#f5f5f4' };

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

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  }, [fetchProjects]);

  const getPhaseColor = (phase?: string) => {
    switch (phase) {
      case 'lead': return '#f59e0b';
      case 'pre_construction': return '#8b5cf6';
      case 'construction': return '#22c55e';
      case 'completed': return '#6b7280';
      default: return '#94a3b8';
    }
  };

  const getPhaseLabel = (phase?: string) => {
    switch (phase) {
      case 'lead': return 'Lead';
      case 'pre_construction': return 'Pre-Con';
      case 'construction': return 'Construction';
      case 'completed': return 'Completed';
      default: return 'Other';
    }
  };

  const GREY = '#94a3b8';
  const getProjectColor = (project: Project): string => project.color || GREY;
  const mutedColor = (hex: string): string => hex + '45';

  const getPhaseCount = (phaseKey: string) => {
    if (phaseKey === 'all') return projects.length;
    return projects.filter(p => p.currentSystemPhase === phaseKey).length;
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
          {getPhaseLabel(item.currentSystemPhase)}
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

      {/* Filter chips — fixed at the bottom */}
      <View style={[styles.chipBar, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {phases.map(phase => {
            const isActive = activePhase === phase.key;
            const count = getPhaseCount(phase.key);
            return (
              <TouchableOpacity
                key={phase.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? colors.accent + '30' : colors.card,
                    borderColor: isActive ? colors.accent + '60' : colors.border,
                  },
                ]}
                onPress={() => setActivePhase(phase.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipLabel, { color: isActive ? colors.accent : colors.secondary }]}>
                  {phase.label}
                </Text>
                {count > 0 && (
                  <Text style={[styles.chipCount, { color: isActive ? colors.accent : colors.muted }]}>
                    {count}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
    paddingBottom: 12,
    gap: 6,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6d3d1',
    overflow: 'hidden',
    height: 50,
  },
  colorSquare: {
    width: 50,
    alignSelf: 'stretch',
    borderTopLeftRadius: 9,
    borderBottomLeftRadius: 9,
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

  chipBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  chipRow: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipCount: {
    fontSize: 11,
    fontWeight: '700',
  },

  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12 },
});
