import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  projectName?: string;
  linkUrl?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function getNotifIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'task_assigned': return 'checkbox-outline';
    case 'task_completed': return 'checkmark-circle-outline';
    case 'mention': return 'at-outline';
    case 'reminder': return 'alarm-outline';
    case 'timesheet_submitted': return 'time-outline';
    case 'timesheet_approved': return 'checkmark-done-outline';
    default: return 'notifications-outline';
  }
}

export default function NotificationsScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', unread: '#1e2d45' }
    : { bg: '#ffffff', card: '#f5f5f4', text: '#1c1917', secondary: '#78716c', border: '#e7e5e4', accent: '#9b7fc4', muted: '#d6d3d1', unread: '#f3f0ff' };

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<Notification[]>('/api/notifications?limit=100').catch(() => []);
      setNotifications(data || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: unreadCount > 0
        ? () => (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              style={{ marginRight: 4, paddingHorizontal: 10, paddingVertical: 6 }}
              disabled={markingAll}
            >
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
                {markingAll ? 'Marking...' : 'Mark all read'}
              </Text>
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [unreadCount, markingAll, colors.accent]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await apiRequest('/api/notifications/mark-all-read', 'POST');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll]);

  const handleTap = useCallback(async (notif: Notification) => {
    if (!notif.isRead) {
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n)
      );
      apiRequest(`/api/notifications/${notif.id}/read`, 'PATCH').catch(() => {});
    }
    if (notif.type === 'task_assigned' || notif.type === 'task_completed') {
      navigation.navigate('More', { screen: 'Tasks' });
    } else if (notif.type === 'reminder') {
      navigation.navigate('Calendar');
    } else if (notif.type.startsWith('timesheet_')) {
      navigation.navigate('Timesheets');
    }
  }, [navigation]);

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (notifications.length === 0) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg }]}>
        <Ionicons name="notifications-off-outline" size={48} color={colors.muted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications</Text>
        <Text style={[styles.emptyMsg, { color: colors.secondary }]}>You're all caught up</Text>
      </View>
    );
  }

  const unread = notifications.filter(n => !n.isRead);
  const read = notifications.filter(n => n.isRead);

  type ListRow =
    | { kind: 'header'; key: string; label: string }
    | { kind: 'item'; key: string; item: Notification };

  const rows: ListRow[] = [
    ...(unread.length > 0 ? [{ kind: 'header' as const, key: 'header-unread', label: `Unread (${unread.length})` }] : []),
    ...unread.map(n => ({ kind: 'item' as const, key: n.id, item: n })),
    ...(read.length > 0 ? [{ kind: 'header' as const, key: 'header-read', label: 'Earlier' }] : []),
    ...read.map(n => ({ kind: 'item' as const, key: n.id, item: n })),
  ];

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={r => r.key}
      renderItem={({ item: row }) => {
        if (row.kind === 'header') {
          return (
            <Text style={[styles.sectionLabel, { color: colors.secondary }]}>{row.label}</Text>
          );
        }
        const notif = row.item;
        return (
          <TouchableOpacity
            onPress={() => handleTap(notif)}
            activeOpacity={0.7}
            style={[
              styles.row,
              { backgroundColor: notif.isRead ? colors.card : colors.unread, borderColor: colors.border },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.accent + (notif.isRead ? '30' : 'ff') }]}>
              <Ionicons
                name={getNotifIcon(notif.type)}
                size={16}
                color={notif.isRead ? colors.accent : '#ffffff'}
              />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                {notif.title}
              </Text>
              {notif.message ? (
                <Text style={[styles.rowMsg, { color: colors.secondary }]} numberOfLines={2}>
                  {notif.message}
                </Text>
              ) : null}
              <View style={styles.rowMeta}>
                {notif.projectName ? (
                  <Text style={[styles.projectTag, { color: colors.accent }]} numberOfLines={1}>
                    {notif.projectName}
                  </Text>
                ) : null}
                <Text style={[styles.rowTime, { color: colors.muted }]}>
                  {formatTimeAgo(notif.createdAt)}
                </Text>
              </View>
            </View>
            {!notif.isRead && (
              <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyMsg: {
    fontSize: 14,
  },
  list: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowMsg: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  projectTag: {
    fontSize: 12,
    fontWeight: '500',
  },
  rowTime: {
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
});
