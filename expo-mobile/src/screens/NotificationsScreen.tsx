import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useIsFocused } from '@react-navigation/native';
import { apiFetch, apiRequest } from '../services/api';
import { usePolling } from '../lib/usePolling';
import { timeAgo } from '../lib/format';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { resolveNotificationTarget } from '../navigation/notificationRouting';

import { useTheme } from '../theme';
interface Notification {
  id: string;
  type: string;
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  projectName?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

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

  const theme = useTheme();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
    unread: theme.subtle,
};

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const isFocused = useIsFocused();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<Notification[]>('/api/notifications?limit=100');
      setNotifications(data || []);
      setLoadError(false);
    } catch {
      // Keep any previously loaded list; only the error state changes.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Live updates: poll while the screen is focused and the app foregrounded
  // (fires immediately on focus), plus refetch when a push arrives.
  usePolling(fetchNotifications, 20000, isFocused);

  useEffect(() => {
    if (!isFocused) return;
    const sub = Notifications.addNotificationReceivedListener(() => {
      fetchNotifications();
    });
    return () => sub.remove();
  }, [isFocused, fetchNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    const previous = notifications;
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await apiRequest('/api/notifications/mark-all-read', 'POST');
    } catch {
      setNotifications(previous);
      Alert.alert('Error', 'Could not mark notifications as read. Please try again.');
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, notifications]);

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
  }, [unreadCount, markingAll, colors.accent, handleMarkAllRead]);

  const handleTap = useCallback(async (notif: Notification) => {
    if (!notif.isRead) {
      setNotifications(prev =>
        prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n)
      );
      // Revert the optimistic flip if the server rejects it — the row will
      // show unread again next time the user returns to this screen.
      apiRequest(`/api/notifications/${notif.id}/read`, 'PATCH').catch(() => {
        setNotifications(prev =>
          prev.map(n => n.id === notif.id ? { ...n, isRead: false } : n)
        );
      });
    }
    const target = resolveNotificationTarget({
      type: notif.type,
      link: notif.link,
      entityType: notif.entityType,
      entityId: notif.entityId,
    });
    if (target.screen) {
      navigation.navigate(target.tab as any, { screen: target.screen, params: target.params });
    } else {
      navigation.navigate(target.tab as any);
    }
  }, [navigation]);

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (loadError && notifications.length === 0) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: colors.bg }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Couldn't load notifications</Text>
        <Text style={[styles.emptyMsg, { color: colors.secondary }]}>Check your connection and try again</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.accent }]}
          onPress={() => { setLoading(true); fetchNotifications(); }}
          activeOpacity={0.8}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
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
                  {timeAgo(notif.createdAt)}
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
  retryBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
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
