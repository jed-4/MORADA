import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';
import { useTheme, fontSize, fontWeight, radius, type Theme } from '../theme';
import { haptic } from '../lib/haptics';
import { Sheet, SheetTextInput, type SheetRef } from './ui/Sheet';
import { useToast } from './ui/Toast';
import { SectionHeader } from './ui/SectionHeader';
import { PressableScale } from './ui/PressableScale';
import {
  workspaceItems,
  createItems,
  MORE_COLOR_BG,
  type MoreTile,
} from './more/items';

// The app's single More surface — a grouped bottom sheet over the tab bar.
// Content config lives in ./more/items.ts; the New Task sub-flow is a stacked
// sheet pushed on top. Settings is reached via the profile row; Log Out and
// Suggest an Idea live in the Dashboard avatar menu (kept away from the
// thumb-friendly bottom of this sheet).

interface MorePanelProps {
  visible: boolean;
  onClose: () => void;
  navigationRef: React.RefObject<any>;
  /**
   * Monotonic counter bumped by MainTabs on every More-tab press. Presenting
   * is keyed off this rather than the `visible` boolean so a state desync
   * (e.g. a dismissal whose onDismiss raced the toggle) can never leave the
   * tab dead — every press re-presents.
   */
  presentNonce?: number;
  /** Unread Messages count from MainTabs — shown as a pill on the Messages tile. */
  messagesUnread?: number;
}

function Tile({
  tile,
  unread,
  onPress,
}: {
  tile: MoreTile;
  unread?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const fg = tile.destructive ? theme.statusDanger : theme[tile.color];
  const bg = tile.destructive
    ? theme.statusDangerBg
    : theme[MORE_COLOR_BG[tile.color] as keyof Theme];
  const showBadge = tile.showUnreadBadge && (unread ?? 0) > 0;

  return (
    <PressableScale haptics onPress={onPress} style={styles.tile}>
      <View style={[styles.iconCircle, { backgroundColor: bg }]}>
        <Ionicons name={tile.icon} size={24} color={fg} />
        {showBadge && (
          <View style={[styles.unreadPill, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadText}>{unread! > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.tileLabel,
          { color: tile.destructive ? theme.statusDanger : theme.textPrimary },
        ]}
        numberOfLines={2}
      >
        {tile.label}
      </Text>
    </PressableScale>
  );
}

export default function MorePanel({
  visible,
  onClose,
  navigationRef,
  presentNonce = 0,
  messagesUnread = 0,
}: MorePanelProps) {
  const theme = useTheme();
  const toast = useToast();
  const { user } = useAuth();

  const sheetRef = useRef<SheetRef>(null);
  const taskSheetRef = useRef<SheetRef>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Every tab press re-presents (present on an already-open sheet is a no-op).
  useEffect(() => {
    if (presentNonce > 0) sheetRef.current?.present();
  }, [presentNonce]);

  useEffect(() => {
    if (!visible) sheetRef.current?.dismiss();
  }, [visible]);

  const goToMoreScreen = (screen: string, params?: Record<string, unknown>) => {
    sheetRef.current?.dismiss();
    navigationRef.current?.navigate('More', params ? { screen, params } : { screen });
  };

  const runAction = (tile: MoreTile) => {
    const action = tile.action;
    switch (action.type) {
      case 'more-screen':
        goToMoreScreen(action.screen, action.params);
        break;
      case 'tab':
        sheetRef.current?.dismiss();
        navigationRef.current?.navigate(action.tab);
        break;
      case 'sheet':
        setTaskTitle('');
        setTaskDescription('');
        taskSheetRef.current?.present();
        break;
    }
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) {
      toast.error('Please enter a task title.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/notes', 'POST', {
        title: taskTitle.trim(),
        content: taskDescription.trim() || taskTitle.trim(),
        type: 'task',
        status: 'todo',
        scope: 'personal',
        category: 'General',
        priority: 'medium',
      });
      haptic.success();
      taskSheetRef.current?.dismiss();
      sheetRef.current?.dismiss();
      toast.success('Task created');
    } catch (error) {
      // Keep the sheet open with the entered text so nothing is lost.
      toast.error(error instanceof Error ? error.message : 'Failed to save task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const displayName =
    user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email;

  const inputStyle = {
    backgroundColor: theme.background,
    color: theme.textPrimary,
    borderColor: theme.border,
  };

  return (
    <>
      <Sheet ref={sheetRef} scrollable onDismiss={onClose}>
        {user && (
          <Animated.View entering={FadeInDown.duration(300)}>
            <PressableScale
              haptics
              onPress={() => goToMoreScreen('Settings')}
              style={[styles.profileRow, { borderBottomColor: theme.border }]}
            >
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarText}>
                  {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text
                  style={[styles.profileEmail, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </PressableScale>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.section}>
          <SectionHeader title="Workspace" />
          <View style={styles.grid}>
            {workspaceItems.map((tile) => (
              <Tile
                key={tile.id}
                tile={tile}
                unread={messagesUnread}
                onPress={() => runAction(tile)}
              />
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(120)} style={styles.section}>
          <SectionHeader title="Create" />
          <View style={styles.grid}>
            {createItems.map((tile) => (
              <Tile key={tile.id} tile={tile} onPress={() => runAction(tile)} />
            ))}
          </View>
        </Animated.View>
      </Sheet>

      <Sheet ref={taskSheetRef} title="New Task" stackBehavior="push">
        <View style={styles.form}>
          <SheetTextInput
            style={[styles.input, inputStyle]}
            value={taskTitle}
            onChangeText={setTaskTitle}
            placeholder="Task title"
            placeholderTextColor={theme.textMuted}
            autoFocus
          />
          <SheetTextInput
            style={[styles.textArea, inputStyle]}
            value={taskDescription}
            onChangeText={setTaskDescription}
            placeholder="Description (optional)"
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
          />
          <PressableScale
            haptics
            disabled={saving}
            onPress={saveTask}
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Create Task</Text>
            )}
          </PressableScale>
        </View>
      </Sheet>

    </>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  profileInfo: {
    flex: 1,
    marginRight: 8,
  },
  profileName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  profileEmail: {
    fontSize: fontSize.bodySm,
    marginTop: 2,
  },
  section: {
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
  },
  tile: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.xxl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  unreadPill: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: fontSize.data,
    fontWeight: fontWeight.bold,
  },
  tileLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  form: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
    marginBottom: 12,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
    height: 120,
  },
  submitBtn: {
    marginTop: 16,
    borderRadius: radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
