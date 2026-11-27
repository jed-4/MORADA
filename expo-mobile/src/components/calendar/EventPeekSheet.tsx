import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CircleCheck, Pencil, RotateCcw } from 'lucide-react-native';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { metrics, size, space, type, useColors } from '../../theme';
import { ButtonRow, Card, PrimaryButton, ProjectSquare, PropertyRow, SecondaryButton, SheetBody } from '../kit';
import {
  formatClockRange,
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
  event: CalendarEvent | null;
  onDismiss: () => void;
  taskIsDone: boolean;
  onToggleTaskComplete: () => void;
  /** Deep-link into a More-stack screen (dismisses the sheet first). */
  onOpenMoreScreen: (screen: string, params?: Record<string, unknown>) => void;
}

export function EventPeekSheet({
  sheetRef,
  event,
  onDismiss,
  taskIsDone,
  onToggleTaskComplete,
  onOpenMoreScreen,
}: EventPeekSheetProps) {
  const c = useColors();
  const ev = event;
  const raw = ev?.raw;

  const statusWord = ev?.status
    ? ev.type === 'schedule'
      ? SCHEDULE_STATUS_LABELS[ev.status] || ev.status
      : ev.status.charAt(0).toUpperCase() + ev.status.slice(1).replace(/_/g, ' ')
    : null;
  const dateText = !ev
    ? null
    : ev.type === 'schedule' && raw
      ? `${formatDateShort(raw.startDate)}${raw.endDate && raw.endDate !== raw.startDate ? ` – ${formatDateShort(raw.endDate)}` : ''}`
      : ev.type === 'task' && raw?.dueDate
        ? formatDateShort(raw.dueDate)
        : ev.date
          ? formatDateShort(ev.date)
          : null;
  const timeText = ev?.startTime ? formatClockRange(ev.startTime, ev.endTime) : null;
  const hoursText =
    ev?.type === 'timesheet' && raw?.duration
      ? (() => { const h = parseFloat(raw.duration ?? '0'); return `${h % 1 === 0 ? h : h.toFixed(1)}h`; })()
      : null;
  const notes = raw?.description || raw?.contentText || raw?.content || null;

  return (
    <Sheet ref={sheetRef} scrollable onDismiss={onDismiss}>
      {ev && (
        <SheetBody>
          <View style={styles.titleBlock}>
            <View style={styles.kind}>
              <Text style={[type.meta, { color: c.muted }]}>{getEventTypeLabel(ev.type)}</Text>
              {ev.projectName ? (
                <>
                  <Text style={[type.meta, { color: c.faint }]}>·</Text>
                  <ProjectSquare color={ev.projectId ? ev.color : null} fallbackKey={ev.projectId} size="header" />
                  <Text style={[type.meta, styles.shrink, { color: c.muted }]} numberOfLines={1}>{ev.projectName}</Text>
                </>
              ) : null}
            </View>
            <Text style={[type.detailTitle, { color: c.text }]}>{ev.title}</Text>
            {statusWord ? (
              <View style={styles.status}>
                <View style={[styles.dot, { backgroundColor: ev.statusColor || c.status.upcoming }]} />
                <Text style={[type.meta, { color: c.muted }]}>{statusWord}</Text>
              </View>
            ) : null}
          </View>

          {(dateText || timeText || hoursText) ? (
            <Card variant="list">
              {dateText ? <PropertyRow key="date" label="Date" value={dateText} /> : null}
              {timeText ? <PropertyRow key="time" label="Time" value={timeText} /> : null}
              {hoursText ? <PropertyRow key="hours" label="Hours" value={hoursText} /> : null}
            </Card>
          ) : null}

          {notes ? (
            <Card variant="notes">
              <Text style={[type.bodyRead, { color: c.textLong }]}>{notes}</Text>
            </Card>
          ) : null}

          {ev.type === 'task' ? (
            <ButtonRow>
              <SecondaryButton
                label={taskIsDone ? 'Mark incomplete' : 'Mark complete'}
                icon={taskIsDone ? RotateCcw : CircleCheck}
                onPress={onToggleTaskComplete}
              />
              <PrimaryButton label="Edit" icon={Pencil} onPress={() => onOpenMoreScreen('Tasks', { openTaskId: raw?.id })} />
            </ButtonRow>
          ) : ev.type === 'schedule' ? (
            <ButtonRow>
              <PrimaryButton label="Open schedule" onPress={() => onOpenMoreScreen('Schedule', ev.projectId ? { projectId: ev.projectId } : undefined)} />
            </ButtonRow>
          ) : ev.type === 'timesheet' ? (
            <ButtonRow>
              <PrimaryButton label="Open timesheets" onPress={() => onOpenMoreScreen('Timesheets')} />
            </ButtonRow>
          ) : ev.type === 'site_diary' ? (
            <ButtonRow>
              <PrimaryButton label="Open site diary" onPress={() => onOpenMoreScreen('SiteDiaryList')} />
            </ButtonRow>
          ) : null}
        </SheetBody>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: metrics.form.labelGap },
  kind: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  shrink: { flexShrink: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: metrics.statusDot.gap },
  dot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
});
