import { memo, useState, type RefObject } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontSize, fontWeight, radius, type Theme } from '../../theme';
import { toLocalDateStr } from '../../lib/dates';
import {
  DAY_NAMES,
  formatTimeShort,
  getEventDurationMinutes,
  isEventAllDay,
  isToday,
  timeToMinutes,
  type CalendarEvent,
  type EventsByDay,
} from './shared';

// Scrolling 28-day time grid. Receives pre-bucketed eventsByDay and the
// minute tick (nowMinutes) — the only view that re-renders on the tick.

const SCREEN_WIDTH = Dimensions.get('window').width;
export const HOUR_HEIGHT = 56;
export const TIME_LABEL_WIDTH = 50;
export const GRID_COL_WIDTH = Math.floor((SCREEN_WIDTH - TIME_LABEL_WIDTH) / 3);
export const TOTAL_GRID_HEIGHT = 24 * HOUR_HEIGHT;
export const MIN_EVENT_HEIGHT = 24;
export const DAY_HEADER_HEIGHT = 56;
export const WEEK_TOTAL_DAYS = 28;

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12 AM';
  if (i < 12) return `${i} AM`;
  if (i === 12) return '12 PM';
  return `${i - 12} PM`;
});

interface WeekViewProps {
  theme: Theme;
  weekDays: Date[];
  eventsByDay: EventsByDay;
  nowMinutes: number;
  anyAllDayEvents: boolean;
  allDayExpanded: boolean;
  initialOffset: number;
  weekScrollRef: RefObject<ScrollView | null>;
  timeGridScrollRef: RefObject<ScrollView | null>;
  timeLabelScrollRef: RefObject<ScrollView | null>;
  onWeekScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onEventPress: (event: CalendarEvent) => void;
  /** Long-press on an empty time slot → create a task at that day + hour. */
  onSlotLongPress: (dateKey: string, hour: number) => void;
  /** No events anywhere in the 28-day window → show an empty hint. */
  isEmpty: boolean;
}

