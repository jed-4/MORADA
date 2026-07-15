import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../ui/PressableScale';
import { lightTheme, projectColors, fontSize, fontWeight, radius, type Theme } from '../../theme';

// Shared types, colour maps, and helpers for the Calendar screen and its
// three extracted views (FeedView / WeekView / MonthView).

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  type: 'task' | 'schedule' | 'timesheet' | 'site_diary' | 'google_cal';
  color: string;
  statusColor?: string;
  status?: string;
  projectId?: string;
  projectName?: string;
  assigneeId?: string;
  raw?: any;
}

/** Events pre-bucketed by local day key (YYYY-MM-DD), built once per filter change. */
export type EventsByDay = Record<string, CalendarEvent[]>;

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Event-type accents reference theme tokens (identical in light and dark).
export const EVENT_COLORS: Record<string, string> = {
  task:       lightTheme.primary,
  schedule:   lightTheme.sage,
  timesheet:  lightTheme.teal,
  site_diary: lightTheme.coral,
  google_cal: lightTheme.primary,
};

export const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  'not-started':   lightTheme.textMuted,
  'not_started':   lightTheme.textMuted,
  'in-progress':   lightTheme.primary,
  'in_progress':   lightTheme.primary,
  'completed':     lightTheme.sage,
  'complete':      lightTheme.sage,
  'done':          lightTheme.sage,
  'on-hold':       lightTheme.amber,
  'on_hold':       lightTheme.amber,
  'delayed':       lightTheme.coral,
  'blocked':       lightTheme.coral,
  'cancelled':     lightTheme.textMuted,
  'booked':        lightTheme.teal,
  'requested':     lightTheme.amber,
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  'not-started':   'Not Started',
  'not_started':   'Not Started',
  'in-progress':   'In Progress',
  'in_progress':   'In Progress',
  'completed':     'Completed',
  'complete':      'Completed',
  'done':          'Done',
  'on-hold':       'On Hold',
  'on_hold':       'On Hold',
  'delayed':       'Delayed',
  'blocked':       'Blocked',
  'cancelled':     'Cancelled',
  'booked':        'Booked',
  'requested':     'Requested',
};

// Data sentinel: the server's legacy default project colour. A stored colour
// equal to this means "no real colour chosen" — not a UI token, keep the hex.
const DEFAULT_PROJECT_COLOR = '#3b82f6';

function hashProjectColor(projectId: string): string {
  let h = 5381;
  for (let i = 0; i < projectId.length; i++) {
    h = (h * 33) ^ projectId.charCodeAt(i);
  }
  return projectColors[Math.abs(h) % projectColors.length];
}

export function getProjectEventColor(
  projectId: string | undefined,
  customColor: string | null | undefined,
  fallbackColor: string,
  brandColor?: string | null,
): string {
  const isValidHex = (c: string | null | undefined): c is string =>
    typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c);
  if (isValidHex(customColor) && customColor.toLowerCase() !== DEFAULT_PROJECT_COLOR) {
    return customColor;
  }
  if (isValidHex(brandColor)) {
    return brandColor;
  }
  if (projectId) {
    return hashProjectColor(projectId);
  }
  return fallbackColor;
}

// ── Date/time helpers ──────────────────────────────────────────────────────

export function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}

export function formatTimeShort(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${displayH} ${period}`;
  return `${displayH}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDayHeader(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, today)) return `Today — ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  if (isSameDay(date, yesterday)) return `Yesterday — ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  if (isSameDay(date, tomorrow)) return `Tomorrow — ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return `${days[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function getEventDurationMinutes(startTime: string, endTime: string | null | undefined): number {
  if (!endTime) return 60;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return Math.max(end - start, 15);
}

export function formatDateRange(startDate: string, endDate?: string): string | null {
  if (!endDate || endDate === startDate) return null;
  const s = new Date(startDate + 'T12:00:00');
  const e = new Date(endDate + 'T12:00:00');
  const sStr = `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]}`;
  const eStr = `${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`;
  return `${sStr} – ${eStr}`;
}

export function isEventAllDay(event: CalendarEvent): boolean {
  if (event.type === 'site_diary') return true;
  if (event.type === 'google_cal' && !event.startTime) return true;
  if (!event.startTime) return true;
  return false;
}

export function getEventTypeLabel(type: string): string {
  switch (type) {
    case 'task': return 'Task';
    case 'schedule': return 'Schedule';
    case 'timesheet': return 'Time';
    case 'site_diary': return 'Diary';
    case 'google_cal': return 'Google';
    default: return type;
  }
}

export function getTypeIcon(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'task': return 'checkmark-circle-outline';
    case 'schedule': return 'construct-outline';
    case 'timesheet': return 'time-outline';
    case 'site_diary': return 'book-outline';
    case 'google_cal': return 'logo-google';
    default: return 'calendar-outline';
  }
}

// ── EventCard — the list/agenda row used by FeedView and MonthView ─────────

interface EventCardProps {
  event: CalendarEvent;
  theme: Theme;
  onPress: (event: CalendarEvent) => void;
  /** Status chip config (month agenda shows these; feed does not). */
  statusChip?: { label: string; color: string } | null;
}

export function EventCard({ event, theme, onPress, statusChip }: EventCardProps) {
  const barColor = event.color;
  const dateRange = event.type === 'schedule' ? formatDateRange(event.date, event.endDate) : null;
  const timesheetHours = event.type === 'timesheet'
    ? (() => {
        const h = parseFloat(event.raw?.duration ?? event.raw?.totalHours ?? '');
        if (!isFinite(h) || h <= 0) return '';
        return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
      })()
    : '';
  return (
    <PressableScale
      haptics
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => onPress(event)}
    >
      <View style={{ width: 4, backgroundColor: barColor }} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={[styles.cardTime, { color: theme.textSecondary }]}>
          {event.startTime
            ? `${formatTime(event.startTime)}${event.endTime ? ` – ${formatTime(event.endTime)}` : ''}`
            : (dateRange || 'All day')}
        </Text>
        {statusChip && (
          <View style={styles.chipRow}>
            <View style={[styles.statusChip, { backgroundColor: statusChip.color + '22' }]}>
              <Text style={[styles.statusChipText, { color: statusChip.color }]}>{statusChip.label}</Text>
            </View>
          </View>
        )}
        {event.projectName && (
          <View style={[styles.projectChip, { backgroundColor: barColor + '20' }]}>
            <View style={[styles.projectDot, { backgroundColor: barColor }]} />
            <Text style={[styles.projectChipText, { color: theme.textSecondary }]}>
              {event.projectName}
            </Text>
          </View>
        )}
      </View>
      {!!timesheetHours && (
        <Text style={[styles.hours, { color: theme.textPrimary }]}>{timesheetHours}</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
    minHeight: 64,
  },
  cardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  cardTitle: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
  },
  cardTime: { fontSize: fontSize.table },
  chipRow: { flexDirection: 'row', marginTop: 6 },
  statusChip: {
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipText: { fontSize: fontSize.data, fontWeight: fontWeight.semibold },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.lg,
  },
  projectDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  projectChipText: { fontSize: fontSize.label, fontWeight: fontWeight.medium },
  hours: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    paddingRight: 14,
    alignSelf: 'center',
  },
});
