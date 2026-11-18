import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TaskComments from '../TaskComments';
import { useTwoPaneDetail } from '../ui/TwoPane';
import { readableFrame } from '../ui/ReadableColumn';
import { currentTheme, MAX_FONT_SCALE } from '../../theme';

/**
 * One task's read-only view: title, status/priority, due date, project,
 * notes, assignees, checklist, tags, then comments + activity.
 *
 * Shared by My Tasks (TasksScreen) and a project's Tasks (ProjectTasksScreen),
 * and rendered in two places:
 *   - Phone / Duo folded: inside the task sheet or modal, as before.
 *   - Duo unfolded: in the right-hand panel of a TwoPane (TaskDetailPane).
 *
 * The pane copy stays mounted when the phone folds (TwoPane holds it full
 * width), so a half-typed comment in TaskComments survives the fold.
 */

export interface TaskDetailTask {
  id: string;
  title: string;
  content?: string;
  contentText?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assigneeNames?: string[];
  checklist?: { id: string; text: string; completed: boolean }[];
  tags?: string[];
}

export interface TaskDetailColors {
  bg: string;
  card: string;
  text: string;
  secondary: string;
  border: string;
  accent: string;
  muted: string;
}

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'urgent': return currentTheme().statusDanger;
    case 'high': return currentTheme().coral;
    case 'medium': return currentTheme().statusWarning;
    case 'low': return currentTheme().statusSuccess;
    default: return currentTheme().textMuted;
  }
}

export function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface TaskDetailProps {
  task: TaskDetailTask;
  statusLabel: string;
  statusColor: string;
  /** Shown as its own row when set (My Tasks spans projects). */
  projectName?: string;
  /** Heading over the task's notes — "Notes" or "Description". */
  descriptionLabel?: string;
  /** When given, checklist rows are tappable and show a done count. */
  onToggleChecklistItem?: (itemId: string) => void;
  colors: TaskDetailColors;
  isDark: boolean;
  currentUserId?: string;
  /** Rendered inside a bottom sheet: comment inputs use the sheet's keyboard handling. */
  inSheet?: boolean;
  /** Extra content after the comments (e.g. a delete button). */
  footer?: ReactNode;
}