function WeekViewInner({
  theme,
  weekDays,
  eventsByDay,
  nowMinutes,
  anyAllDayEvents,
  allDayExpanded,
  initialOffset,
  weekScrollRef,
  timeGridScrollRef,
  timeLabelScrollRef,
  onWeekScroll,
  onEventPress,
  onSlotLongPress,
  isEmpty,
}: WeekViewProps) {
  const [allDayRowHeight, setAllDayRowHeight] = useState(0);
  const dayColsWidth = WEEK_TOTAL_DAYS * GRID_COL_WIDTH;

  return (
    // Single outer flex-row guarantees the left panel and right panel
    // are measured by the SAME layout pass, so their widths are
    // pixel-perfect matches with zero drift between rows.
    <View style={{ flex: 1, flexDirection: 'row' }}>

      {/* ══ LEFT PANEL (fixed TIME_LABEL_WIDTH) ══════════════════════════ */}
      <View style={{ width: TIME_LABEL_WIDTH, flexDirection: 'column' }}>

        {/* Row 1 spacer — same height as day-header row */}
        <View style={{
          height: DAY_HEADER_HEIGHT,
          backgroundColor: 'transparent',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border + '60',
        }} />

        {/* Row 2 label — height driven by right panel via allDayRowHeight state */}
        {anyAllDayEvents && allDayRowHeight > 0 && (
          <View style={{
            height: allDayRowHeight,
            justifyContent: 'center',
            alignItems: 'flex-end',
            paddingRight: 6,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.border,
            backgroundColor: theme.card,
          }}>
            <Text style={[styles.allDayLabel, { color: theme.textSecondary }]}>ALL</Text>
            <Text style={[styles.allDayLabel, { color: theme.textSecondary }]}>DAY</Text>
          </View>
        )}

        {/* Row 3 time labels — vertical scroll synced with timeGridScrollRef */}
        <ScrollView
          ref={timeLabelScrollRef}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {HOUR_LABELS.map((label, i) => (
            <View key={i} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start' }}>
              <Text style={[styles.hourLabel, { color: theme.textSecondary }]}>
                {i > 0 ? label : ''}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* ══ RIGHT PANEL (flex:1) — single horizontal ScrollView ═════════ */}
      <ScrollView
        ref={weekScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentOffset={{ x: initialOffset, y: 0 }}
        onScroll={onWeekScroll}
        scrollEventThrottle={32}
        decelerationRate="normal"
        nestedScrollEnabled
      >
        <View style={{ width: dayColsWidth, flex: 1 }}>

          {/* Row 1: Day headers */}
          <View style={{
            flexDirection: 'row',
            height: DAY_HEADER_HEIGHT,
            backgroundColor: 'transparent',
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.border + '60',
          }}>
            {weekDays.map((day, idx) => {
              const currentDay = isToday(day);
              const dowName = (DAY_NAMES[(day.getDay() + 6) % 7] || '').toUpperCase();
              const dateNum = day.getDate();
              return (
                <View
                  key={idx}
                  style={{
                    width: GRID_COL_WIDTH,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderLeftWidth: StyleSheet.hairlineWidth,
                    borderLeftColor: theme.border + '60',
                  }}
                >
                  <Text style={[
                    styles.dowName,
                    { color: currentDay ? theme.primary : theme.textSecondary },
                  ]}>
                    {dowName}
                  </Text>
                  {currentDay ? (
                    <View style={[styles.todayCircle, { backgroundColor: theme.primary }]}>
                      <Text style={styles.todayCircleText}>{dateNum}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.dateNum, { color: theme.textPrimary }]}>{dateNum}</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Row 2: All-day chips — fixed 36px single row when collapsed */}
          {anyAllDayEvents && (
            <View
              style={{
                flexDirection: 'row',
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
                backgroundColor: theme.card,
                height: allDayExpanded ? undefined : 36,
              }}
              onLayout={(e) => setAllDayRowHeight(e.nativeEvent.layout.height)}
            >
              {weekDays.map((day, dayIdx) => {
                const dayAllEvents = (eventsByDay[toLocalDateStr(day)] || []).filter(e => isEventAllDay(e));
                const visibleEvents = allDayExpanded ? dayAllEvents : dayAllEvents.slice(0, 1);
                const overflowCount = !allDayExpanded ? Math.max(0, dayAllEvents.length - 1) : 0;
                return (
                  <View
                    key={dayIdx}
                    style={{
                      width: GRID_COL_WIDTH,
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderLeftColor: theme.border,
                      paddingHorizontal: 2,
                      paddingVertical: 5,
                      gap: 2,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {visibleEvents.map(event => (
                      <TouchableOpacity
                        key={event.id}
                        style={{
                          height: 22,
                          backgroundColor: (event.color || theme.textMuted) + '30',
                          borderRadius: radius.sm + 1,
                          borderLeftWidth: 3,
                          borderLeftColor: event.color || theme.textMuted,
                          paddingLeft: 4,
                          paddingRight: overflowCount > 0 ? 22 : 4,
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                        onPress={() => onEventPress(event)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[styles.allDayChipText, { color: theme.textPrimary }]}
                          numberOfLines={1}
                        >
                          {event.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {allDayExpanded && dayAllEvents.length > 1 && (
                      <Text style={[styles.allDayMore, { color: theme.textSecondary }]}>
                        +{dayAllEvents.length - 1} more
                      </Text>
                    )}
                    {!allDayExpanded && overflowCount > 0 && (
                      <View style={[styles.allDayOverflow, { backgroundColor: theme.textSecondary + '30' }]}>
                        <Text style={[styles.allDayOverflowText, { color: theme.textSecondary }]}>
                          +{overflowCount}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Row 3: Time grid */}
          <ScrollView
            ref={timeGridScrollRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ height: TOTAL_GRID_HEIGHT }}
            onLayout={() => {
              setTimeout(() => {
                const n = new Date();
                const mins = n.getHours() * 60 + n.getMinutes();
                const y = Math.max(0, (mins / 60) * HOUR_HEIGHT - 120);
                timeGridScrollRef.current?.scrollTo({ y, animated: false });
                timeLabelScrollRef.current?.scrollTo({ y, animated: false });
              }, 100);
            }}
            onScroll={(e) => {
              timeLabelScrollRef.current?.scrollTo({
                y: e.nativeEvent.contentOffset.y,
                animated: false,
              });
            }}
            scrollEventThrottle={16}
          >
            <View style={{ flexDirection: 'row', height: TOTAL_GRID_HEIGHT }}>
              {weekDays.map((day, dayIdx) => {
                const dateKey = toLocalDateStr(day);
                const currentDay = isToday(day);
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
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
                // This means non-overlapping events keep full width; only truly concurrent
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

                const colPad = 2;
                const usableWidth = GRID_COL_WIDTH - colPad * 2;
                const minLaneWidth = GRID_COL_WIDTH * 0.55;
                const STACK_OFFSET = 10;

                return (
                  <Pressable
                    key={dayIdx}
                    style={{
                      width: GRID_COL_WIDTH,
                      height: TOTAL_GRID_HEIGHT,
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderLeftColor: theme.border,
                      backgroundColor: currentDay ? theme.primary + '0D' : isWeekend ? theme.border + '30' : 'transparent',
                    }}
                    onLongPress={(e) => {
                      const hour = Math.min(23, Math.max(0, Math.floor(e.nativeEvent.locationY / HOUR_HEIGHT)));
                      onSlotLongPress(dateKey, hour);
                    }}
                  >
                    {HOUR_LABELS.map((_, hourIdx) => (
                      <View
                        key={hourIdx}
                        style={{
                          position: 'absolute',
                          top: hourIdx * HOUR_HEIGHT,
                          left: 0,
                          right: 0,
                          height: 1,
                          backgroundColor: theme.border,
                          opacity: 0.6,
                        }}
                      />
                    ))}

                    {currentDay && (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: 0,
                          width: GRID_COL_WIDTH,
                          top: (nowMinutes / 60) * HOUR_HEIGHT - 1,
                          zIndex: 10,
                        }}
                      >
                        <View style={[styles.nowDot, { backgroundColor: theme.primary }]} />
                        <View style={[styles.nowLine, { backgroundColor: theme.primary, width: GRID_COL_WIDTH }]} />
                      </View>
                    )}

                    {layoutEvents.map(({ event, startMin, endMin }) => {
                      const top = (startMin / 60) * HOUR_HEIGHT;
                      const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);
                      const eventColor = event.color || theme.textMuted;
                      const la = laneAssignment.get(event.id);
                      const lane = la?.lane ?? 0;
                      const tl = la?.totalLanes ?? 1;
                      const naturalLaneWidth = usableWidth / tl;
                      const stacking = naturalLaneWidth < minLaneWidth && tl > 1;
                      const left = stacking
                        ? colPad + lane * STACK_OFFSET
                        : colPad + lane * naturalLaneWidth;
                      const rawBlockWidth = stacking
                        ? Math.max(usableWidth - lane * STACK_OFFSET, minLaneWidth)
                        : naturalLaneWidth - 1;
                      const blockWidth = Math.min(rawBlockWidth, GRID_COL_WIDTH - left - colPad);
                      const zIndex = stacking ? 1 + lane : 1;

                      const overlapCount = overlapCounts.get(event.id) ?? 0;

                      return (
                        // Solid card base under the colour tint so stacked
                        // blocks don't blend through each other.
                        <TouchableOpacity
                          key={event.id}
                          style={{
                            position: 'absolute',
                            top,
                            left,
                            width: blockWidth,
                            height,
                            backgroundColor: theme.card,
                            borderRadius: radius.md,
                            overflow: 'hidden',
                            zIndex,
                          }}
                          onPress={() => onEventPress(event)}
                          activeOpacity={0.75}
                        >
                          {/* Contrast-safe tint: colour wash + ink text, like the all-day chips */}
                          <View style={{
                            flex: 1,
                            flexDirection: 'row',
                            backgroundColor: eventColor + '30',
                          }}>
                            <View style={{
                              width: 4,
                              backgroundColor: eventColor,
                              borderTopLeftRadius: radius.md,
                              borderBottomLeftRadius: radius.md,
                            }} />
                            <View style={{ flex: 1, paddingHorizontal: 5, paddingTop: 4, overflow: 'hidden' }}>
                              <Text
                                style={[styles.blockTitle, { color: theme.textPrimary }]}
                                numberOfLines={2}
                              >
                                {event.title}
                              </Text>
                              {height > 34 && event.startTime && (
                                <Text style={[styles.blockTime, { color: theme.textSecondary }]}>
                                  {formatTimeShort(event.startTime)}
                                </Text>
                              )}
                            </View>
                            {overlapCount > 0 && (
                              <View style={[styles.overlapBadge, { backgroundColor: theme.textPrimary + '22' }]}>
                                <Text style={[styles.overlapBadgeText, { color: theme.textPrimary }]}>
                                  +{overlapCount}
                                </Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

        </View>
      </ScrollView>

      {/* Empty window hint — grid stays interactive underneath */}
      {isEmpty && (
        <View pointerEvents="none" style={styles.emptyOverlay}>
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="calendar-outline" size={28} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No events this week</Text>
            <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
              Long-press a time slot to add a task.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export const WeekView = memo(WeekViewInner);

const styles = StyleSheet.create({
  allDayLabel: { fontSize: fontSize.label, fontWeight: fontWeight.medium },
  hourLabel: {
    fontSize: fontSize.label,
    textAlign: 'right',
    paddingRight: 8,
    fontWeight: fontWeight.regular,
    lineHeight: 12,
    marginTop: -6,
  },
  dowName: {
    fontSize: fontSize.data,
    fontWeight: fontWeight.medium,
    marginBottom: 4,
  },
  todayCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCircleText: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  dateNum: { fontSize: fontSize.base, fontWeight: fontWeight.regular },
  allDayChipText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  allDayMore: { fontSize: fontSize.label, textAlign: 'center' },
  allDayOverflow: {
    position: 'absolute',
    right: 4,
    top: 6,
    height: 20,
    minWidth: 20,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDayOverflowText: { fontSize: fontSize.label, fontWeight: fontWeight.semibold },
  nowDot: {
    position: 'absolute',
    left: 0,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: radius.sm,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    height: 2,
  },
  blockTitle: {
    fontSize: fontSize.data,
    fontWeight: fontWeight.semibold,
    lineHeight: 13,
  },
  blockTime: { fontSize: fontSize.label, marginTop: 1 },
  overlapBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    borderRadius: radius.lg,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  overlapBadgeText: { fontSize: fontSize.xxs, fontWeight: fontWeight.semibold },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: radius.xl,
    borderWidth: 1,
    maxWidth: 260,
  },
  emptyTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  emptyDesc: { fontSize: fontSize.xs, textAlign: 'center' },
});
