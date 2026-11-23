import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ellipsis, Pencil } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TaskComments from '../TaskComments';
import { useTwoPaneDetail } from '../ui/TwoPane';
import { readableFrame } from '../ui/ReadableColumn';
import { currentTheme, metrics, radii, size, space, tabular, type, useColors } from '../../theme';
import { Avatar, Card, Checkbox, FieldLabel, ProjectSquare, PropertyRow } from '../kit';

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
  /** Project square colour for the Project row. */
  projectColor?: string | null;
  projectId?: string | null;
  /** Duo pane (D03): status + priority live in the properties card, not under the title. */
  pane?: boolean;
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
  projectColor,
  projectId,
  pane,
}: TaskDetailProps) {
  const c = useColors();
  const description = stripHtml(task.contentText || task.content);
  const checklist = task.checklist || [];
  const assignees = task.assigneeNames || [];
  const tags = task.tags || [];
  const due = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <View style={dx.wrap}>
      <View style={dx.titleBlock}>
        <Text style={[type.headingSemi, { color: c.text }]}>{task.title}</Text>
        {/* Status as dot + word; priority as a plain word (no coloured pills). */}
        {pane ? null : <View style={dx.statusLine}>
          <View style={[dx.dot, { backgroundColor: statusColor || c.status.upcoming }]} />
          <Text style={[type.meta, { color: c.text }]}>{statusLabel}</Text>
          <Text style={[type.meta, { color: c.muted }]}>{`· ${PRIORITY_LABELS[task.priority || 'low'] || 'Low'} priority`}</Text>
        </View>}
      </View>

      <Card variant="list">
        {pane ? (
          <PropertyRow key="status" label="Status" labelWidth={metrics.tasksPane.propLabel}>
            <View style={dx.statusLine}>
              <View style={[dx.dot, { backgroundColor: statusColor || c.status.upcoming }]} />
              <Text style={[type.body, { color: c.text }]}>{statusLabel}</Text>
            </View>
          </PropertyRow>
        ) : null}
        {pane ? (
          <PropertyRow key="priority" label="Priority" labelWidth={metrics.tasksPane.propLabel} value={PRIORITY_LABELS[task.priority || 'low'] || 'Low'} />
        ) : null}
        <PropertyRow key="due" label="Due date" labelWidth={pane ? metrics.tasksPane.propLabel : undefined} value={due} placeholder="No due date" />
        {projectName ? (
          <PropertyRow key="project" label="Project" labelWidth={pane ? metrics.tasksPane.propLabel : undefined}>
            <View style={dx.person}>
              <ProjectSquare color={projectColor ?? null} fallbackKey={projectId ?? projectName} />
              <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{projectName}</Text>
            </View>
          </PropertyRow>
        ) : null}
        {assignees.length > 0 ? (
          <PropertyRow key="assignees" label={assignees.length > 1 ? 'Assignees' : 'Assignee'} labelWidth={pane ? metrics.tasksPane.propLabel : undefined}>
            <View style={dx.people}>
              {assignees.map((name, idx) => (
                <View key={idx} style={dx.person}>
                  <Avatar name={name} size="chip" />
                  <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{name}</Text>
                </View>
              ))}
            </View>
          </PropertyRow>
        ) : null}
      </Card>

      {description ? (
        <View style={dx.group}>
          <FieldLabel>{descriptionLabel}</FieldLabel>
          <Card variant="notes">
            <Text style={[type.bodyRead, { color: c.textLong }]}>{description}</Text>
          </Card>
        </View>
      ) : null}

      {checklist.length > 0 ? (
        <View style={dx.group}>
          <View style={dx.labelRow}>
            <FieldLabel>Checklist</FieldLabel>
            <Text style={[type.meta, tabular, { color: c.muted }]}>
              {`${checklist.filter(i => i.completed).length}/${checklist.length}`}
            </Text>
          </View>
          <Card variant="list">
            {checklist.map(item => {
              const body = (
                <>
                  <Checkbox checked={item.completed} accessibilityLabel={item.text} />
                  <Text
                    style={[type.rowTitle, dx.itemText, { color: item.completed ? c.muted : c.text }, item.completed && dx.strike]}
                  >
                    {item.text}
                  </Text>
                </>
              );
              return onToggleChecklistItem ? (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [dx.itemRow, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
                  onPress={() => onToggleChecklistItem(item.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.completed }}
                >
                  {body}
                </Pressable>
              ) : (
                <View key={item.id} style={dx.itemRow}>{body}</View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {tags.length > 0 ? (
        <View style={dx.tags}>
          {tags.map((tag, idx) => (
            <View key={idx} style={[dx.tag, { backgroundColor: c.tint }]}>
              <Text style={[type.caption, { color: c.link }]}>{tag}</Text>
            </View>
          ))}
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
    </View>
  );
}

interface TaskDetailPaneProps extends Omit<TaskDetailProps, 'inSheet' | 'pane'> {
  onEdit: () => void;
  /** Offered in the More menu (red), never as a button in the page. */
  onDelete?: () => void;
  /** Muted line top-left, e.g. "Capture · created by Jed Smith, 18 Nov". */
  metaLine?: string;
}

/**
 * The right-hand panel on a big screen: a small header with Edit, and the
 * task in a scroll view that keeps the focused comment box above the keyboard.
 * When the phone folds with this open, TwoPane keeps it mounted full width
 * with a floating back button top-left — the header leaves room for it.
 */
export function TaskDetailPane({ onEdit, onDelete, metaLine, ...detail }: TaskDetailPaneProps) {
  const { heldOnFold } = useTwoPaneDetail();
  const insets = useSafeAreaInsets();
  const k = useColors();
  const more = () =>
    Alert.alert(detail.task.title, undefined, [
      { text: 'Edit', onPress: onEdit },
      ...(onDelete ? [{ text: 'Delete task', style: 'destructive' as const, onPress: onDelete }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  return (
    <View style={styles.pane}>
      {/* D03: muted context line · Edit · More (Delete lives in More). */}
      <View
        style={[
          styles.paneHeader,
          // Room for TwoPane's floating back button when held after a fold:
          // it sits at left 12, top insets.top + 6 (36pt), so line the
          // header row up beside it rather than under it.
          heldOnFold && { paddingLeft: metrics.tasksPane.heldPadLeft, paddingTop: insets.top + metrics.tasksPane.heldPadTop },
        ]}
      >
        <Text style={[type.meta, styles.flex, { color: k.muted }]} numberOfLines={1}>
          {metaLine ?? detail.statusLabel}
        </Text>
        <Pressable onPress={onEdit} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Edit task">
          <Pencil size={metrics.tasksPane.editIcon} color={k.icon} strokeWidth={metrics.iconStroke} />
        </Pressable>
        <Pressable onPress={more} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="More task actions">
          <Ellipsis size={size.icon.header} color={k.icon} strokeWidth={metrics.iconStroke} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.pane}
        contentContainerStyle={styles.paneContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
      >
        <TaskDetail {...detail} pane />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  flex: { flex: 1 },
  // D03 detail pane: padding 12/24/16/24.
  paneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.pageHeader.actionGap,
    paddingHorizontal: metrics.tasksPane.padX,
    paddingTop: metrics.tasksPane.padTop,
    paddingBottom: space.inline,
  },
  paneContent: { paddingHorizontal: metrics.tasksPane.padX, paddingBottom: space.screenBottom },
});

const dx = StyleSheet.create({
  wrap: { gap: metrics.sheet.gap },
  titleBlock: { gap: metrics.form.labelGap },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: metrics.statusDot.gap, flexWrap: 'wrap' },
  dot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
  people: { gap: space.inline, flexShrink: 1 },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  group: { gap: metrics.form.labelGap },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.rowGap, paddingVertical: metrics.listRow.padY },
  itemText: { flex: 1 },
  strike: { textDecorationLine: 'line-through' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inline },
  tag: { paddingHorizontal: metrics.filterChip.padX, paddingVertical: metrics.filterChip.padY, borderRadius: radii.pill },
});