export function TaskDetail({
  task,
  statusLabel,
  statusColor,
  projectName,
  descriptionLabel = 'Notes',
  onToggleChecklistItem,
  colors,
  isDark,
  currentUserId,
  inSheet,
  footer,
}: TaskDetailProps) {
  const description = stripHtml(task.contentText || task.content);
  const checklist = task.checklist || [];
  const assignees = task.assigneeNames || [];
  const tags = task.tags || [];
  const priorityColor = getPriorityColor(task.priority);

  return (
    <>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewTitle, { color: colors.text }]}>{task.title}</Text>

      <View style={styles.viewBadgeRow}>
        <View style={[styles.viewBadge, { backgroundColor: statusColor + '20' }]}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <View style={[styles.viewBadge, { backgroundColor: priorityColor + '20' }]}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewBadgeText, { color: priorityColor }]}>
            {PRIORITY_LABELS[task.priority || 'low'] || 'Low'}
          </Text>
        </View>
      </View>

      {task.dueDate ? (
        <View style={styles.viewField}>
          <Ionicons name="calendar-outline" size={18} color={colors.secondary} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewFieldText, { color: colors.text }]}>
            {new Date(task.dueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
      ) : null}

      {projectName ? (
        <View style={styles.viewField}>
          <Ionicons name="briefcase-outline" size={18} color={colors.secondary} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewFieldText, { color: colors.text }]}>{projectName}</Text>
        </View>
      ) : null}

      {description ? (
        <View style={styles.viewSection}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewSectionLabel, { color: colors.secondary }]}>{descriptionLabel}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewDescription, { color: colors.text }]}>{description}</Text>
        </View>
      ) : null}

      {assignees.length > 0 ? (
        <View style={styles.viewSection}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewSectionLabel, { color: colors.secondary }]}>Assignees</Text>
          {assignees.map((name, idx) => (
            <View key={idx} style={styles.assigneeRow}>
              <View style={[styles.assigneeAvatar, { backgroundColor: colors.accent }]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.assigneeAvatarText}>
                  {(name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.assigneeName, { color: colors.text }]}>{name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {checklist.length > 0 ? (
        <View style={styles.viewSection}>
          <View style={styles.checklistHeader}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewSectionLabel, { color: colors.secondary, marginBottom: 0 }]}>Checklist</Text>
            {onToggleChecklistItem ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.checklistProgress, { color: colors.muted }]}>
                {checklist.filter(i => i.completed).length}/{checklist.length}
              </Text>
            ) : null}
          </View>
          {checklist.map(item => {
            const body = (
              <>
                <Ionicons
                  name={item.completed ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={item.completed ? currentTheme().statusSuccess : colors.muted}
                />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[
                    styles.checklistText,
                    { color: item.completed ? colors.muted : colors.text },
                    item.completed && styles.strikethrough,
                  ]}
                >
                  {item.text}
                </Text>
              </>
            );
            return onToggleChecklistItem ? (
              <TouchableOpacity
                key={item.id}
                style={styles.checklistRow}
                onPress={() => onToggleChecklistItem(item.id)}
                activeOpacity={0.6}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.completed }}
              >
                {body}
              </TouchableOpacity>
            ) : (
              <View key={item.id} style={styles.checklistRow}>{body}</View>
            );
          })}
        </View>
      ) : null}

      {tags.length > 0 ? (
        <View style={styles.viewSection}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.viewSectionLabel, { color: colors.secondary }]}>Tags</Text>
          <View style={styles.tagsRow}>
            {tags.map((tag, idx) => (
              <View key={idx} style={[styles.tagBadge, { backgroundColor: colors.accent + '15' }]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.tagText, { color: colors.accent }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <TaskComments
        taskId={task.id}
        currentUserId={currentUserId}
        colors={colors}
        isDark={isDark}
        inSheet={inSheet}
      />

      {footer}
    </>
  );
}

interface TaskDetailPaneProps extends Omit<TaskDetailProps, 'inSheet'> {
  onEdit: () => void;
}

/**
 * The right-hand panel on a big screen: a small header with Edit, and the
 * task in a scroll view that keeps the focused comment box above the keyboard.
 * When the phone folds with this open, TwoPane keeps it mounted full width
 * with a floating back button top-left — the header leaves room for it.
 */
export function TaskDetailPane({ onEdit, ...detail }: TaskDetailPaneProps) {
  const { heldOnFold } = useTwoPaneDetail();
  const insets = useSafeAreaInsets();
  const { colors } = detail;
  return (
    <View style={styles.pane}>
      <View
        style={[
          styles.paneHeader,
          { borderBottomColor: colors.border, backgroundColor: colors.card },
          // Room for TwoPane's floating back button when held after a fold:
          // it sits at left 12, top insets.top + 6 (36pt), so line the
          // header row up beside it rather than under it.
          heldOnFold && { paddingLeft: 60, paddingTop: insets.top + 14 },
        ]}
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.paneHeaderTitle, { color: colors.text }]}>Task Details</Text>
        <TouchableOpacity
          onPress={onEdit}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Edit task"
        >
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.paneEdit, { color: colors.accent }]}>Edit</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.pane}
        contentContainerStyle={[styles.paneContent, readableFrame]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
      >
        <TaskDetail {...detail} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewTitle: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  viewBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  viewBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  viewBadgeText: { fontSize: 13, fontWeight: '600' },
  viewField: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  viewFieldText: { fontSize: 14, flexShrink: 1 },
  viewSection: { marginTop: 16 },
  viewSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  viewDescription: { fontSize: 14, lineHeight: 22 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  assigneeAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assigneeAvatarText: { color: '#ffffff', fontSize: 11, fontWeight: '600' },
  assigneeName: { fontSize: 14 },
  checklistHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  checklistProgress: { fontSize: 12, fontWeight: '600' },
  // 44pt rows: the whole row is the tap target for a tappable checklist.
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  checklistText: { fontSize: 14, flex: 1 },
  strikethrough: { textDecorationLine: 'line-through' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  tagText: { fontSize: 12, fontWeight: '500' },
  pane: { flex: 1 },
  paneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  paneHeaderTitle: { fontSize: 16, fontWeight: '700' },
  paneEdit: { fontSize: 15, fontWeight: '600' },
  paneContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
});
