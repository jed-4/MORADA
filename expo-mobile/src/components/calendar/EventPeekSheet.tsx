import type { RefObject } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { fontSize, fontWeight, radius, type Theme } from '../../theme';
import {
  formatDateShort,
  getEventTypeLabel,
  SCHEDULE_STATUS_LABELS,
  type CalendarEvent,
} from './shared';

// Event peek: full detail content plus type-specific actions.
//   task       → Mark complete (optimistic) + Edit (deep-link to Tasks)
//   schedule   → Open schedule
//   timesheet  → Open timesheets
//   site_diary → Open site diary
//   google_cal → read-only

interface EventPeekSheetProps {
  sheetRef: RefObject<SheetRef | null>;
  theme: Theme;
  event: CalendarEvent | null;
  onDismiss: () => void;
  taskIsDone: boolean;
  onToggleTaskComplete: () => void;
  /** Deep-link into a More-stack screen (dismisses the sheet first). */
  onOpenMoreScreen: (screen: string, params?: Record<string, unknown>) => void;
}

export function EventPeekSheet({
  sheetRef,
  theme,
  event,
  onDismiss,
  taskIsDone,
  onToggleTaskComplete,
  onOpenMoreScreen,
}: EventPeekSheetProps) {
  const ev = event;
  const raw = ev?.raw;

  return (
    <Sheet ref={sheetRef} scrollable onDismiss={onDismiss}>
      {ev && (
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <View style={[styles.typeBadge, { backgroundColor: ev.color + '25' }]}>
              <Text style={[styles.typeBadgeText, { color: ev.color }]}>{getEventTypeLabel(ev.type)}</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>{ev.title}</Text>

          {/* Status badge */}
          {ev.status && (
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: (ev.statusColor || ev.color) + '20' }]}>
                <Text style={[styles.badgeText, { color: ev.statusColor || ev.color }]}>
                  {ev.type === 'schedule'
                    ? (SCHEDULE_STATUS_LABELS[ev.status] || ev.status)
                    : ev.status.charAt(0).toUpperCase() + ev.status.slice(1).replace(/_/g, ' ')}
                </Text>
              </View>
            </View>
          )}

          {/* Project */}
          {ev.projectName ? (
            <View style={styles.field}>
              <Ionicons name="briefcase-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.fieldText, { color: theme.textPrimary }]}>{ev.projectName}</Text>
            </View>
          ) : null}

          {/* Date / date range */}
          {ev.type === 'schedule' && raw ? (
            <View style={styles.field}>
              <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.fieldText, { color: theme.textPrimary }]}>
                {formatDateShort(raw.startDate)}{raw.endDate && raw.endDate !== raw.startDate ? ` → ${formatDateShort(raw.endDate)}` : ''}
              </Text>
            </View>
          ) : ev.type === 'task' && raw?.dueDate ? (
            <View style={styles.field}>
              <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.fieldText, { color: theme.textPrimary }]}>{formatDateShort(raw.dueDate)}</Text>
            </View>
          ) : ev.date ? (
            <View style={styles.field}>
              <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.fieldText, { color: theme.textPrimary }]}>{formatDateShort(ev.date)}</Text>
            </View>
          ) : null}

          {/* Time range */}
          {ev.startTime ? (
            <View style={styles.field}>
              <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.fieldText, { color: theme.textPrimary }]}>
                {ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ''}
              </Text>
            </View>
          ) : null}

          {/* Timesheet hours */}
          {ev.type === 'timesheet' && raw?.duration ? (
            <View style={styles.field}>
              <Ionicons name="hourglass-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.fieldText, { color: theme.textPrimary }]}>
                {(() => { const h = parseFloat(raw.duration ?? '0'); return `${h % 1 === 0 ? h : h.toFixed(1)} hrs`; })()}
              </Text>
            </View>
          ) : null}

          {/* Notes / description */}
          {(raw?.description || raw?.contentText || raw?.content) ? (
            <View style={[styles.section, { borderTopColor: theme.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Notes</Text>
              <Text style={[styles.sectionText, { color: theme.textPrimary }]}>
                {raw.description || raw.contentText || raw.content}
              </Text>
            </View>
          ) : null}

          {/* Actions by event type */}
          {ev.type === 'task' && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: theme.border }]}
                onPress={onToggleTaskComplete}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={taskIsDone ? 'refresh-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={taskIsDone ? theme.textSecondary : theme.statusSuccess}
                />
                <Text style={[styles.secondaryBtnText, { color: taskIsDone ? theme.textSecondary : theme.statusSuccess }]}>
                  {taskIsDone ? 'Mark incomplete' : 'Mark complete'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => onOpenMoreScreen('Tasks', { openTaskId: raw?.id })}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
          {ev.type === 'schedule' && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => onOpenMoreScreen('Schedule', ev.projectId ? { projectId: ev.projectId } : undefined)}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Open schedule</Text>
              </TouchableOpacity>
            </View>
          )}
          {ev.type === 'timesheet' && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => onOpenMoreScreen('Timesheets')}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={15} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Open timesheets</Text>
              </TouchableOpacity>
            </View>
          )}
          {ev.type === 'site_diary' && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => onOpenMoreScreen('SiteDiaryList')}
                activeOpacity={0.8}
              >
                <Ionicons name="book-outline" size={15} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Open site diary</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.xl,
  },
  typeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: 12,
    lineHeight: 26,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  badgeText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  fieldText: {
    fontSize: fontSize.bodyLg,
    flex: 1,
  },
  section: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionText: {
    fontSize: fontSize.bodyLg,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
