import { useState, useEffect, useCallback, useMemo, useRef, type RefObject } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Platform,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest, API_BASE_URL } from '../services/api';
import { getCached, setCached } from '../services/cache';
import { addToQueue, syncQueue, getQueueCount, isOnline, getQueue, clearFailedActions, getFailedActions, retryFailedActions, addSyncListener } from '../services/offlineQueue';
import { useTheme, useColors, lightTheme, darkTheme, MAX_FONT_SCALE, metrics, size, space, tabular, type } from '../theme';
import { Check, Pencil, Trash2 } from 'lucide-react-native';
import {
  ButtonRow, Card, FieldLabel, ModalSheet, PrimaryButton, PropertyRow, TextButton, TextField,
} from '../components/kit';
import { useDirtyGuard } from '../lib/useDirtyGuard';
import { useKeyboardAwareScroll } from '../lib/useKeyboardAwareScroll';
import { readableFrame } from '../components/ui/ReadableColumn';
import { haptic } from '../lib/haptics';
import { clockedInOnThisPhone, clockedOutOnThisPhone, shortJobName } from '../services/liveActivity';
import { refreshSiteFences } from '../services/siteGeofence';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '../components/ui/BackButton';

const BUSINESS_ID = '__business__';

interface Timesheet {
  id: string;
  projectId: string | null;
  userId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  duration: string;
  breakDuration: string;
  breakStartTime: string | null;
  description: string | null;
  hourlyRate: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  isActive: boolean;
  clockInTime: string | null;
  createdAt: string;
  costCodeId: string | null;
}

interface Project {
  id: string;
  name: string;
  jobNumber?: string | null;
  currentSystemPhase?: string | null;
}

interface CostCode {
  id: string;
  code: string;
  title: string;
}

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekBounds(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday, startStr: toLocalDateStr(monday), endStr: toLocalDateStr(sunday) };
}

function formatShortDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDayDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatDisplayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function generateTimeOptions() {
  const times: { value: string; label: string }[] = [];
  for (let i = 0; i < 96; i++) {
    // Rotated so the list opens at 6:00 AM (24 quarter-hours past midnight)
    const adjustedIndex = (i + 24) % 96;
    const totalMinutes = adjustedIndex * 15;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const value = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const label = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    times.push({ value, label });
  }
  return times;
}

const TIME_OPTIONS = generateTimeOptions();

const BREAK_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: 'None' },
  { value: '0.25', label: '15 min' },
  { value: '0.5', label: '30 min' },
  { value: '0.75', label: '45 min' },
  { value: '1', label: '1 hr' },
  { value: '1.25', label: '1 hr 15 min' },
  { value: '1.5', label: '1 hr 30 min' },
  { value: '1.75', label: '1 hr 45 min' },
  { value: '2', label: '2 hrs' },
  { value: '2.5', label: '2 hrs 30 min' },
  { value: '3', label: '3 hrs' },
  { value: '3.5', label: '3 hrs 30 min' },
  { value: '4', label: '4 hrs' },
];


const PHASE_ORDER: Record<string, number> = {
  construction: 0,
  pre_construction: 1,
  lead: 2,
  post_construction: 3,
};

const PHASE_LABELS: Record<string, string> = {
  construction: 'Construction',
  pre_construction: 'Pre-construction',
  lead: 'Lead',
  post_construction: 'Post-construction',
};

function getSortedProjectItems(projects: Project[]): { id: string; label: string; isHeader?: boolean }[] {
  const visible = projects.filter(p => p.currentSystemPhase !== 'archive');

  visible.sort((a, b) => {
    const phaseA = PHASE_ORDER[a.currentSystemPhase || 'lead'] ?? 99;
    const phaseB = PHASE_ORDER[b.currentSystemPhase || 'lead'] ?? 99;
    if (phaseA !== phaseB) return phaseA - phaseB;
    const jnCompare = (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, { numeric: true });
    if (jnCompare !== 0) return jnCompare;
    return a.name.localeCompare(b.name);
  });

  // "Business (Overhead)" always appears first — selecting it bills the time
  // to the business with no project attached (projectId = null).
  const items: { id: string; label: string; isHeader?: boolean }[] = [
    { id: BUSINESS_ID, label: 'Business (Overhead)' },
  ];
  let currentPhase = '';
  for (const p of visible) {
    const phase = p.currentSystemPhase || 'lead';
    if (phase !== currentPhase) {
      currentPhase = phase;
      items.push({ id: `__header_${phase}`, label: PHASE_LABELS[phase] || phase, isHeader: true });
    }
    const prefix = p.jobNumber ? `${p.jobNumber} - ` : '';
    items.push({ id: p.id, label: `${prefix}${p.name}` });
  }
  return items;
}

function calculateDuration(start: string, end: string, breakDur: string): string {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let minutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (minutes < 0) minutes += 24 * 60;
  const hours = (minutes / 60) - parseFloat(breakDur || '0');
  return Math.max(0, Math.round(hours * 4) / 4).toString();
}

