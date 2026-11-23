import { memo, useRef, useState, type RefObject } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react-native';
import { metrics, radii, size, tabular, type, useColors } from '../../theme';
import { toLocalDateStr } from '../../lib/dates';
import { useLayout } from '../../lib/useLayout';
import { CalendarBlock, NowLine } from '../kit';
import {
  DAY_NAMES,
  eventBlockColor,
  formatClock,
  formatClockRange,
  getEventDurationMinutes,
  isEventAllDay,
  isToday,
  timeToMinutes,
  type CalendarEvent,
  type EventsByDay,
} from './shared';
import type { ScrollViewInstance } from 'react-native';

// Scrolling 28-day time grid. Receives pre-bucketed eventsByDay and the
// minute tick (nowMinutes) — the only view that re-renders on the tick.

const K = metrics.calendar;

export const HOUR_HEIGHT = K.hourHeight;
export const TIME_LABEL_WIDTH = K.gutter;
/** How many day columns fit on screen at once on a phone. */
export const WEEK_VISIBLE_DAYS = 3;
/** On a wide screen (Duo unfolded) the whole Mon–Sun week fits. */
export const WEEK_VISIBLE_DAYS_WIDE = 7;

/** Day columns on screen right now — changes live on fold/unfold. */
export function useWeekVisibleDays(): number {
  const { isWide } = useLayout();
  return isWide ? WEEK_VISIBLE_DAYS_WIDE : WEEK_VISIBLE_DAYS;
}

/**
 * Width of one day column. A hook (not a constant) because the screen can
 * change size while the app runs — fold/unfold on a foldable. CalendarScreen
 * reads the same hook for its scroll maths, so the two always agree.
 */
export function useWeekColWidth(): number {
  const { width } = useLayout();
  const visibleDays = useWeekVisibleDays();
  return Math.floor((width - K.padX * 2 - TIME_LABEL_WIDTH) / visibleDays);
}
export const TOTAL_GRID_HEIGHT = 24 * HOUR_HEIGHT;
export const MIN_EVENT_HEIGHT = K.minEvent;
export const DAY_HEADER_HEIGHT = K.dayHeader;
export const WEEK_TOTAL_DAYS = 28;

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12 AM';
  if (i < 12) return `${i} AM`;
  if (i === 12) return '12 PM';
  return `${i - 12} PM`;
});

interface WeekViewProps {
  weekDays: Date[];
  eventsByDay: EventsByDay;
  nowMinutes: number;
  anyAllDayEvents: boolean;
  allDayExpanded: boolean;
  /** "+N more" / "Less" under the all-day row. */
  onToggleAllDay: () => void;
  initialOffset: number;
  weekScrollRef: RefObject<ScrollViewInstance | null>;
  timeGridScrollRef: RefObject<ScrollViewInstance | null>;
  timeLabelScrollRef: RefObject<ScrollViewInstance | null>;
  onWeekScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Wide screens snap the week scroll to these x offsets (Mondays). */
  snapOffsets?: number[];
  onEventPress: (event: CalendarEvent) => void;
  /** Long-press on an empty time slot → create a task at that day + hour. */
  onSlotLongPress: (dateKey: string, hour: number) => void;
  /** No events anywhere in the 28-day window → show an empty hint. */
  isEmpty: boolean;
}

