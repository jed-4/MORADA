import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, CloudOff } from 'lucide-react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiFetch } from '../services/api';
import { getCached } from '../services/cache';
import { compactAgo } from '../lib/format';
import { haptic } from '../lib/haptics';
import { Avatar, Card, EmptyState, PageHeader, fallbackProjectColor } from '../components/kit';
import { SkeletonList } from '../components/ui/Skeleton';
import { readableFrame } from '../components/ui/ReadableColumn';
import { fonts, metrics, space, tabular, type, useColors } from '../theme';

// Full "Recent activity" list — where the Workspace section's › goes.
// Same rows as the Workspace card; a row with a project opens that project.

interface ActivityItem {
  id: string;
  description: string;
  userName?: string;
  projectId?: string;
  createdAt: string;
}

const LIMIT = 100;

export default function ActivityScreen({ navigation }: { navigation: NativeStackNavigationProp<any> }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [names, setNames] = useState<Record<string, { name: string; color?: string | null }>>(() => {
    const cached = getCached<{ id: string; name: string; color?: string | null }[]>('projects') || [];
    return Object.fromEntries(cached.map(p => [p.id, { name: p.name, color: p.color }]));
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [acts, projects] = await Promise.all([
        apiFetch<ActivityItem[]>(`/api/activities?limit=${LIMIT}`),
        apiFetch<{ id: string; name: string; color?: string | null }[]>('/api/projects').catch(() => null),
      ]);
      setItems(acts || []);
      if (projects) setNames(Object.fromEntries(projects.map(p => [p.id, { name: p.name, color: p.color }])));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openProject = (projectId: string) => {
    haptic.light();
    const tabNav = navigation.getParent<NativeStackNavigationProp<any>>() ?? navigation;
    tabNav.navigate('Projects', { screen: 'ProjectDetail', params: { projectId, projectName: names[projectId]?.name } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.list, readableFrame, { paddingTop: insets.top + metrics.schedule.top, paddingBottom: space.screenBottom + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        <PageHeader title="Recent activity" onBack={() => navigation.goBack()} />
        {loading ? (
          <SkeletonList count={8} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon={failed ? CloudOff : Activity}
              title={failed ? "Couldn't load activity" : 'No recent activity'}
              helper={failed ? 'Check your connection, then pull down to try again.' : undefined}
            />
          </View>
        ) : (
          <Card variant="list">
            {items.map(a => {
              const who = a.userName || 'System';
              const project = a.projectId ? names[a.projectId] : undefined;
              const color = a.projectId ? project?.color || fallbackProjectColor(a.projectId) : null;
              const body = (
                <>
                  <Avatar size="activity" name={who} color={color} />
                  <View style={styles.body}>
                    <Text style={[type.body, { color: c.text }]} numberOfLines={3}>
                      <Text style={{ fontFamily: fonts.semibold }}>{who}</Text>
                      {` ${a.description}`}
                    </Text>
                    {project ? <Text style={[type.caption, { color: c.muted }]} numberOfLines={1}>{project.name}</Text> : null}
                  </View>
                  <Text style={[type.meta, tabular, { color: c.mutedStrong }]}>{compactAgo(a.createdAt)}</Text>
                </>
              );
              return a.projectId ? (
                <Pressable
                  key={a.id}
                  onPress={() => openProject(a.projectId!)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
                >
                  {body}
                </Pressable>
              ) : (
                <View key={a.id} style={styles.row}>{body}</View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const A = metrics.workspace.activityRow;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: space.screenX, gap: metrics.scope.gap },
  empty: { paddingTop: space.screenBottom },
  row: { flexDirection: 'row', alignItems: 'center', gap: A.gap, paddingVertical: A.padY },
  body: { flex: 1, gap: metrics.listRow.bodyGap },
});