function ElapsedTimer({ clockInTime, style }: { clockInTime: string; style: object }) {
  const [elapsed, setElapsed] = useState('00:00:00');
  useEffect(() => {
    const update = () => {
      const clockIn = new Date(clockInTime);
      const now = new Date();
      const seconds = Math.floor((now.getTime() - clockIn.getTime()) / 1000);
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [clockInTime]);
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={style}>{elapsed}</Text>;
}

const GRID_START_HOUR = 5;
const GRID_END_HOUR = 22;
const TOTAL_HOURS = GRID_END_HOUR - GRID_START_HOUR;
const HOUR_HEIGHT = 60;
const GUTTER_WIDTH = 44;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WeeklyTimeGridProps {
  timesheets: Timesheet[];
  weekStart: Date;
  weekEnd: Date;
  setWeekOffset: (fn: (w: number) => number) => void;
  totalHours: number;
  getProjectName: (id: string | null) => string;
  getCostCodeName: (id: string | null) => string | null;
  onSelectTimesheet: (ts: Timesheet) => void;
  colors: {
    bg: string; card: string; text: string; secondary: string; border: string;
    accent: string; green: string; red: string; inputBg: string;
  };
  isDark: boolean;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}

function WeeklyTimeGrid({
  timesheets,
  weekStart,
  weekEnd,
  setWeekOffset,
  totalHours,
  getProjectName,
  getCostCodeName,
  onSelectTimesheet,
  colors,
  isDark,
  onRefresh,
  refreshing,
}: WeeklyTimeGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const gridWidth = screenWidth - GUTTER_WIDTH;
  const dayWidth = gridWidth / 7;

  const gridTotalHeight = TOTAL_HOURS * HOUR_HEIGHT;

  const weekDates: Date[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const timedEntries = useMemo(() =>
    timesheets.filter(ts => ts.startTime != null),
    [timesheets],
  );

  const untimedEntries = useMemo(() =>
    timesheets.filter(ts => ts.startTime == null),
    [timesheets],
  );

  function getStatusBg(status: string, dark: boolean): string {
    const t = dark ? darkTheme : lightTheme;
    switch (status) {
      case 'approved': return t.statusSuccessBg;
      case 'submitted': return t.statusWarningBg;
      case 'rejected': return t.statusDangerBg;
      default: return t.border;
    }
  }

  function getStatusBorder(status: string, dark: boolean): string {
    const t = dark ? darkTheme : lightTheme;
    switch (status) {
      case 'approved': return t.statusSuccess;
      case 'submitted': return t.statusWarning;
      case 'rejected': return t.statusDanger;
      default: return t.textMuted;
    }
  }

  function getStatusText(status: string, dark: boolean): string {
    const t = dark ? darkTheme : lightTheme;
    switch (status) {
      case 'approved': return t.statusSuccess;
      case 'submitted': return t.statusWarning;
      case 'rejected': return t.statusDanger;
      default: return t.textSecondary;
    }
  }

  function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  function getBlockPosition(ts: Timesheet): { top: number; height: number; clippedTop: boolean; clippedBottom: boolean } | null {
    if (!ts.startTime) return null;
    const startMin = timeToMinutes(ts.startTime);
    const gridStartMin = GRID_START_HOUR * 60;
    const gridEndMin = GRID_END_HOUR * 60;

    let endMin: number;
    if (ts.endTime) {
      endMin = timeToMinutes(ts.endTime);
      if (endMin <= startMin) {
        endMin += 24 * 60;
      }
    } else {
      const dur = parseFloat(ts.duration || '0');
      endMin = startMin + dur * 60;
    }

    const clippedTop = startMin < gridStartMin;
    const clippedBottom = endMin > gridEndMin;
    let clampedStart = Math.max(startMin, gridStartMin);
    let clampedEnd = Math.min(endMin, gridEndMin);
    if (clampedStart >= clampedEnd) {
      // Entry lies entirely outside the 05:00–22:00 window — pin a small block
      // to the nearest grid edge so it stays visible and tappable rather than
      // vanishing while still counting in the weekly total.
      if (endMin <= gridStartMin) {
        clampedStart = gridStartMin;
        clampedEnd = gridStartMin + 20;
      } else {
        clampedStart = gridEndMin - 20;
        clampedEnd = gridEndMin;
      }
    }

    const top = ((clampedStart - gridStartMin) / 60) * HOUR_HEIGHT;
    const height = Math.max(((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT, 20);
    return { top, height, clippedTop, clippedBottom };
  }

  const today = toLocalDateStr(new Date());

  const hourLabels = useMemo(() => {
    const labels: { hour: number; label: string }[] = [];
    for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
      const period = h >= 12 ? 'pm' : 'am';
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      labels.push({ hour: h, label: `${displayH}${period}` });
    }
    return labels;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Week navigation */}
      <View style={[gridStyles.weekNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity hitSlop={8} onPress={() => setWeekOffset(w => w - 1)} style={gridStyles.weekArrow}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={gridStyles.weekCenter}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[gridStyles.weekRange, { color: colors.text }]}>
            {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[gridStyles.weekHours, { color: colors.secondary }]}>
            {totalHours.toFixed(1)} hours this week
          </Text>
        </View>
        <TouchableOpacity hitSlop={8} onPress={() => setWeekOffset(w => w + 1)} style={gridStyles.weekArrow}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Untimed entries strip — grouped by day column */}
      {untimedEntries.length > 0 && (
        <View style={[gridStyles.untimedStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ width: GUTTER_WIDTH, alignSelf: 'flex-start', paddingTop: 2 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[gridStyles.untimedLabel, { color: colors.secondary }]}>No{'\n'}time</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {weekDates.map((date, dayIdx) => {
              const dateStr = toLocalDateStr(date);
              const dayEntries = untimedEntries.filter(ts => toLocalDateStr(new Date(ts.date)) === dateStr);
              return (
                <View key={dayIdx} style={[gridStyles.untimedDayCell, { width: dayWidth }]}>
                  {dayEntries.map(ts => (
                    <TouchableOpacity
                      key={ts.id}
                      style={[gridStyles.untimedChip, { backgroundColor: getStatusBg(ts.status, isDark), borderColor: getStatusBorder(ts.status, isDark) }]}
                      onPress={() => onSelectTimesheet(ts)}
                    >
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[gridStyles.untimedChipText, { color: getStatusText(ts.status, isDark) }]} numberOfLines={2}>
                        {getProjectName(ts.projectId)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Sticky day header row */}
      <View style={[gridStyles.dayHeaderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ width: GUTTER_WIDTH }} />
        {weekDates.map((date, idx) => {
          const dateStr = toLocalDateStr(date);
          const isToday = dateStr === today;
          return (
            <View key={idx} style={[gridStyles.dayHeaderCell, { width: dayWidth }]}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[gridStyles.dayHeaderLabel, { color: isToday ? colors.accent : colors.secondary }]}>
                {DAY_LABELS[idx]}
              </Text>
              <View style={[gridStyles.dayHeaderDate, isToday && { backgroundColor: colors.accent }]}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[gridStyles.dayHeaderDateText, { color: isToday ? '#fff' : colors.text }]}>
                  {date.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Time grid */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator
      >
        <View style={{ flexDirection: 'row', height: gridTotalHeight + 1 }}>
          {/* Hour gutter */}
          <View style={{ width: GUTTER_WIDTH }}>
            {hourLabels.map(({ hour, label }) => (
              <View
                key={hour}
                style={[
                  gridStyles.gutterLabel,
                  { top: (hour - GRID_START_HOUR) * HOUR_HEIGHT - 7, height: HOUR_HEIGHT },
                ]}
              >
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[gridStyles.gutterText, { color: colors.secondary }]}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Day columns */}
          {weekDates.map((date, colIdx) => {
            const dateStr = toLocalDateStr(date);
            const isToday = dateStr === today;
            const colEntries = timedEntries.filter(ts => {
              return toLocalDateStr(new Date(ts.date)) === dateStr;
            });

            return (
              <View
                key={colIdx}
                style={[
                  gridStyles.dayColumn,
                  {
                    width: dayWidth,
                    height: gridTotalHeight,
                    borderLeftColor: colors.border,
                    backgroundColor: isToday ? (isDark ? 'rgba(177,150,210,0.05)' : 'rgba(155,127,196,0.04)') : 'transparent',
                  },
                ]}
              >
                {/* Hour lines */}
                {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      gridStyles.hourLine,
                      {
                        top: i * HOUR_HEIGHT,
                        borderTopColor: i % 1 === 0 ? colors.border : 'transparent',
                        borderTopWidth: StyleSheet.hairlineWidth,
                        width: dayWidth,
                      },
                    ]}
                  />
                ))}
                {/* Half-hour lines */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <View
                    key={`half_${i}`}
                    style={[
                      gridStyles.halfHourLine,
                      {
                        top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                        borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                        width: dayWidth,
                      },
                    ]}
                  />
                ))}

                {/* Timesheet blocks */}
                {colEntries.map(ts => {
                  const pos = getBlockPosition(ts);
                  if (!pos) return null;
                  const projectName = getProjectName(ts.projectId);
                  const ccName = getCostCodeName(ts.costCodeId);
                  const bgColor = getStatusBg(ts.status, isDark);
                  const borderColor = getStatusBorder(ts.status, isDark);
                  const textColor = getStatusText(ts.status, isDark);
                  const blockPad = 3;
                  const innerWidth = dayWidth - blockPad * 2 - 2;

                  return (
                    <TouchableOpacity
                      key={ts.id}
                      style={[
                        gridStyles.block,
                        {
                          top: pos.top,
                          height: pos.height,
                          width: dayWidth - blockPad * 2,
                          left: blockPad,
                          backgroundColor: bgColor,
                          borderColor: borderColor,
                        },
                      ]}
                      onPress={() => onSelectTimesheet(ts)}
                      activeOpacity={0.7}
                    >
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                        style={[gridStyles.blockProject, { color: textColor, maxWidth: innerWidth }]}
                        numberOfLines={1}
                      >
                        {projectName}
                      </Text>
                      {pos.height > 32 && ccName ? (
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                          style={[gridStyles.blockCostCode, { color: textColor, maxWidth: innerWidth }]}
                          numberOfLines={1}
                        >
                          {ccName}
                        </Text>
                      ) : null}
                      {pos.height > 52 && ts.description ? (
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                          style={[gridStyles.blockDesc, { color: textColor, maxWidth: innerWidth }]}
                          numberOfLines={2}
                        >
                          {ts.description}
                        </Text>
                      ) : null}
                      {pos.clippedTop ? (
                        <Ionicons name="caret-up" size={9} color={textColor} style={gridStyles.clipIndicatorTop} />
                      ) : null}
                      {pos.clippedBottom ? (
                        <Ionicons name="caret-down" size={9} color={textColor} style={gridStyles.clipIndicatorBottom} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  weekArrow: { padding: 8 },
  weekCenter: { flex: 1, alignItems: 'center' },
  weekRange: { fontSize: 14, fontWeight: '500' },
  weekHours: { fontSize: 12, marginTop: 2 },
  untimedStrip: {
    borderBottomWidth: 1,
    paddingVertical: 6,
    paddingLeft: 0,
    paddingRight: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  untimedLabel: { fontSize: 11, fontWeight: '500', flexShrink: 0 },
  untimedChips: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  untimedChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 120,
  },
  untimedChipText: { fontSize: 11, fontWeight: '500' },
  untimedDayCell: { paddingHorizontal: 1, gap: 2 },
  dayHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  dayHeaderCell: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayHeaderLabel: { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
  dayHeaderDate: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dayHeaderDateText: { fontSize: 12, fontWeight: '600' },
  dayColumn: {
    position: 'relative',
    borderLeftWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
  },
  halfHourLine: {
    position: 'absolute',
    left: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gutterLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  gutterText: { fontSize: 9, fontWeight: '500' },
  block: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 3,
    overflow: 'hidden',
    padding: 2,
  },
  blockProject: { fontSize: 9, fontWeight: '700', lineHeight: 12 },
  blockCostCode: { fontSize: 8, lineHeight: 11, opacity: 0.85 },
  blockDesc: { fontSize: 8, lineHeight: 11, opacity: 0.75 },
  clipIndicatorTop: { position: 'absolute', top: 0, right: 2 },
  clipIndicatorBottom: { position: 'absolute', bottom: 0, right: 2 },
});

export default function TimesheetsScreen() {
  const k = useColors();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [activeTimesheet, setActiveTimesheet] = useState<Timesheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [clockInProjectId, setClockInProjectId] = useState('');
  const [clockInCostCodeId, setClockInCostCodeId] = useState('');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showClockInCostCodePicker, setShowClockInCostCodePicker] = useState(false);
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const [showLogSheet, setShowLogSheet] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formProjectId, setFormProjectId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('07:00');
  const [formEndTime, setFormEndTime] = useState('15:30');
  const [formBreakDuration, setFormBreakDuration] = useState('0');
  const [formBreakStartTime, setFormBreakStartTime] = useState('12:00');
  const [formHourlyRate, setFormHourlyRate] = useState('');
  const [formCostCodeId, setFormCostCodeId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showTimePicker, setShowTimePicker] = useState<'start' | 'end' | null>(null);
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [showBreakStartPicker, setShowBreakStartPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDateObj, setPickerDateObj] = useState<Date>(new Date());
  const [showFormProjectPicker, setShowFormProjectPicker] = useState(false);
  const [showCostCodePicker, setShowCostCodePicker] = useState(false);

  // Log Hours / Edit form: closing it (X, Android back) with changes asks
  // first. Baseline is taken once the sheet is visible — for an edit that's
  // after the existing values (and cost code) have loaded.
  const logDirty = useDirtyGuard(
    {
      formProjectId, formDate, formStartTime, formEndTime, formBreakDuration,
      formBreakStartTime, formHourlyRate, formCostCodeId, formDescription,
    },
    showLogSheet,
  );
  // Description is the last field; keep it AND the Save button under it
  // (24 margin + 50 button + a little) above the keyboard.
  const logKb = useKeyboardAwareScroll({ extraSpace: 90 });

  const colors = useMemo(() => ({
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    green: theme.statusSuccess,
    red: theme.statusDanger,
    inputBg: theme.background,
  }), [theme]);

  const fetchData = useCallback(async () => {
    try {
      const cachedProjects = getCached<Project[]>('projects');
      const cachedCostCodes = getCached<CostCode[]>('costCodes-timesheets');

      const fetchProjects = cachedProjects
        ? Promise.resolve(cachedProjects)
        : apiFetch<Project[]>('/api/projects').catch(() => []);
      const fetchCostCodes = cachedCostCodes
        ? Promise.resolve(cachedCostCodes)
        : apiFetch<CostCode[]>('/api/cost-codes?timesheets=true').catch(() => []);

      const [ts, prj, cc, active] = await Promise.all([
        apiFetch<Timesheet[]>('/api/timesheets').catch(() => []),
        fetchProjects,
        fetchCostCodes,
        apiFetch<Timesheet | null>('/api/timesheets/active').catch(() => null),
      ]);
      setTimesheets(ts || []);
      setProjects(prj || []);
      setCostCodes(cc || []);
      setActiveTimesheet(active || null);
      if (!cachedProjects) setCached('projects', prj || []);
      if (!cachedCostCodes) setCached('costCodes-timesheets', cc || []);
    } catch (e) {
      console.error('Failed to fetch timesheet data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setNetworkOnline(online);
      if (online) {
        // Debounce the sync call to prevent rapid network state toggles from
        // spamming handleSync (e.g. WiFi handoff, brief interruptions)
        if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = setTimeout(() => {
          syncDebounceRef.current = null;
          handleSync();
        }, 2000);
      } else {
        // Cancel pending debounced sync if we lose connectivity
        if (syncDebounceRef.current) {
          clearTimeout(syncDebounceRef.current);
          syncDebounceRef.current = null;
        }
      }
    });
    const unsubscribeQueue = addSyncListener(() => {
      getQueueCount().then(setPendingQueueCount);
    });
    getQueueCount().then(setPendingQueueCount);
    return () => {
      unsubscribeNet();
      unsubscribeQueue();
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
        syncDebounceRef.current = null;
      }
    };
  }, []);

  const isSyncingRef = useRef(false);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSync = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setSyncing(true);
    try {
      const { synced, failed } = await syncQueue();
      if (synced > 0) {
        await fetchData();
      }
      if (failed > 0) {
        const failedActions = await getFailedActions();
        const firstError = failedActions.map(a => a.error).find(Boolean);
        Alert.alert(
          'Sync Issue',
          `${failedActions.length} action(s) could not be synced.${firstError ? `\n\n${firstError}` : ''}`,
          [
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                clearFailedActions().then(() => getQueueCount().then(setPendingQueueCount));
              },
            },
            {
              text: 'Retry',
              onPress: () => {
                retryFailedActions().then(() => handleSync());
              },
            },
          ],
        );
      }
    } catch {
    } finally {
      isSyncingRef.current = false;
      setSyncing(false);
      getQueueCount().then(setPendingQueueCount);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    if (await isOnline()) {
      await handleSync();
    }
    setRefreshing(false);
  }, [fetchData]);

  const handleClockIn = async () => {
    if (!clockInProjectId || !clockInCostCodeId) {
      Alert.alert('Missing Fields', 'Please select a project (or Business) and cost code to clock in.');
      return;
    }
    setClockingIn(true);
    // Clock-in time = this tap, even if it only reaches the server later
    // from the offline queue (server/clockTime.ts).
    const clientTime = new Date().toISOString();
    const resolvedClockInProjectId = clockInProjectId === BUSINESS_ID ? null : clockInProjectId;
    // Lock Screen timer + Home Screen widget (no-op without expo-widgets).
    const markClockedIn = () => clockedInOnThisPhone({
      jobName: shortJobName(projects.find(p => p.id === resolvedClockInProjectId)),
      clockInTime: clientTime,
      projectId: resolvedClockInProjectId,
    });
    let networkError = false;
    try {
      const online = await isOnline();
      if (!online) {
        await addToQueue({
          type: 'clock-in',
          payload: { projectId: resolvedClockInProjectId, costCodeId: clockInCostCodeId, clientTime },
        });
        markClockedIn();
        Alert.alert('Saved Offline', 'Your clock-in has been queued and will sync when you have a connection.');
        setClockInProjectId('');
        setClockInCostCodeId('');
        return;
      }

      let res: Response;
      try {
        res = await apiRequest('/api/timesheets/clock-in', 'POST', { projectId: resolvedClockInProjectId, costCodeId: clockInCostCodeId, clientTime });
      } catch {
        networkError = true;
        throw new Error('Network error');
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as any).error || (errData as any).message || `Server error (${res.status})`;
        throw new Error(msg);
      }
      // Clocked in/out: confirm with a tap you can feel without looking.
      haptic.success();
      markClockedIn();
      // Arriving on site: re-rank the fences around the new clock state.
      refreshSiteFences().catch(() => {});

      await fetchData();
      setClockInProjectId('');
      setClockInCostCodeId('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'An unknown error occurred';
      if (networkError) {
        await addToQueue({
          type: 'clock-in',
          payload: { projectId: resolvedClockInProjectId, costCodeId: clockInCostCodeId, clientTime },
        });
        markClockedIn();
        Alert.alert('Saved Offline', 'Clock-in saved and will sync when connection is restored.');
        setClockInProjectId('');
        setClockInCostCodeId('');
      } else {
        Alert.alert('Clock-in Failed', msg);
      }
    } finally {
      setClockingIn(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeTimesheet) return;
    setClockingOut(true);
    // Clock-out time = this tap (see handleClockIn).
    const clientTime = new Date().toISOString();
    let networkError = false;
    try {
      const online = await isOnline();
      if (!online) {
        await addToQueue({
          type: 'clock-out',
          payload: { timesheetId: activeTimesheet.id, clientTime },
        });
        clockedOutOnThisPhone();
        Alert.alert('Saved Offline', 'Your clock-out has been queued and will sync when you have a connection.');
        return;
      }

      let res: Response;
      try {
        res = await apiRequest('/api/timesheets/clock-out', 'POST', { timesheetId: activeTimesheet.id, clientTime });
      } catch {
        networkError = true;
        throw new Error('Network error');
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = (errData as any).error || (errData as any).message || `Server error (${res.status})`;
        throw new Error(msg);
      }
      // Clocked in/out: confirm with a tap you can feel without looking.
      haptic.success();
      clockedOutOnThisPhone();
      // Arriving on site: re-rank the fences around the new clock state.
      refreshSiteFences().catch(() => {});

      await fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'An unknown error occurred';
      if (networkError) {
        await addToQueue({
          type: 'clock-out',
          payload: { timesheetId: activeTimesheet.id, clientTime },
        });
        clockedOutOnThisPhone();
        Alert.alert('Saved Offline', 'Clock-out saved and will sync when connection is restored.');
      } else {
        Alert.alert('Clock-out Failed', msg);
      }
    } finally {
      setClockingOut(false);
    }
  };

  const resetForm = () => {
    setFormProjectId('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormStartTime('07:00');
    setFormEndTime('15:30');
    setFormBreakDuration('0');
    setFormBreakStartTime('12:00');
    setFormHourlyRate('');
    setFormCostCodeId('');
    setFormDescription('');
    setIsEditMode(false);
    setEditingId(null);
  };

  const openLogSheet = () => {
    resetForm();
    setShowLogSheet(true);
  };

  // Labour hours' + button lands here with its project: open Log Hours with
  // that project already chosen, then clear the param so it fires once.
  const route = useRoute();
  const nav = useNavigation();
  const { logProjectId, logCostCodeId, clockInProjectId: clockInParam } = (route.params ?? {}) as {
    logProjectId?: string;
    logCostCodeId?: string;
    clockInProjectId?: string;
  };
  // Workspace's Clock in lands here with the project chosen there: preselect
  // it for Clock in (the cost code is still picked here), then clear the param.
  useEffect(() => {
    if (!clockInParam) return;
    setClockInProjectId(clockInParam);
    setClockInCostCodeId('');
    nav.setParams({ clockInProjectId: undefined } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockInParam]);
  useEffect(() => {
    if (!logProjectId) return;
    resetForm();
    setFormProjectId(logProjectId);
    if (logCostCodeId) setFormCostCodeId(logCostCodeId);
    setShowLogSheet(true);
    nav.setParams({ logProjectId: undefined, logCostCodeId: undefined } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logProjectId]);

  const openEditSheet = async (ts: Timesheet) => {
    setShowDetail(false);
    setIsEditMode(true);
    setEditingId(ts.id);
    setFormProjectId(ts.projectId ?? BUSINESS_ID);
    // Use local date (not UTC) so Australian timezone doesn't shift the date back a day
    setFormDate(toLocalDateStr(new Date(ts.date)));
    setFormStartTime(ts.startTime || '07:00');
    setFormEndTime(ts.endTime || '15:30');
    setFormBreakDuration(ts.breakDuration || '0');
    setFormBreakStartTime(ts.breakStartTime || '12:00');
    setFormHourlyRate(ts.hourlyRate || '');
    setFormDescription(ts.description || '');

    try {
      const existingCostCodes = await apiFetch<any[]>(`/api/timesheets/${ts.id}/cost-codes`);
      if (existingCostCodes && existingCostCodes.length > 0) {
        setFormCostCodeId(existingCostCodes[0].costCodeId || '');
      } else {
        setFormCostCodeId(ts.costCodeId || '');
      }
    } catch {
      setFormCostCodeId(ts.costCodeId || '');
    }

    // Delay opening the edit modal so the detail modal's close animation finishes first
    setTimeout(() => setShowLogSheet(true), 350);
  };

  const handleSubmitTimesheet = async () => {
    if (!formProjectId) {
      Alert.alert('Missing Project', 'Please select a project or Business (Overhead).');
      return;
    }
    if (!formCostCodeId) {
      Alert.alert('Missing Cost Code', 'Please select a cost code.');
      return;
    }

    setSubmitting(true);
    const resolvedProjectId = formProjectId === BUSINESS_ID ? null : formProjectId;
    try {
      const duration = calculateDuration(formStartTime, formEndTime, formBreakDuration);

      const body: any = {
        projectId: resolvedProjectId,
        date: new Date(formDate).toISOString(),
        startTime: formStartTime,
        endTime: formEndTime,
        duration: duration || '0',
        breakDuration: formBreakDuration || '0',
        breakStartTime: parseFloat(formBreakDuration) > 0 ? formBreakStartTime : null,
        hourlyRate: formHourlyRate !== '' ? formHourlyRate : null,
        description: formDescription,
        costCodeId: formCostCodeId,
        status: 'submitted',
      };

      const online = await isOnline();

      if (!online && !isEditMode) {
        await addToQueue({ type: 'log-hours', payload: body });
        Alert.alert('Saved Offline', 'Your timesheet entry has been queued and will sync when you have a connection.');
        setShowLogSheet(false);
        resetForm();
        return;
      }

      if (isEditMode && editingId) {
        await apiRequest(`/api/timesheets/${editingId}`, 'PATCH', body);
        if (formCostCodeId) {
          // Replace the cost-code splits with the form's single split. Create
          // the new row FIRST, then delete the old ones — the previous
          // delete-then-create order lost every split when the create failed
          // partway through. `total` is a dollars decimal string (numeric 10,2),
          // matching the server (routes.ts PATCH /api/timesheets computes
          // (duration * rate).toFixed(2)) and the web TimesheetDialog.
          const existing = await apiFetch<any[]>(`/api/timesheets/${editingId}/cost-codes`).catch(() => [] as any[]);
          const createRes = await apiRequest(`/api/timesheets/${editingId}/cost-codes`, 'POST', {
            costCodeId: formCostCodeId,
            duration,
            hourlyRate: formHourlyRate || '0',
            total: (parseFloat(duration) * parseFloat(formHourlyRate || '0')).toFixed(2),
          });
          const createdSplit = await createRes.json().catch(() => null);
          for (const cc of (existing || [])) {
            if (createdSplit?.id && cc.id === createdSplit.id) continue;
            await apiRequest(`/api/timesheets/cost-codes/${cc.id}`, 'DELETE', {});
          }
        }
      } else {
        const res = await apiRequest('/api/timesheets', 'POST', body);
        const created = await res.json();
        if (formCostCodeId && created.id) {
          await apiRequest(`/api/timesheets/${created.id}/cost-codes`, 'POST', {
            costCodeId: formCostCodeId,
            duration,
            hourlyRate: formHourlyRate || '0',
            total: (parseFloat(duration) * parseFloat(formHourlyRate || '0')).toFixed(2),
          });
        }
      }

      haptic.success();
      setShowLogSheet(false);
      resetForm();
      await fetchData();
    } catch (e: any) {
      if (!isEditMode) {
        const duration = calculateDuration(formStartTime, formEndTime, formBreakDuration);
        await addToQueue({
          type: 'log-hours',
          payload: {
            projectId: resolvedProjectId,
            date: new Date(formDate).toISOString(),
            startTime: formStartTime,
            endTime: formEndTime,
            duration: duration || '0',
            breakDuration: formBreakDuration || '0',
            breakStartTime: parseFloat(formBreakDuration) > 0 ? formBreakStartTime : null,
            hourlyRate: formHourlyRate !== '' ? formHourlyRate : null,
            description: formDescription,
            costCodeId: formCostCodeId,
            status: 'submitted',
          },
        });
        Alert.alert('Saved Offline', 'Timesheet saved and will sync when connection is restored.');
        setShowLogSheet(false);
        resetForm();
      } else {
        // Keep the form open (state preserved) and re-sync from the server so
        // the list reflects exactly what was persisted — the PATCH may have
        // succeeded even if a later cost-code step failed.
        const msg = e instanceof Error && e.message ? e.message : 'Could not save timesheet. Please try again.';
        Alert.alert('Update Failed', msg);
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTimesheet = async (id: string) => {
    Alert.alert('Delete Timesheet', 'Are you sure you want to delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiRequest(`/api/timesheets/${id}`, 'DELETE', {});
            setShowDetail(false);
            setSelectedTimesheet(null);
            await fetchData();
          } catch {
            Alert.alert('Error', 'Could not delete timesheet.');
          }
        },
      },
    ]);
  };

  const { start: weekStart, end: weekEnd, startStr: weekStartStr, endStr: weekEndStr } = useMemo(
    () => getWeekBounds(weekOffset),
    [weekOffset],
  );

  const filteredTimesheets = useMemo(() => timesheets
    .filter(ts => {
      // Compare using local calendar dates to avoid UTC timezone boundary mismatches.
      // A timesheet created Sunday evening AEST must not fall into the previous week
      // just because its UTC timestamp crosses midnight into Saturday/Sunday UTC.
      const localDateStr = toLocalDateStr(new Date(ts.date));
      return localDateStr >= weekStartStr && localDateStr <= weekEndStr;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [timesheets, weekStartStr, weekEndStr],
  );

  const totalHours = useMemo(
    () => filteredTimesheets.reduce((sum, ts) => sum + parseFloat(ts.duration || '0'), 0),
    [filteredTimesheets],
  );

  const getProjectName = useCallback((pid: string | null) => {
    if (!pid || pid === BUSINESS_ID) return 'Business (Overhead)';
    const p = projects.find(p => p.id === pid);
    if (!p) return 'Unknown';
    return p.jobNumber ? `${p.jobNumber} - ${p.name}` : p.name;
  }, [projects]);

  const getCostCodeName = useCallback((ccId: string | null) => {
    if (!ccId) return null;
    const cc = costCodes.find(c => c.id === ccId);
    return cc ? `${cc.code} - ${cc.title}` : null;
  }, [costCodes]);

  const getStatusColor = useCallback((status: string) => {
    const t = isDark ? darkTheme : lightTheme;
    switch (status) {
      case 'draft': return { bg: t.border, text: t.textSecondary };
      case 'submitted': return { bg: t.statusInfoBg, text: t.statusInfo };
      case 'approved': return { bg: t.statusSuccessBg, text: t.statusSuccess };
      case 'rejected': return { bg: t.statusDangerBg, text: t.statusDanger };
      default: return { bg: colors.border, text: colors.secondary };
    }
  }, [isDark, colors.border, colors.secondary]);

  const renderTimesheetItem = useCallback(({ item: ts }: { item: Timesheet }) => {
    const statusColor = getStatusColor(ts.status);
    return (
      <TouchableOpacity
        style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => { setSelectedTimesheet(ts); setShowDetail(true); }}
        activeOpacity={0.7}
      >
        <View style={styles.entryTop}>
          <View style={styles.entryLeft}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.entryDate, { color: colors.text }]}>{formatDayDate(ts.date)}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.entryProject, { color: colors.secondary }]} numberOfLines={1}>
              {getProjectName(ts.projectId)}
            </Text>
          </View>
          <View style={styles.entryRight}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.entryHours, { color: colors.accent }]}>{parseFloat(ts.duration || '0').toFixed(1)}h</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.statusText, { color: statusColor.text }]}>
                {ts.status.charAt(0).toUpperCase() + ts.status.slice(1)}
              </Text>
            </View>
          </View>
        </View>
        {ts.startTime && ts.endTime ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.entryTime, { color: colors.secondary }]}>
            {formatTime12h(ts.startTime)} - {formatTime12h(ts.endTime)}
          </Text>
        ) : null}
        {ts.description ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.entryDesc, { color: colors.secondary }]} numberOfLines={1}>
            {ts.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }, [getStatusColor, getProjectName, colors, setSelectedTimesheet, setShowDetail]);

  const timePickerListRef = useRef<FlatList>(null);

  const PICKER_ITEM_HEIGHT = 52;

  useEffect(() => {
    if (showTimePicker !== null) {
      // Anchor: start opens with 6 AM at the top, end with 3 PM at the top.
      // If the field's current value sits within ~2 h below the anchor it
      // stays visible on screen; otherwise scroll to the value itself.
      const anchor = showTimePicker === 'start' ? '06:00' : '15:00';
      const anchorIndex = TIME_OPTIONS.findIndex(t => t.value === anchor);
      const currentTime = showTimePicker === 'start' ? formStartTime : formEndTime;
      const index = TIME_OPTIONS.findIndex(t => t.value === currentTime);
      const useAnchor = index === -1 || (index >= anchorIndex && index <= anchorIndex + 8);
      const target = useAnchor ? anchorIndex : index;
      const viewPosition = useAnchor ? 0 : 0.3;
      if (target > 0) {
        const timer = setTimeout(() => {
          timePickerListRef.current?.scrollToIndex({ index: target, animated: false, viewPosition });
        }, 350);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [showTimePicker]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const renderPickerModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    items: { id: string; label: string; isHeader?: boolean }[],
    selectedId: string,
    onSelect: (id: string) => void,
    listRef?: RefObject<FlatList | null>,
  ) => (
    <ModalSheet visible={visible} onRequestClose={onClose} title={title} doneLabel="Done" onDone={onClose} fill={items.length > 8}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={item => item.id}
        nestedScrollEnabled
        style={tsx.pickList}
        contentContainerStyle={tsx.pickContent}
        getItemLayout={listRef ? (_data, index) => ({
          length: PICKER_ITEM_HEIGHT,
          offset: PICKER_ITEM_HEIGHT * index,
          index,
        }) : undefined}
        renderItem={({ item }) => {
          if (item.isHeader) {
            return (
              <View style={[tsx.pickHeader, { height: PICKER_ITEM_HEIGHT }]}>
                <Text style={[type.meta, { color: k.muted }]}>{item.label}</Text>
              </View>
            );
          }
          const active = selectedId === item.id;
          return (
            <Pressable
              style={({ pressed }) => [
                tsx.pickRow,
                { height: PICKER_ITEM_HEIGHT, borderBottomColor: k.border, backgroundColor: active ? k.tint : k.surface, opacity: pressed ? metrics.pressedOpacity : 1 },
              ]}
              onPress={() => { haptic.select(); onSelect(item.id); onClose(); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[type.rowTitle, tabular, tsx.flex, { color: k.text }]} numberOfLines={1}>{item.label}</Text>
              {active ? <Check size={size.icon.row} color={k.accent} strokeWidth={metrics.iconStrokeActive} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={[type.body, tsx.center, { color: k.muted }]}>No options available</Text>}
      />
    </ModalSheet>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        {/* Timesheets is only ever opened across stacks (More panel, a
            dashboard card, a timesheet notification), so it is usually its
            stack's only route — BackButton falls through to the tab you came from. */}
        <View style={styles.headerTitleRow}>
          <BackButton color={colors.text} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>Timesheets</Text>
        </View>
        <View style={styles.headerToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.accent }]}
            onPress={() => setViewMode('list')}
            accessibilityLabel="List view"
          >
            <Ionicons name="list" size={18} color={viewMode === 'list' ? '#fff' : colors.secondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'calendar' && { backgroundColor: colors.accent }]}
            onPress={() => setViewMode('calendar')}
            accessibilityLabel="Calendar view"
          >
            <Ionicons name="calendar" size={18} color={viewMode === 'calendar' ? '#fff' : colors.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Offline itself is shown by the app-wide bar (OfflineBanner). */}
      {pendingQueueCount > 0 && networkOnline && (
        <TouchableOpacity
          style={[styles.offlineBanner, { backgroundColor: theme.statusInfoBg }]}
          onPress={handleSync}
          disabled={syncing}
        >
          <Ionicons name={syncing ? 'sync' : 'cloud-upload'} size={16} color={theme.statusInfo} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: theme.statusInfo, fontSize: 13, marginLeft: 6, flex: 1 }}>
            {syncing ? 'Sending…' : `${pendingQueueCount} waiting to send · tap to send now`}
          </Text>
        </TouchableOpacity>
      )}

      {viewMode === 'list' ? (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, readableFrame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          data={filteredTimesheets}
          keyExtractor={item => item.id}
          renderItem={renderTimesheetItem}
          initialNumToRender={10}
          windowSize={5}
          removeClippedSubviews
          ListHeaderComponent={
            <>
              {/* Clock In/Out */}
              <View style={[
                styles.clockCard,
                {
                  backgroundColor: activeTimesheet ? theme.statusSuccessBg : colors.card,
                  borderColor: activeTimesheet ? colors.green : colors.border,
                  borderWidth: activeTimesheet ? 2 : 1,
                },
              ]}>
                {activeTimesheet ? (
                  <>
                    <View style={styles.clockHeader}>
                      <View style={styles.clockStatusRow}>
                        <View style={[styles.pulseDot, { backgroundColor: colors.green }]} />
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.clockLabel, { color: colors.green }]}>Clocked In</Text>
                      </View>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.clockProject, { color: colors.secondary }]}>
                        {getProjectName(activeTimesheet.projectId)}
                      </Text>
                    </View>
                    {activeTimesheet.clockInTime ? (
                      <ElapsedTimer clockInTime={activeTimesheet.clockInTime} style={[styles.timerText, { color: colors.green }]} />
                    ) : (
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.timerText, { color: colors.green }]}>00:00:00</Text>
                    )}
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.clockStarted, { color: colors.secondary }]}>
                      Started {activeTimesheet.clockInTime ? formatTime12h(new Date(activeTimesheet.clockInTime).toTimeString().slice(0, 5)) : ''}
                    </Text>
                    <TouchableOpacity
                      style={[styles.clockButton, { backgroundColor: colors.red, opacity: clockingOut ? 0.7 : 1 }]}
                      onPress={handleClockOut}
                      disabled={clockingOut}
                    >
                      {clockingOut ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="stop" size={22} color="#fff" />
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.clockButtonText}>Clock Out</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={styles.clockInRow}>
                      <Ionicons name="time-outline" size={18} color={colors.secondary} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.clockInLabel, { color: colors.secondary }]}>Select a project or Business to clock in</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.projectSelector, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                      onPress={() => setShowProjectPicker(true)}
                    >
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.projectSelectorText, { color: clockInProjectId ? colors.text : colors.secondary }]}>
                        {clockInProjectId ? getProjectName(clockInProjectId) : 'Select project or Business...'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={colors.secondary} />
                    </TouchableOpacity>
                    {clockInProjectId ? (
                      <TouchableOpacity
                        style={[styles.projectSelector, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                        onPress={() => setShowClockInCostCodePicker(true)}
                      >
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.projectSelectorText, { color: clockInCostCodeId ? colors.text : colors.secondary }]}>
                          {clockInCostCodeId ? getCostCodeName(clockInCostCodeId) : 'Select cost code...'}
                        </Text>
                        <Ionicons name="chevron-down" size={18} color={colors.secondary} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.clockButton, { backgroundColor: (clockInProjectId && clockInCostCodeId) ? colors.green : colors.border, opacity: clockingIn ? 0.7 : 1 }]}
                      onPress={handleClockIn}
                      disabled={!clockInProjectId || !clockInCostCodeId || clockingIn}
                    >
                      {clockingIn ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="play" size={22} color={(clockInProjectId && clockInCostCodeId) ? '#fff' : colors.secondary} />
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.clockButtonText, { color: (clockInProjectId && clockInCostCodeId) ? '#fff' : colors.secondary }]}>Clock In</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Week Navigation */}
              <View style={[styles.weekNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity hitSlop={8} onPress={() => setWeekOffset(w => w - 1)} style={styles.weekArrow}>
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.weekCenter}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.weekRange, { color: colors.text }]}>
                    {formatShortDate(weekStart)} - {formatShortDate(weekEnd)}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.weekHours, { color: colors.secondary }]}>
                    {totalHours.toFixed(1)} hours this week
                  </Text>
                </View>
                <TouchableOpacity hitSlop={8} onPress={() => setWeekOffset(w => w + 1)} style={styles.weekArrow}>
                  <Ionicons name="chevron-forward" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </>
          }
          ListEmptyComponent={
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.emptyText, { color: colors.secondary }]}>No timesheets this week</Text>
          }
        />
      ) : (
        <WeeklyTimeGrid
          timesheets={filteredTimesheets}
          weekStart={weekStart}
          weekEnd={weekEnd}
          setWeekOffset={setWeekOffset}
          totalHours={totalHours}
          getProjectName={getProjectName}
          getCostCodeName={getCostCodeName}
          onSelectTimesheet={(ts) => { setSelectedTimesheet(ts); setShowDetail(true); }}
          colors={colors}
          isDark={isDark}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent }]}
        onPress={openLogSheet}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Project Picker for Clock In */}
      {renderPickerModal(
        showProjectPicker,
        () => setShowProjectPicker(false),
        'Select Project',
        getSortedProjectItems(projects),
        clockInProjectId,
        setClockInProjectId,
      )}

      {/* Timesheet detail */}
      <ModalSheet visible={showDetail} onRequestClose={() => setShowDetail(false)} title="Timesheet" onCancel={() => setShowDetail(false)}>
        {selectedTimesheet && (
          <ScrollView style={tsx.body} contentContainerStyle={tsx.bodyContent}>
            <Card variant="list">
              <PropertyRow key="date" label="Date" value={formatDayDate(selectedTimesheet.date)} />
              <PropertyRow key="project" label="Project" value={getProjectName(selectedTimesheet.projectId)} />
              {selectedTimesheet.clockInTime ? (
                <PropertyRow key="clock" label="Clocked in" value={formatTime12h(new Date(selectedTimesheet.clockInTime).toTimeString().slice(0, 5))} />
              ) : null}
              {selectedTimesheet.startTime && selectedTimesheet.endTime ? (
                <PropertyRow key="times" label="Start – end" value={`${formatTime12h(selectedTimesheet.startTime)} – ${formatTime12h(selectedTimesheet.endTime)}`} />
              ) : null}
              <PropertyRow key="hours" label="Hours">
                <Text style={[type.body, tabular, { color: k.text }]}>{`${parseFloat(selectedTimesheet.duration || '0').toFixed(1)}h`}</Text>
              </PropertyRow>
              {selectedTimesheet.breakDuration && parseFloat(selectedTimesheet.breakDuration) > 0 ? (
                <PropertyRow
                  key="break"
                  label="Break"
                  value={`${BREAK_OPTIONS.find(o => o.value === selectedTimesheet.breakDuration)?.label ?? `${selectedTimesheet.breakDuration} hrs`}${selectedTimesheet.breakStartTime ? ` from ${formatTime12h(selectedTimesheet.breakStartTime)}` : ''}`}
                />
              ) : null}
              <PropertyRow key="status" label="Status">
                <View style={tsx.status}>
                  <View style={[tsx.dot, { backgroundColor: getStatusColor(selectedTimesheet.status).text }]} />
                  <Text style={[type.body, { color: k.text }]}>
                    {selectedTimesheet.status.charAt(0).toUpperCase() + selectedTimesheet.status.slice(1)}
                  </Text>
                </View>
              </PropertyRow>
            </Card>
            {selectedTimesheet.description ? (
              <Card variant="notes">
                <Text style={[type.bodyRead, { color: k.textLong }]}>{selectedTimesheet.description}</Text>
              </Card>
            ) : null}
            {(selectedTimesheet.status === 'draft' || selectedTimesheet.status === 'submitted') &&
             selectedTimesheet.userId === user?.id ? (
              <>
                <ButtonRow>
                  <PrimaryButton label="Edit" icon={Pencil} onPress={() => openEditSheet(selectedTimesheet)} />
                </ButtonRow>
                <TextButton label="Delete timesheet" icon={Trash2} tone="danger" center onPress={() => handleDeleteTimesheet(selectedTimesheet.id)} />
              </>
            ) : null}
          </ScrollView>
        )}
      </ModalSheet>

      {/* Log hours / Edit */}
      <ModalSheet
        visible={showLogSheet}
        onRequestClose={() => logDirty.guard(() => { setShowLogSheet(false); resetForm(); })}
        title={isEditMode ? 'Edit timesheet' : 'Log hours'}
        cancelLabel="Cancel"
        onCancel={() => logDirty.guard(() => { setShowLogSheet(false); resetForm(); })}
        form
        keyboardBehavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // Primary action in a bottom bar: always in thumb reach, above the
        // keyboard and the home indicator.
        bottomBar={<PrimaryButton label={isEditMode ? 'Update' : 'Save timesheet'} onPress={handleSubmitTimesheet} loading={submitting} />}
      >
            <ScrollView {...logKb.scrollProps} style={tsx.body} contentContainerStyle={tsx.bodyContent}>
              {/* Clock-in info (read-only, shown when editing a clocked-in timesheet) */}
              {isEditMode && (() => {
                const editingTs = timesheets.find(ts => ts.id === editingId);
                const hasClock = editingTs?.clockInTime || (editingTs?.startTime && editingTs?.endTime);
                if (!hasClock) return null;
                return (
                  <Card variant="notes">
                    {editingTs?.clockInTime ? (
                      <Text style={[type.meta, { color: k.muted }]}>
                        {`Clocked in at ${formatTime12h(new Date(editingTs.clockInTime).toTimeString().slice(0, 5))}`}
                      </Text>
                    ) : null}
                    {editingTs?.startTime && editingTs?.endTime ? (
                      <Text style={[type.meta, { color: k.muted }]}>
                        {`Recorded ${formatTime12h(editingTs.startTime)} – ${formatTime12h(editingTs.endTime)}`}
                      </Text>
                    ) : null}
                  </Card>
                );
              })()}

              <Card variant="list">
                <PropertyRow
                  key="project"
                  form
                  label="Project"
                  value={formProjectId ? getProjectName(formProjectId) : undefined}
                  placeholder="Choose"
                  onPress={() => setShowFormProjectPicker(true)}
                />
                <PropertyRow
                  key="date"
                  form
                  label="Date"
                  value={formatDisplayDate(formDate)}
                  onPress={() => {
                    const parts = formDate.split('-');
                    const d = parts.length === 3
                      ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
                      : new Date();
                    setPickerDateObj(d);
                    setShowDatePicker(true);
                  }}
                />
                <PropertyRow key="start" form label="Start" value={formatTime12h(formStartTime)} onPress={() => setShowTimePicker('start')} />
                <PropertyRow key="end" form label="End" value={formatTime12h(formEndTime)} onPress={() => setShowTimePicker('end')} />
                <PropertyRow
                  key="break"
                  form
                  label="Break"
                  value={BREAK_OPTIONS.find(o => o.value === formBreakDuration)?.label ?? 'None'}
                  onPress={() => setShowBreakPicker(true)}
                />
                {parseFloat(formBreakDuration) > 0 ? (
                  <PropertyRow key="breakStart" form label="Break starts" value={formatTime12h(formBreakStartTime)} onPress={() => setShowBreakStartPicker(true)} />
                ) : null}
                <PropertyRow
                  key="costCode"
                  form
                  label="Cost code"
                  value={formCostCodeId ? getCostCodeName(formCostCodeId) || 'Selected' : undefined}
                  placeholder="Choose"
                  onPress={() => setShowCostCodePicker(true)}
                />
              </Card>
              <Text style={[type.meta, tabular, { color: k.muted }]}>
                {`${calculateDuration(formStartTime, formEndTime, formBreakDuration)} hours`}
              </Text>

              <View style={tsx.group}>
                <FieldLabel>Description</FieldLabel>
                <TextField
                  multilineBox
                  value={formDescription}
                  onChangeText={setFormDescription}
                  onFocus={logKb.onInputFocus}
                  placeholder="What did you work on?"
                  autoCapitalize="sentences"
                  accessibilityLabel="Description"
                />
              </View>
            </ScrollView>

            {/* Form picker modals — rendered inside the Log Hours modal so they stack
                correctly on top of it. Sibling modals cannot present over an already-open
                transparent Modal on iOS (Expo Go SDK 52). */}
            {renderPickerModal(
              showTimePicker !== null,
              () => setShowTimePicker(null),
              showTimePicker === 'start' ? 'Start Time' : 'End Time',
              TIME_OPTIONS.map(t => ({ id: t.value, label: t.label })),
              showTimePicker === 'start' ? formStartTime : formEndTime,
              (val) => {
                if (showTimePicker === 'start') setFormStartTime(val);
                else setFormEndTime(val);
              },
              timePickerListRef,
            )}
            {renderPickerModal(
              showFormProjectPicker,
              () => setShowFormProjectPicker(false),
              'Select Project',
              getSortedProjectItems(projects),
              formProjectId,
              setFormProjectId,
            )}
            {renderPickerModal(
              showBreakPicker,
              () => setShowBreakPicker(false),
              'Break Duration',
              BREAK_OPTIONS.map(o => ({ id: o.value, label: o.label })),
              formBreakDuration,
              setFormBreakDuration,
            )}
            {renderPickerModal(
              showBreakStartPicker,
              () => setShowBreakStartPicker(false),
              'Break Start Time',
              TIME_OPTIONS.map(t => ({ id: t.value, label: t.label })),
              formBreakStartTime,
              setFormBreakStartTime,
            )}
            {renderPickerModal(
              showCostCodePicker,
              () => setShowCostCodePicker(false),
              'Select Cost Code',
              [...costCodes].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).map(cc => ({ id: cc.id, label: `${cc.code} - ${cc.title}` })),
              formCostCodeId,
              setFormCostCodeId,
            )}
            {showDatePicker ? (
              Platform.OS === 'ios' ? (
                <ModalSheet
                  visible
                  onRequestClose={() => setShowDatePicker(false)}
                  title="Date"
                  cancelLabel="Cancel"
                  onCancel={() => setShowDatePicker(false)}
                  doneLabel="Done"
                  onDone={() => {
                    setFormDate(toLocalDateStr(pickerDateObj));
                    setShowDatePicker(false);
                  }}
                >
                  <DateTimePicker
                    value={pickerDateObj}
                    mode="date"
                    display="spinner"
                    onChange={(_event, date) => { if (date) setPickerDateObj(date); }}
                    themeVariant={isDark ? 'dark' : 'light'}
                    style={tsx.spinner}
                  />
                </ModalSheet>
              ) : (
                <DateTimePicker
                  value={pickerDateObj}
                  mode="date"
                  display="default"
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (event.type === 'set' && date) setFormDate(toLocalDateStr(date));
                  }}
                />
              )
            ) : null}
      </ModalSheet>

      {/* Clock-In Cost Code Picker — stays outside, unrelated to Log Hours form */}
      {renderPickerModal(
        showClockInCostCodePicker,
        () => setShowClockInCostCodePicker(false),
        'Select Cost Code',
        [...costCodes].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).map(cc => ({ id: cc.id, label: `${cc.code} - ${cc.title}` })),
        clockInCostCodeId,
        setClockInCostCodeId,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', flexShrink: 1 },
  headerToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 2,
  },
  toggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  clockCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  clockHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clockStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseDot: { width: 10, height: 10, borderRadius: 5 },
  clockLabel: { fontSize: 14, fontWeight: '600' },
  clockProject: { fontSize: 12 },
  timerText: { fontSize: 40, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginVertical: 8 },
  clockStarted: { fontSize: 13, marginBottom: 12 },
  clockButton: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  clockButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  clockInRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginBottom: 10 },
  clockInLabel: { fontSize: 13 },
  projectSelector: {
    width: '100%',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  projectSelectorText: { fontSize: 15 },

  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  weekArrow: { padding: 6 },
  weekCenter: { flex: 1, alignItems: 'center' },
  weekRange: { fontSize: 14, fontWeight: '500' },
  weekHours: { fontSize: 12, marginTop: 2 },

  entryCard: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  entryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryLeft: { flex: 1 },
  entryRight: { alignItems: 'flex-end', gap: 4 },
  entryDate: { fontSize: 14, fontWeight: '600' },
  entryProject: { fontSize: 13, marginTop: 2 },
  entryHours: { fontSize: 16, fontWeight: '700' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '500' },
  entryTime: { fontSize: 12, marginTop: 6 },
  entryDesc: { fontSize: 12, marginTop: 4 },

  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 32 },

});

const tsx = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center', paddingVertical: space.screenBottom },
  body: { paddingHorizontal: space.screenX },
  bodyContent: { gap: metrics.sheet.gap, paddingTop: space.inline, paddingBottom: space.screenBottom },
  group: { gap: metrics.form.labelGap },
  status: { flexDirection: 'row', alignItems: 'center', gap: metrics.statusDot.gap },
  dot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
  pickList: { marginHorizontal: space.screenX },
  pickContent: { paddingBottom: space.screenBottom },
  pickHeader: { justifyContent: 'flex-end', paddingBottom: space.inline, paddingHorizontal: space.inlineSm },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.rowGap,
    paddingHorizontal: space.cardX,
    borderBottomWidth: size.border,
  },
  spinner: { alignSelf: 'center' },
});
