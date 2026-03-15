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
  Animated,
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
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', inputBg: '#1e293b', chipActive: '#b196d2', chipInactive: '#1e293b', chipBorder: '#334155' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', inputBg: '#f1f5f9', chipActive: '#9b7fc4', chipInactive: '#f1f5f9', chipBorder: '#e2e8f0' };

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

  const getAvatarText = (project: Project) => {
    if (project.projectNumber) return project.projectNumber.slice(0, 3);
    const words = project.name.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

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
    const phaseColor = getPhaseColor(item.currentSystemPhase);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, projectName: item.name })}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: phaseColor + '22', borderColor: phaseColor + '55' }]}>
          <Text style={[styles.avatarText, { color: phaseColor }]}>{getAvatarText(item)}</Text>
        </View>

        <View style={styles.cardContent}>
          {item.projectNumber && (
            <Text style={[styles.projectNumber, { color: colors.accent }]}>#{item.projectNumber}</Text>
          )}
          <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          {item.clientName && (
            <Text style={[styles.projectClient, { color: colors.secondary }]} numberOfLines={1}>{item.clientName}</Text>
          )}
        </View>

        <View style={[styles.statusBadge, { backgroundColor: phaseColor + '18', borderColor: phaseColor + '44' }]}>
          <Text style={[styles.statusText, { color: phaseColor }]}>{getPhaseLabel(item.currentSystemPhase)}</Text>
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Projects</Text>
        <TouchableOpacity
          style={styles.searchIconBtn}
          onPress={() => { setSearchVisible(v => !v); if (searchVisible) setSearch(''); }}
          activeOpacity={0.7}
        >
          <Ionicons name={searchVisible ? 'close' : 'search'} size={22} color={colors.secondary} />
        </TouchableOpacity>
      </View>

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
                  backgroundColor: isActive ? colors.chipActive : colors.chipInactive,
                  borderColor: isActive ? colors.chipActive : colors.chipBorder,
                },
              ]}
              onPress={() => setActivePhase(phase.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipLabel, { color: isActive ? '#ffffff' : colors.secondary }]}>
                {phase.label}
              </Text>
              <View style={[styles.chipCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : colors.border }]}>
                <Text style={[styles.chipCountText, { color: isActive ? '#ffffff' : colors.secondary }]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  searchIconBtn: {
    padding: 4,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },

  chipRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipCountText: {
    fontSize: 10,
    fontWeight: '700',
  },

  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  projectNumber: {
    fontSize: 11,
    fontWeight: '600',
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
  },
  projectClient: {
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12 },
});
