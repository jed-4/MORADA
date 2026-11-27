import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, CircleQuestionMark, LogOut, Palette, Settings, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';
import { useColors, metrics, size, space, tabular, type } from '../theme';
import { Avatar, CaptureChip, Card, PrimaryButton, SheetBody, TextField } from './kit';
import { SuggestionSheet } from './more/SuggestionSheet';
import { haptic } from '../lib/haptics';
import { DESIGN_PREVIEW } from '../lib/designPreview';
import { Sheet, type SheetRef } from './ui/Sheet';
import { useToast } from './ui/Toast';
import { usePermission } from '../lib/usePermission';
import { workspaceItems, createItems, type MoreTile } from './more/items';

// The app's single More surface: a bottom sheet over the tab bar (design P06).
// Content config lives in ./more/items.ts; the New Task sub-flow is a stacked
// sheet pushed on top. Settings, Help & feedback and Sign out sit in the
// bottom card.

export interface MorePanelHandle {
  present: () => void;
}

interface MorePanelProps {
  navigationRef: React.RefObject<any>;
  /** Mirrors open/closed state up to MainTabs purely so the tab icon can fill. */
  onVisibilityChange?: (visible: boolean) => void;
  /** Unread Messages count from MainTabs — shown as a pill on the Messages tile. */
  messagesUnread?: number;
}

function Row({ icon: Glyph, label, count, muted, onPress }: { icon: LucideIcon; label: string; count?: number | null; muted?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => { haptic.light(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      style={({ pressed }) => [mx.row, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
    >
      <Glyph size={mx_icon} color={c.icon} strokeWidth={metrics.iconStroke} />
      <Text style={[type.rowTitle, mx.label, { color: muted ? c.muted : c.text }]} numberOfLines={1}>{label}</Text>
      {count ? <Text style={[type.meta, tabular, { color: c.muted }]}>{count}</Text> : null}
      {muted ? null : <ChevronRight size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} />}
    </Pressable>
  );
}

const mx_icon = size.icon.header;

const MorePanel = forwardRef<MorePanelHandle, MorePanelProps>(function MorePanel({
  navigationRef,
  onVisibilityChange,
  messagesUnread = 0,
}, ref) {
  const toast = useToast();
  const { user, logout } = useAuth();
  const k = useColors();
  const suggestionSheetRef = useRef<SheetRef>(null);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to use Morada on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          sheetRef.current?.dismiss();
          logout();
        },
      },
    ]);
  };
  // The Selections tile is only offered to roles that can view selections.
  const canViewSelections = usePermission('projects.selections');
  const canViewDefects = usePermission('projects.defects');

  const sheetRef = useRef<SheetRef>(null);
  const taskSheetRef = useRef<SheetRef>(null);
  const descRef = useRef<any>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // The tab press calls this directly. Presenting imperatively (rather than
  // setting state and reacting to it in an effect) means there is no state to
  // fall out of sync with the sheet — the previous prop/effect round-trip could
  // leave the tab dead for a tap or two after a swipe-dismiss.
  useImperativeHandle(ref, () => ({
    present: () => {
      onVisibilityChange?.(true);
      sheetRef.current?.present();
    },
  }), [onVisibilityChange]);

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

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email;

  return (
    <>
      <Sheet ref={sheetRef} scrollable onDismiss={() => onVisibilityChange?.(false)}>
        <View style={mx.body}>
          {user ? (
            <Pressable
              onPress={() => { haptic.light(); goToMoreScreen('Settings'); }}
              accessibilityRole="button"
              accessibilityLabel={`${displayName}, open settings`}
              style={({ pressed }) => [mx.profile, { borderBottomColor: k.border, opacity: pressed ? metrics.pressedOpacity : 1 }]}
            >
              <Avatar name={user.firstName || user.email} size="profile" />
              <View style={mx.profileText}>
                <Text style={[type.sheetTitle, { color: k.text }]} numberOfLines={1}>{displayName}</Text>
                <Text style={[type.meta, { color: k.muted }]} numberOfLines={1}>{user.email}</Text>
              </View>
              <ChevronRight size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />
            </Pressable>
          ) : null}

          <View style={mx.chips}>
            {createItems.map((tile) => (
              <CaptureChip key={tile.id} variant="sheet" icon={tile.icon} label={tile.label} onPress={() => runAction(tile)} style={mx.chip} />
            ))}
          </View>

          <Card variant="list">
            {workspaceItems
              .filter((tile) => tile.id !== 'selections' || canViewSelections)
              .filter((tile) => tile.id !== 'my-defects' || canViewDefects)
              .map((tile) => (
                <Row key={tile.id} icon={tile.icon} label={tile.label} onPress={() => runAction(tile)} />
              ))}
            {DESIGN_PREVIEW ? (
              <Row key="design-preview" icon={Palette} label="Design preview" onPress={() => goToMoreScreen('DesignPreview')} />
            ) : null}
          </Card>

          <Card variant="list">
            <Row key="settings" icon={Settings} label="Settings" onPress={() => goToMoreScreen('Settings')} />
            <Row
              key="help"
              icon={CircleQuestionMark}
              label="Help & feedback"
              onPress={() => {
                sheetRef.current?.dismiss();
                setTimeout(() => suggestionSheetRef.current?.present(), metrics.sheetSwapMs);
              }}
            />
            <Row key="signout" icon={LogOut} label="Sign out" muted onPress={confirmSignOut} />
          </Card>
        </View>
      </Sheet>

      <Sheet
        ref={taskSheetRef}
        title="New task"
        stackBehavior="push"
        // Create button pinned at the bottom, above the keyboard.
        footer={<PrimaryButton label="Create task" onPress={saveTask} loading={saving} disabled={!taskTitle.trim()} />}
      >
        <SheetBody>
          <TextField
            inSheet
            value={taskTitle}
            onChangeText={setTaskTitle}
            placeholder="Task title"
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => descRef.current?.focus()}
            accessibilityLabel="Task title"
          />
          <TextField
            inSheet
            multilineBox
            ref={descRef}
            autoCapitalize="sentences"
            value={taskDescription}
            onChangeText={setTaskDescription}
            placeholder="Description (optional)"
            accessibilityLabel="Description"
          />
        </SheetBody>
      </Sheet>

      <SuggestionSheet ref={suggestionSheetRef} sourcePage="more-sheet" />
    </>
  );
});

export default MorePanel;


const M = metrics.more;

const mx = StyleSheet.create({
  body: { paddingHorizontal: space.screenX, gap: M.gap },
  profile: { flexDirection: 'row', alignItems: 'center', gap: M.rowGap, minHeight: M.profileHeight, paddingBottom: M.profilePadBottom, borderBottomWidth: size.border },
  profileText: { flex: 1, gap: M.profileTextGap },
  chips: { flexDirection: 'row', gap: M.chipGap },
  // Three equal chips; minWidth 0 lets them share a narrow phone.
  chip: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: M.rowGap, minHeight: M.rowHeight, paddingVertical: M.rowPadY },
  label: { flex: 1 },
});