function WeekViewInner({
  weekDays,
  eventsByDay,
  nowMinutes,
  anyAllDayEvents,
  allDayExpanded,
  onToggleAllDay,
  initialOffset,
  weekScrollRef,
  timeGridScrollRef,
  timeLabelScrollRef,
  onWeekScroll,
  snapOffsets,
  onEventPress,
  onSlotLongPress,
  isEmpty,
}: WeekViewProps) {
  const c = useColors();
  const [allDayRowHeight, setAllDayRowHeight] = useState(0);
  // The time grid's onLayout scrolls to "now". It also fires when a fold or
  // unfold resizes the grid; that must keep the user's vertical position, so a
  // layout caused by a window-size change is skipped. (Other re-layouts, e.g.
  // the all-day row expanding, behave as before.)
  const { width: windowWidth, height: windowHeight } = useLayout();
  const windowKey = `${windowWidth}x${windowHeight}`;
  const lastLayoutWindow = useRef<string | null>(null);
  const GRID_COL_WIDTH = useWeekColWidth();
  const dayColsWidth = WEEK_TOTAL_DAYS * GRID_COL_WIDTH;
  const nowY = (nowMinutes / 60) * HOUR_HEIGHT;
  const nowLabel = formatClock(`${Math.floor(nowMinutes / 60)}:${nowMinutes % 60}`);

  const allDayFor = (day: Date) => (eventsByDay[toLocalDateStr(day)] || []).filter(e => isEventAllDay(e));
  const anyOverflow = weekDays.some(d => allDayFor(d).length > 1);

  return (
    // Single outer flex-row guarantees the left panel and right panel
    // are measured by the SAME layout pass, so their widths are
    // pixel-perfect matches with zero drift between rows.
    <View style={[wx.root, { paddingHorizontal: K.padX }]}>

      {/* ══ LEFT PANEL (fixed gutter) ═════════════════════════════════════ */}
      <View style={{ width: TIME_LABEL_WIDTH }}>
        <View style={{ height: DAY_HEADER_HEIGHT }} />

        {/* "All day" — height follows the right panel's all-day row */}
        {anyAllDayEvents && allDayRowHeight > 0 && (
          <View style={[wx.allDayGutter, { height: allDayRowHeight, borderBottomColor: c.hairline }]}>
            <Text style={[type.tiny, { color: c.muted }]}>All day</Text>
          </View>
        )}

        {/* Hour labels — vertical scroll synced with timeGridScrollRef */}
        <ScrollView ref={timeLabelScrollRef} scrollEnabled={false} showsVerticalScrollIndicator={false} style={wx.flex}>
          <View style={{ height: TOTAL_GRID_HEIGHT }}>
            {HOUR_LABELS.map((label, i) => {
              const y = i * HOUR_HEIGHT;
              // The now label takes over where it would collide with an hour.
              const hidden = i === 0 || Math.abs(y - nowY) < K.nowLabelClear;
              return hidden ? null : (
                <Text key={i} style={[type.tiny, wx.hourLabel, { top: y, color: c.muted }]}>
                  {label}
                </Text>
              );
            })}
            <Text style={[type.tiny, tabular, wx.hourLabel, { top: nowY, color: c.accent }]}>{nowLabel}</Text>
          </View>
        </ScrollView>
      </View>

      {/* ══ RIGHT PANEL — single horizontal ScrollView ═════════════════════ */}
      <ScrollView
        ref={weekScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={wx.flex}
        contentOffset={{ x: initialOffset, y: 0 }}
        onScroll={onWeekScroll}
        scrollEventThrottle={32}
        snapToOffsets={snapOffsets}
        decelerationRate="normal"
        nestedScrollEnabled
      >
        <View style={{ width: dayColsWidth, flex: 1 }}>

          {/* Row 1: day headers — THU over 19; today = accent circle */}
          <View style={[wx.row, { height: DAY_HEADER_HEIGHT }]}>
            {weekDays.map((day, idx) => {
              const today = isToday(day);
              const dow = (DAY_NAMES[(day.getDay() + 6) % 7] || '').toUpperCase();
              return (
                <View key={idx} style={[wx.dayHead, { width: GRID_COL_WIDTH }]} accessibilityLabel={day.toDateString()}>
                  <Text style={[type.micro, { color: today ? c.accent : c.muted }]}>{dow}</Text>
                  {today ? (
                    <View style={[wx.todayCircle, { backgroundColor: c.accent }]}>
                      <Text style={[type.rowTitleMedium, tabular, { color: c.onAccent }]}>{day.getDate()}</Text>
                    </View>
                  ) : (
                    <Text style={[type.rowTitle, tabular, wx.dateNum, { color: c.text }]}>{day.getDate()}</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Row 2: all-day — one chip per day, "+N more" expands */}
          {anyAllDayEvents && (
            <View
              style={[wx.row, wx.allDayRow, { borderBottomColor: c.hairline }]}
              onLayout={(e) => setAllDayRowHeight(e.nativeEvent.layout.height)}
            >
              {weekDays.map((day, dayIdx) => {
                const all = allDayFor(day);
                const shown = allDayExpanded ? all : all.slice(0, 1);
                const hiddenCount = all.length - shown.length;
                return (
                  <View key={dayIdx} style={[wx.allDayCol, { width: GRID_COL_WIDTH }]}>
                    {shown.map(event => (
                      <Pressable
                        key={event.id}
                        onPress={() => onEventPress(event)}
                        accessibilityRole="button"
                        accessibilityLabel={`${event.title}, all day`}
                        style={({ pressed }) => ({ opacity: pressed ? metrics.pressedOpacity : 1 })}
                      >
                        <CalendarBlock variant="allDay" title={event.title} color={eventBlockColor(event)} />
                      </Pressable>
                    ))}
                    {hiddenCount > 0 || (allDayExpanded && all.length > 1) ? (
                      <Pressable onPress={onToggleAllDay} hitSlop={metrics.hitSlop} accessibilityRole="button" style={wx.more}>
                        <Text style={[type.meta, tabular, { color: c.muted }]}>
                          {hiddenCount > 0 ? `+${hiddenCount} more` : 'Less'}
                        </Text>
                        {hiddenCount > 0 ? (
                          <ChevronDown size={size.icon.caret} color={c.muted} strokeWidth={metrics.iconStroke} />
                        ) : (
                          <ChevronUp size={size.icon.caret} color={c.muted} strokeWidth={metrics.iconStroke} />
                        )}
                      </Pressable>
                    ) : anyOverflow && !allDayExpanded ? (
                      // Keep the chips on one line across days.
                      <View style={wx.morePlaceholder} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          {/* Row 3: time grid */}
          <ScrollView
            ref={timeGridScrollRef}
            style={wx.flex}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ height: TOTAL_GRID_HEIGHT }}
            onLayout={() => {
              const windowChanged = lastLayoutWindow.current !== null && lastLayoutWindow.current !== windowKey;
              lastLayoutWindow.current = windowKey;
              if (windowChanged) return;
              setTimeout(() => {
                const n = new Date();
                const mins = n.getHours() * 60 + n.getMinutes();
                const y = Math.max(0, (mins / 60) * HOUR_HEIGHT - 120);
                timeGridScrollRef.current?.scrollTo({ y, animated: false });
                timeLabelScrollRef.current?.scrollTo({ y, animated: false });
              }, 100);
            }}
            onScroll={(e) => {
              timeLabelScrollRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false });
            }}
            scrollEventThrottle={16}
          >
            <View style={[wx.row, { height: TOTAL_GRID_HEIGHT }]}>
              {weekDays.map((day, dayIdx) => {
                const dateKey = toLocalDateStr(day);
                const today = isToday(day);
                const dayEvents = (eventsByDay[dateKey] || []).filter(e => !isEventAllDay(e) && e.startTime);

                const allLayoutEvents = dayEvents.map(event => {
                  const startMin = timeToMinutes(event.startTime!);
                  const durationMin = getEventDurationMinutes(event.startTime!, event.endTime);
                  return { event, startMin, endMin: startMin + durationMin };
                }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

                // Collapse events that share the exact same start time:
                // keep only the first one and remember how many were hidden.
                const overlapCounts = new Map<string, number>();
                const seenStartMin = new Set<number>();
                const layoutEvents: typeof allLayoutEvents = [];
                for (const le of allLayoutEvents) {
                  if (seenStartMin.has(le.startMin)) {
                    const prev = layoutEvents.find(x => x.startMin === le.startMin);
                    if (prev) {
                      overlapCounts.set(prev.event.id, (overlapCounts.get(prev.event.id) ?? 0) + 1);
                    }
                    continue;
                  }
                  seenStartMin.add(le.startMin);
                  layoutEvents.push(le);
                }

                // Assign each event to the first available column (lane)
                const laneEndTimes: number[] = [];
                const laneAssignment = new Map<string, { lane: number; totalLanes: number }>();
                for (const le of layoutEvents) {
                  let placed = false;
                  for (let i = 0; i < laneEndTimes.length; i++) {
                    if (laneEndTimes[i] <= le.startMin) {
                      laneEndTimes[i] = le.endMin;
                      laneAssignment.set(le.event.id, { lane: i, totalLanes: 1 });
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) {
                    laneAssignment.set(le.event.id, { lane: laneEndTimes.length, totalLanes: 1 });
                    laneEndTimes.push(le.endMin);
                  }
                }
                // For each event, totalLanes = max simultaneous events during its duration.
                // Non-overlapping events keep full width; only truly concurrent
                // events split the column — matching the web calendar behaviour.
                for (const le of layoutEvents) {
                  const checkTimes = [le.startMin, ...layoutEvents.map(x => x.startMin).filter(t => t > le.startMin && t < le.endMin)];
                  let max = 1;
                  for (const t of checkTimes) {
                    const concurrent = layoutEvents.filter(x => x.startMin <= t && x.endMin > t).length;
                    if (concurrent > max) max = concurrent;
                  }
                  laneAssignment.get(le.event.id)!.totalLanes = max;
                }

                const colPad = K.colPad;
                const usableWidth = GRID_COL_WIDTH - colPad * 2;
                const minLaneWidth = GRID_COL_WIDTH * 0.55;

                return (
                  <Pressable
                    key={dayIdx}
                    style={{
                      width: GRID_COL_WIDTH,
                      height: TOTAL_GRID_HEIGHT,
                      borderLeftWidth: size.border,
                      borderLeftColor: c.hairline,
                      backgroundColor: today ? c.todayColumn : 'transparent',
                    }}
                    onLongPress={(e) => {
                      const hour = Math.min(23, Math.max(0, Math.floor(e.nativeEvent.locationY / HOUR_HEIGHT)));
                      onSlotLongPress(dateKey, hour);
                    }}
                  >
                    {HOUR_LABELS.map((_, hourIdx) => (
                      <View
                        key={hourIdx}
                        style={[wx.hourLine, { top: hourIdx * HOUR_HEIGHT, backgroundColor: c.hairline }]}
                      />
                    ))}

                    {layoutEvents.map(({ event, startMin, endMin }) => {
                      const top = (startMin / 60) * HOUR_HEIGHT;
                      const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);
                      const la = laneAssignment.get(event.id);
                      const lane = la?.lane ?? 0;
                      const tl = la?.totalLanes ?? 1;
                      const naturalLaneWidth = usableWidth / tl;
                      const stacking = naturalLaneWidth < minLaneWidth && tl > 1;
                      const left = stacking ? colPad + lane * K.stackOffset : colPad + lane * naturalLaneWidth;
                      const rawBlockWidth = stacking
                        ? Math.max(usableWidth - lane * K.stackOffset, minLaneWidth)
                        : naturalLaneWidth - 1;
                      const blockWidth = Math.min(rawBlockWidth, GRID_COL_WIDTH - left - colPad);
                      const overlapCount = overlapCounts.get(event.id) ?? 0;

                      return (
                        <Pressable
                          key={event.id}
                          onPress={() => onEventPress(event)}
                          accessibilityRole="button"
                          accessibilityLabel={`${event.title}, ${formatClockRange(event.startTime, event.endTime)}`}
                          style={({ pressed }) => [
                            wx.block,
                            {
                              top,
                              left,
                              width: blockWidth,
                              height,
                              zIndex: stacking ? 1 + lane : 1,
                              // Solid base so stacked blocks don't blend through.
                              backgroundColor: c.bg,
                              opacity: pressed ? metrics.pressedOpacity : 1,
                            },
                          ]}
                        >
                          <CalendarBlock
                            title={event.title}
                            time={formatClockRange(event.startTime, event.endTime)}
                            color={eventBlockColor(event)}
                            height={height}
                          />
                          {overlapCount > 0 && (
                            <View style={[wx.overlapBadge, { backgroundColor: c.surface, borderColor: c.border }]}>
                              <Text style={[type.tiny, tabular, { color: c.muted }]}>+{overlapCount}</Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}

                    {/* Now: 2dp line + dot across today, faint 1dp elsewhere */}
                    <View pointerEvents="none" style={[wx.now, { top: nowY - (today ? metrics.divider.nowDot / 2 : 0) }]}>
                      {today ? <NowLine /> : <NowLine faint />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

        </View>
      </ScrollView>

      {/* Empty window hint — grid stays interactive underneath */}
      {isEmpty && (
        <View pointerEvents="none" style={wx.emptyOverlay}>
          <View style={[wx.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <CalendarDays size={metrics.emptyState.icon} color={c.muted} strokeWidth={metrics.iconStroke} />
            <Text style={[type.rowTitleMedium, { color: c.text }]}>No events this week</Text>
            <Text style={[type.meta, wx.center, { color: c.muted }]}>Long-press a time slot to add a task.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export const WeekView = memo(WeekViewInner);

const wx = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  dayHead: { alignItems: 'center', justifyContent: 'center', gap: K.dayHeaderGap },
  todayCircle: { width: K.dateCircle, height: K.dateCircle, borderRadius: K.dateCircle / 2, alignItems: 'center', justifyContent: 'center' },
  dateNum: { lineHeight: K.dateCircle },
  allDayGutter: { justifyContent: 'flex-start', paddingTop: K.allDayPadY + K.allDayGap, borderBottomWidth: size.border },
  allDayRow: { borderBottomWidth: size.border },
  allDayCol: { paddingHorizontal: K.colPad, paddingVertical: K.allDayPadY, gap: K.allDayGap },
  more: { flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.toggleGap, alignSelf: 'flex-start' },
  morePlaceholder: { height: type.meta.lineHeight },
  hourLabel: { position: 'absolute', left: 0, marginTop: -type.tiny.lineHeight / 2 },
  hourLine: { position: 'absolute', left: 0, right: 0, height: size.border },
  block: { position: 'absolute', borderRadius: radii.sm, overflow: 'hidden' },
  overlapBadge: {
    position: 'absolute',
    bottom: K.colPad,
    right: K.colPad,
    borderRadius: radii.pill,
    borderWidth: size.border,
    paddingHorizontal: metrics.badge.padX - 1,
  },
  now: { position: 'absolute', left: 0, right: 0, zIndex: 10 },
  emptyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  emptyCard: {
    alignItems: 'center',
    gap: metrics.emptyState.gap,
    paddingVertical: metrics.card.padBottom + metrics.card.padTop / 2,
    paddingHorizontal: metrics.projects.cardPad * 2,
    borderRadius: radii.card,
    borderWidth: size.border,
    maxWidth: metrics.emptyState.maxWidth,
  },
  center: { textAlign: 'center' },
});
