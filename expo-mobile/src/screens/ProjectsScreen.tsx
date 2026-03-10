import { useState, useEffect, useCallback, useRef } from 'react';
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
  Dimensions,
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

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ProjectsScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const pagerRef = useRef<FlatList>(null);
  const indicatorAnim = useRef(new Animated.Value(0)).current;

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', inputBg: '#1e293b' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', inputBg: '#f1f5f9' };

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

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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

  const getFilteredProjects = (phaseKey: string) => {
    let filtered = projects;
    if (phaseKey !== 'all') {
      filtered = filtered.filter(p => p.currentSystemPhase === phaseKey);
    }
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
      const jnA = a.jobNumber || a.projectNumber || '';
      const jnB = b.jobNumber || b.projectNumber || '';
      if (jnA && jnB) {
        const cmp = jnA.localeCompare(jnB, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
      } else if (jnA) {
        return -1;
      } else if (jnB) {
        return 1;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  };

  const getPhaseCount = (phaseKey: string) => {
    if (phaseKey === 'all') return projects.length;
    return projects.filter(p => p.currentSystemPhase === phaseKey).length;
  };

  const onTabPress = (index: number) => {
    setActiveIndex(index);
    pagerRef.current?.scrollToIndex({ index, animated: true });
    Animated.spring(indicatorAnim, {
      toValue: index,
      useNativeDriver: true,
      tension: 68,
      friction: 12,
    }).start();
  };

  const onPageScroll = (e: any) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = offset / SCREEN_WIDTH;
    indicatorAnim.setValue(index);
  };

  const onMomentumScrollEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const tabWidth = SCREEN_WIDTH / phases.length;
  const indicatorTranslateX = indicatorAnim.interpolate({
    inputRange: phases.map((_, i) => i),
    outputRange: phases.map((_, i) => i * tabWidth),
  });

  const renderProjectCard = (item: Project) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.projectCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, projectName: item.name })}
      activeOpacity={0.7}
    >
      <View style={styles.projectTop}>
        <View style={styles.projectNameRow}>
          {item.projectNumber && (
            <Text style={[styles.projectNumber, { color: colors.accent }]}>#{item.projectNumber}</Text>
          )}
          <Text style={[styles.projectName, { color: colors.text }]}>{item.name}</Text>
        </View>
        <View style={[styles.phaseBadge, { backgroundColor: getPhaseColor(item.currentSystemPhase) + '20' }]}>
          <Text style={[styles.phaseBadgeText, { color: getPhaseColor(item.currentSystemPhase) }]}>
            {getPhaseLabel(item.currentSystemPhase)}
          </Text>
        </View>
      </View>
      {item.clientName && (
        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={13} color={colors.secondary} />
          <Text style={[styles.detailText, { color: colors.secondary }]}>{item.clientName}</Text>
        </View>
      )}
      {item.address && (
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={13} color={colors.secondary} />
          <Text style={[styles.detailText, { color: colors.secondary }]}>{item.address}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.searchContainer, { backgroundColor: colors.bg }]}>
        <View style={[styles.searchInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.secondary} />
          <TextInput
            style={[styles.searchText, { color: colors.text }]}
            placeholder="Search projects..."
            placeholderTextColor={colors.secondary}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {phases.map((phase, index) => (
          <TouchableOpacity
            key={phase.key}
            style={styles.tab}
            onPress={() => onTabPress(index)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeIndex === index ? colors.accent : colors.secondary },
              ]}
              numberOfLines={1}
            >
              {phase.label}
            </Text>
            <Text
              style={[
                styles.tabCount,
                { color: activeIndex === index ? colors.accent : colors.secondary },
              ]}
            >
              {getPhaseCount(phase.key)}
            </Text>
          </TouchableOpacity>
        ))}
        <Animated.View
          style={[
            styles.tabIndicator,
            {
              backgroundColor: colors.accent,
              width: tabWidth - 16,
              transform: [{ translateX: Animated.add(indicatorTranslateX, 8) }],
            },
          ]}
        />
      </View>

      <FlatList
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={phases}
        keyExtractor={(item) => item.key}
        onScroll={onPageScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        renderItem={({ item: phase }) => {
          const phaseProjects = getFilteredProjects(phase.key);
          return (
            <View style={{ width: SCREEN_WIDTH }}>
              <FlatList
                data={phaseProjects}
                keyExtractor={(p) => p.id}
                contentContainerStyle={styles.list}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
                }
                renderItem={({ item }) => renderProjectCard(item)}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={48} color={colors.secondary} />
                    <Text style={[styles.emptyText, { color: colors.secondary }]}>
                      {search ? 'No projects match your search' : `No ${phase.label.toLowerCase()} projects`}
                    </Text>
                  </View>
                }
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  searchContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchText: { flex: 1, fontSize: 15, paddingVertical: 10 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    position: 'relative',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabCount: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
  },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  projectCard: {
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  projectTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  projectNameRow: { flex: 1, gap: 2 },
  projectNumber: { fontSize: 11, fontWeight: '600' },
  projectName: { fontSize: 15, fontWeight: '600' },
  phaseBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  phaseBadgeText: { fontSize: 11, fontWeight: '500' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  detailText: { fontSize: 13 },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12 },
});
