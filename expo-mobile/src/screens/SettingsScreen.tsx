import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiRequest } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { buildLabel } from '../lib/sentry';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

// Keep these group keys in sync with shared/notificationGroups.ts — the server
// gates push delivery using the same keys stored under this viewKey.
const PUSH_PREFS_VIEW_KEY = 'push-notification-prefs';

interface PushGroup {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const PUSH_GROUPS: PushGroup[] = [
  {
    key: 'tasks',
    label: 'Tasks & checklists',
    description: 'When a task or checklist is assigned, completed, or mentions you.',
    icon: 'checkbox-outline',
  },
  {
    key: 'messages',
    label: 'Messages & mentions',
    description: 'New chat messages and when someone mentions you.',
    icon: 'at-outline',
  },
  {
    key: 'notes',
    label: 'Notes & site diary',
    description: "When you're assigned to or mentioned in a note or site diary entry.",
    icon: 'document-text-outline',
  },
  {
    key: 'schedule',
    label: 'Schedule',
    description: 'When a schedule item is assigned to you or changes.',
    icon: 'calendar-outline',
  },
  {
    // Split on the web in the same change — the keys here must match
    // shared/notificationGroups.ts or a toggle silences nothing.
    key: 'timesheetsToApprove',
    label: 'Timesheets to approve',
    description: 'When someone submits a timesheet and you are able to approve it.',
    icon: 'time-outline',
  },
  {
    key: 'timesheetsMine',
    label: 'Your timesheets',
    description: 'When your own timesheet is approved or rejected, and overtime reminders.',
    icon: 'time-outline',
  },
  {
    key: 'payments',
    label: 'Payments & reimbursements',
    description: 'Updates on your expense reimbursements.',
    icon: 'card-outline',
  },
  {
    key: 'projects',
    label: 'Projects',
    description: "When you're added to a project.",
    icon: 'briefcase-outline',
  },
  {
    key: 'reminders',
    label: 'Reminders',
    description: 'Your scheduled reminders.',
    icon: 'alarm-outline',
  },
];

export default function SettingsScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [mutedGroups, setMutedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  const theme = useTheme();
  const { deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  // Two steps on purpose: deletion can't be undone. The server refuses the
  // only Owner of a company that still has a team, and we show its message.
  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      "This removes your login, name, email, phone and photo, and signs you out on every device. Timesheets, diary entries and other work you recorded stay with your company. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
            } catch (err: any) {
              setIsDeleting(false);
              Alert.alert("Couldn't delete account", err?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
  };

  useEffect(() => {
    apiFetch<{ preferences: { mutedGroups?: string[] } } | null>(
      `/api/user-view-preferences/${PUSH_PREFS_VIEW_KEY}`,
    )
      .then(data => {
        const muted = data?.preferences?.mutedGroups;
        if (Array.isArray(muted)) setMutedGroups(muted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Serialize saves so a fast tap sequence can't land an older mutedGroups
  // array after a newer one — each save waits for the previous to finish.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const savePreferences = useCallback((next: string[]) => {
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(() =>
        apiRequest('/api/user-view-preferences', 'POST', {
          viewKey: PUSH_PREFS_VIEW_KEY,
          preferences: { mutedGroups: next },
        }),
      )
      .catch(() => {});
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setMutedGroups(prev => {
      const next = prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key];
      savePreferences(next);
      return next;
    });
  }, [savePreferences]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.secondary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Push notifications</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.secondary }]}>
            Choose which alerts can show up on your phone. Turning one off stops those banners — you'll still see them in the app.
          </Text>

          {PUSH_GROUPS.map(group => {
            const enabled = !mutedGroups.includes(group.key);
            return (
              <View
                key={group.key}
                style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.itemIconWrap, { backgroundColor: colors.accent + '15' }]}>
                  <Ionicons name={group.icon} size={18} color={colors.accent} />
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemLabel, { color: colors.text }]}>{group.label}</Text>
                  <Text style={[styles.itemDescription, { color: colors.secondary }]}>
                    {group.description}
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={() => toggleGroup(group.key)}
                  trackColor={{ false: colors.muted, true: colors.accent + '80' }}
                  thumbColor={enabled ? colors.accent : isDark ? '#94a3b8' : '#f4f3f4'}
                  style={styles.switchStyle}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
          <TouchableOpacity
            style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={confirmDeleteAccount}
            disabled={isDeleting}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <View style={[styles.itemIconWrap, { backgroundColor: theme.statusDangerBg }]}>
              <Ionicons name="trash-outline" size={18} color={theme.statusDanger} />
            </View>
            <View style={styles.itemText}>
              <Text style={[styles.itemLabel, { color: theme.statusDanger }]}>Delete account</Text>
              <Text style={[styles.itemDescription, { color: colors.secondary }]}>
                Removes your login and personal details. Work you recorded stays with your company.
              </Text>
            </View>
            {isDeleting && <ActivityIndicator size="small" color={colors.secondary} />}
          </TouchableOpacity>
        </View>

        {/* Build identity. Every build so far has reported version "1.0.2", so
            nothing on screen distinguished build 13 from build 16 — which made
            "is the new build actually running?" unanswerable from the device. */}
        <Text style={[styles.buildInfo, { color: colors.secondary }]}>
          Morada {buildLabel}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  buildInfo: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 8,
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
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  backBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
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
    marginBottom: 16,
    lineHeight: 18,
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
  itemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemText: {
    flex: 1,
    paddingRight: 8,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  itemDescription: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  switchStyle: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
});
