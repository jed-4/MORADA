import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface ItemConfig {
  key: string;
  visible: boolean;
}

interface LayoutPreferences {
  tiles: ItemConfig[];
  sections: ItemConfig[];
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route?: any;
};

const TILE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  messages: { label: 'Messages', icon: 'chatbubble-outline' },
  activity: { label: 'Activity', icon: 'pulse-outline' },
  mentions: { label: 'Mentions', icon: 'at-outline' },
  assigned: { label: 'Assigned', icon: 'person-outline' },
};

const SECTION_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  todayTasks: { label: "Today's Tasks", icon: 'today-outline' },
  overdueTasks: { label: 'Overdue Tasks', icon: 'alert-circle-outline' },
  upcomingTasks: { label: 'Upcoming Tasks', icon: 'calendar-outline' },
  recentActivity: { label: 'Recent Activity', icon: 'pulse-outline' },
  calendar: { label: "Today's Calendar", icon: 'calendar-outline' },
  favourites: { label: 'Favourites', icon: 'star-outline' },
  timesheet: { label: 'Timesheet', icon: 'time-outline' },
};

const DEFAULT_TILES: ItemConfig[] = [
  { key: 'messages', visible: true },
  { key: 'activity', visible: true },
  { key: 'mentions', visible: true },
  { key: 'assigned', visible: true },
];

const DEFAULT_SECTIONS: ItemConfig[] = [
  { key: 'todayTasks', visible: true },
  { key: 'overdueTasks', visible: true },
  { key: 'upcomingTasks', visible: true },
  { key: 'recentActivity', visible: true },
  { key: 'calendar', visible: true },
  { key: 'favourites', visible: true },
  { key: 'timesheet', visible: true },
];

export default function CustomizeHomeScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [tiles, setTiles] = useState<ItemConfig[]>(DEFAULT_TILES);
  const [sections, setSections] = useState<ItemConfig[]>(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(true);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#3b82f6', muted: '#475569' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#2563eb', muted: '#cbd5e1' };

  useEffect(() => {
    apiFetch<{ preferences: LayoutPreferences } | null>('/api/user-view-preferences/mobile-dashboard-layout')
      .then(data => {
        if (data?.preferences) {
          if (data.preferences.tiles?.length) {
            const savedKeys = new Set(data.preferences.tiles.map(t => t.key));
            setTiles([...data.preferences.tiles, ...DEFAULT_TILES.filter(t => !savedKeys.has(t.key))]);
          }
          if (data.preferences.sections?.length) {
            const savedKeys = new Set(data.preferences.sections.map(s => s.key));
            setSections([...data.preferences.sections, ...DEFAULT_SECTIONS.filter(s => !savedKeys.has(s.key))]);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const savePreferences = useCallback((newTiles: ItemConfig[], newSections: ItemConfig[]) => {
    apiRequest('/api/user-view-preferences', 'POST', {
      viewKey: 'mobile-dashboard-layout',
      preferences: { tiles: newTiles, sections: newSections },
    }).catch(() => {});
  }, []);

  const toggleTile = useCallback((index: number) => {
    setTiles(prev => {
      const next = prev.map((t, i) => i === index ? { ...t, visible: !t.visible } : t);
      savePreferences(next, sections);
      return next;
    });
  }, [sections, savePreferences]);

  const toggleSection = useCallback((index: number) => {
    setSections(prev => {
      const next = prev.map((s, i) => i === index ? { ...s, visible: !s.visible } : s);
      savePreferences(tiles, next);
      return next;
    });
  }, [tiles, savePreferences]);

  const moveTile = useCallback((index: number, direction: -1 | 1) => {
    setTiles(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      savePreferences(next, sections);
      return next;
    });
  }, [sections, savePreferences]);

  const moveSection = useCallback((index: number, direction: -1 | 1) => {
    setSections(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      savePreferences(tiles, next);
      return next;
    });
  }, [tiles, savePreferences]);

  const renderItem = (
    item: ItemConfig,
    index: number,
    meta: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }>,
    total: number,
    onMove: (i: number, d: -1 | 1) => void,
    onToggle: (i: number) => void,
  ) => {
    const info = meta[item.key];
    if (!info) return null;
    return (
      <View key={item.key} style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="reorder-three-outline" size={22} color={colors.muted} style={styles.dragHandle} />
        <View style={[styles.itemIconWrap, { backgroundColor: colors.accent + '15' }]}>
          <Ionicons name={info.icon} size={18} color={colors.accent} />
        </View>
        <Text style={[styles.itemLabel, { color: colors.text }]}>{info.label}</Text>
        <View style={styles.itemActions}>
          <TouchableOpacity
            onPress={() => onMove(index, -1)}
            disabled={index === 0}
            style={styles.arrowBtn}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-up" size={18} color={index === 0 ? colors.border : colors.secondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onMove(index, 1)}
            disabled={index === total - 1}
            style={styles.arrowBtn}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-down" size={18} color={index === total - 1 ? colors.border : colors.secondary} />
          </TouchableOpacity>
          <Switch
            value={item.visible}
            onValueChange={() => onToggle(index)}
            trackColor={{ false: colors.muted, true: colors.accent + '80' }}
            thumbColor={item.visible ? colors.accent : isDark ? '#94a3b8' : '#f4f3f4'}
            style={styles.switchStyle}
          />
        </View>
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
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Customize Home</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={colors.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Customize tiles</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
            Hold and drag to reorder tiles in Home
          </Text>
          {tiles.map((item, i) => renderItem(item, i, TILE_META, tiles.length, moveTile, toggleTile))}
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Customize sections</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
            Hold and drag to reorder sections in Home
          </Text>
          {sections.map((item, i) => renderItem(item, i, SECTION_META, sections.length, moveSection, toggleSection))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionBlock: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  dragHandle: {
    marginRight: 10,
  },
  itemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    padding: 4,
  },
  switchStyle: {
    marginLeft: 4,
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
});
