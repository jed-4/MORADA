import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface SiteDiaryEntry {
  id: string;
  templateId: string;
  templateName?: string;
  projectId: string;
  title: string;
  entryDateTime: string;
  fieldValues: Record<string, any>;
  attachments?: any[];
  overallPhotos?: string[];
  weather?: { temp?: number; condition?: string; humidity?: number; wind?: number; icon?: string };
  labels?: string[];
  createdBy?: string;
  createdByName?: string;
  shareWithClient?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  jobNumber?: string;
  currentSystemPhase?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

function formatDayHeader(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${d.getMinutes().toString().padStart(2, '0')} ${period}`;
}

function getDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function getWeatherIcon(condition?: string): string {
  if (!condition) return 'partly-sunny-outline';
  const c = condition.toLowerCase();
  if (c.includes('rain') || c.includes('shower')) return 'rainy-outline';
  if (c.includes('cloud') || c.includes('overcast')) return 'cloudy-outline';
  if (c.includes('sun') || c.includes('clear') || c.includes('fine')) return 'sunny-outline';
  if (c.includes('storm') || c.includes('thunder')) return 'thunderstorm-outline';
  if (c.includes('wind')) return 'flag-outline';
  if (c.includes('snow') || c.includes('hail')) return 'snow-outline';
  return 'partly-sunny-outline';
}

function countPhotos(entry: SiteDiaryEntry): number {
  let count = 0;
  if (entry.overallPhotos) count += entry.overallPhotos.length;
  if (entry.fieldValues) {
    Object.values(entry.fieldValues).forEach((val) => {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && (val[0].startsWith('http') || val[0].startsWith('file') || val[0].startsWith('/'))) {
        count += val.length;
      }
    });
  }
  return count;
}

const SWIPE_THRESHOLD = 50;
const SCREEN_WIDTH = Dimensions.get('window').width;

export default function SiteDiaryListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<SiteDiaryEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6', muted: '#475569' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb', muted: '#cbd5e1' };

  const goToDay = useCallback((direction: number) => {
    const toValue = direction > 0 ? -SCREEN_WIDTH : SCREEN_WIDTH;
    Animated.timing(translateX, { toValue, duration: 150, useNativeDriver: true }).start(() => {
      setCurrentDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() + direction);
        return next;
      });
      translateX.setValue(direction > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH);
      Animated.timing(translateX, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    });
  }, [translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          goToDay(-1);
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          goToDay(1);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const fetchData = useCallback(async () => {
    try {
      const dateStr = getDateStr(currentDate);
      const [entriesData, projectsData] = await Promise.all([
        apiFetch<SiteDiaryEntry[]>(`/api/company/site-diary-entries?date=${dateStr}`).catch(() => []),
        apiFetch<Project[]>('/api/projects').catch(() => []),
      ]);
      setEntries(entriesData || []);
      setProjects(projectsData || []);
    } catch (e) {
      console.error('Failed to fetch diary data:', e);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const projectMap = new Map<string, Project>();
  projects.forEach(p => projectMap.set(p.id, p));

  const groupedByProject = new Map<string, SiteDiaryEntry[]>();
  entries.forEach(entry => {
    const key = entry.projectId;
    if (!groupedByProject.has(key)) groupedByProject.set(key, []);
    groupedByProject.get(key)!.push(entry);
  });

  const sortedProjectIds = Array.from(groupedByProject.keys()).sort((a, b) => {
    const pA = projectMap.get(a);
    const pB = projectMap.get(b);
    const nameA = pA ? (pA.jobNumber ? `${pA.jobNumber} - ${pA.name}` : pA.name) : a;
    const nameB = pB ? (pB.jobNumber ? `${pB.jobNumber} - ${pB.name}` : pB.name) : b;
    return nameA.localeCompare(nameB);
  });

  const getProjectLabel = (projectId: string): string => {
    const p = projectMap.get(projectId);
    if (!p) return 'Unknown Project';
    return p.jobNumber ? `${p.jobNumber} - ${p.name}` : p.name;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Site Diary</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={[styles.dayNav, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => goToDay(-1)} style={styles.navArrow}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToToday} style={styles.dayInfo}>
          <Text style={[styles.dayLabel, { color: colors.text }]}>
            {isToday(currentDate) ? 'Today' : formatDayHeader(currentDate)}
          </Text>
          {isToday(currentDate) && (
            <Text style={[styles.dayDate, { color: colors.secondary }]}>
              {formatDayHeader(currentDate)}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goToDay(1)} style={styles.navArrow}>
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[styles.content, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
          >
            {entries.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={56} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.secondary }]}>
                  No diary entries
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.muted }]}>
                  No site diary entries were recorded on this day.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.summaryBar}>
                  <Text style={[styles.summaryText, { color: colors.secondary }]}>
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'} across {sortedProjectIds.length} {sortedProjectIds.length === 1 ? 'project' : 'projects'}
                  </Text>
                </View>

                {sortedProjectIds.map(projectId => {
                  const projectEntries = groupedByProject.get(projectId) || [];
                  return (
                    <View key={projectId} style={styles.projectGroup}>
                      <View style={[styles.projectHeader, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                        <Ionicons name="briefcase-outline" size={16} color={colors.accent} />
                        <Text style={[styles.projectName, { color: colors.text }]} numberOfLines={1}>
                          {getProjectLabel(projectId)}
                        </Text>
                        <View style={[styles.countBadge, { backgroundColor: colors.accent }]}>
                          <Text style={styles.countBadgeText}>{projectEntries.length}</Text>
                        </View>
                      </View>

                      {projectEntries.map(entry => (
                        <TouchableOpacity
                          key={entry.id}
                          style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                          activeOpacity={0.7}
                          onPress={() => {
                            navigation.navigate('Projects', {
                              screen: 'SiteDiary',
                              params: { projectId: entry.projectId, projectName: getProjectLabel(entry.projectId) },
                            });
                          }}
                        >
                          <View style={styles.entryTop}>
                            <Text style={[styles.entryTitle, { color: colors.text }]} numberOfLines={1}>
                              {entry.title}
                            </Text>
                            <Text style={[styles.entryTime, { color: colors.secondary }]}>
                              {formatTime(entry.entryDateTime)}
                            </Text>
                          </View>

                          <View style={styles.entryMeta}>
                            {entry.weather?.condition && (
                              <View style={styles.metaItem}>
                                <Ionicons
                                  name={getWeatherIcon(entry.weather.condition) as any}
                                  size={14}
                                  color={colors.secondary}
                                />
                                <Text style={[styles.metaText, { color: colors.secondary }]}>
                                  {entry.weather.condition}
                                  {entry.weather.temp != null ? ` ${entry.weather.temp}\u00B0C` : ''}
                                </Text>
                              </View>
                            )}

                            {countPhotos(entry) > 0 && (
                              <View style={styles.metaItem}>
                                <Ionicons name="camera-outline" size={14} color={colors.secondary} />
                                <Text style={[styles.metaText, { color: colors.secondary }]}>
                                  {countPhotos(entry)}
                                </Text>
                              </View>
                            )}

                            {entry.createdByName && (
                              <View style={styles.metaItem}>
                                <Ionicons name="person-outline" size={14} color={colors.secondary} />
                                <Text style={[styles.metaText, { color: colors.secondary }]} numberOfLines={1}>
                                  {entry.createdByName}
                                </Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 32,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  navArrow: {
    padding: 8,
  },
  dayInfo: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  dayDate: {
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  projectGroup: {
    marginBottom: 4,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
  },
  countBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  entryCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  entryTime: {
    fontSize: 12,
    fontWeight: '500',
  },
  entryMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
});
