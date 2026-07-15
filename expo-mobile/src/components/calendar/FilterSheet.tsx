import type { RefObject } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { haptic } from '../../lib/haptics';
import { fontSize, fontWeight, radius, type Theme } from '../../theme';
import { EVENT_COLORS } from './shared';

// The calendar's filter sheet: event types, schedule assignment, task
// statuses, and display options. All filter state lives in CalendarScreen.

export interface CalendarFilters {
  eventTypes?: string[];
  taskStatuses?: string[];
  excludedTaskStatuses?: string[];
  assignedToMe?: boolean;
  scheduleAssignedToMe?: boolean;
  scheduleAssignedToCompany?: boolean;
  hideScheduleParents?: boolean;
  hideScheduleChildren?: boolean;
}

interface TaskStatusOption {
  value: string;
  label: string;
  color: string;
}

export const EVENT_TYPE_OPTIONS = [
  { value: 'task', label: 'Tasks', icon: 'checkmark-circle-outline' as const },
  { value: 'schedule', label: 'Schedule', icon: 'construct-outline' as const },
  { value: 'timesheet', label: 'Timesheets', icon: 'time-outline' as const },
  { value: 'site_diary', label: 'Site Diary', icon: 'book-outline' as const },
  { value: 'google_cal', label: 'Google', icon: 'calendar-outline' as const },
];

interface FilterSheetProps {
  sheetRef: RefObject<SheetRef | null>;
  theme: Theme;
  activeFilters: CalendarFilters;
  setActiveFilters: (filters: CalendarFilters) => void;
  activeFilterCount: number;
  taskStatusOptions: TaskStatusOption[];
  googleConnected: boolean;
  showStatusChips: boolean;
  onToggleStatusChips: () => void;
  canSaveFilters: boolean;
  onSaveFiltersToView: () => void;
}

export function FilterSheet({
  sheetRef,
  theme,
  activeFilters,
  setActiveFilters,
  activeFilterCount,
  taskStatusOptions,
  googleConnected,
  showStatusChips,
  onToggleStatusChips,
  canSaveFilters,
  onSaveFiltersToView,
}: FilterSheetProps) {
  return (
    <Sheet ref={sheetRef} title="Filter Events" scrollable snapPoints={['85%']}>
      <View style={styles.sheetBody}>
        <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
          Select types to show. Leave all off to show everything.
        </Text>

        <View style={{ marginTop: 12, gap: 4 }}>
          <TouchableOpacity
            style={[
              styles.filterRow,
              { borderColor: theme.border },
              activeFilters.assignedToMe && { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' },
            ]}
            onPress={() => { haptic.select(); setActiveFilters({ ...activeFilters, assignedToMe: activeFilters.assignedToMe ? undefined : true }); }}
            activeOpacity={0.7}
          >
            <View style={[styles.filterColorDot, { backgroundColor: theme.primary }]} />
            <Ionicons name="person-outline" size={18} color={activeFilters.assignedToMe ? theme.primary : theme.textSecondary} />
            <Text style={[styles.filterRowText, { color: activeFilters.assignedToMe ? theme.textPrimary : theme.textSecondary }]}>
              Assigned to me
            </Text>
            {activeFilters.assignedToMe && (
              <Ionicons name="checkmark-circle" size={18} color={theme.primary} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        </View>

        {(!activeFilters.eventTypes || activeFilters.eventTypes.includes('schedule')) && (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.filterSectionLabel, { color: theme.textSecondary }]}>Schedule Items</Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              {([
                { key: 'scheduleAssignedToMe' as const, label: 'Assigned to me', icon: 'person-outline' as const },
                { key: 'scheduleAssignedToCompany' as const, label: 'Assigned to company', icon: 'business-outline' as const },
              ] as const).map(opt => {
                const isOn = !!activeFilters[opt.key];
                const scheduleColor = EVENT_COLORS.schedule;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.filterRow,
                      { borderColor: theme.border },
                      isOn && { backgroundColor: scheduleColor + '15', borderColor: scheduleColor + '40' },
                    ]}
                    onPress={() => { haptic.select(); setActiveFilters({ ...activeFilters, [opt.key]: isOn ? undefined : true }); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.filterColorDot, { backgroundColor: isOn ? scheduleColor : theme.textMuted }]} />
                    <Ionicons name={opt.icon} size={18} color={isOn ? scheduleColor : theme.textSecondary} />
                    <Text style={[styles.filterRowText, { color: isOn ? theme.textPrimary : theme.textSecondary }]}>
                      {opt.label}
                    </Text>
                    {isOn && (
                      <Ionicons name="checkmark-circle" size={18} color={scheduleColor} style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {(() => {
                const scheduleColor = EVENT_COLORS.schedule;
                const parentsVisible = !activeFilters.hideScheduleParents;
                const childrenVisible = !activeFilters.hideScheduleChildren;
                return (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([
                      { hideKey: 'hideScheduleParents' as const, label: 'Parents', icon: 'git-branch-outline' as const, isOn: parentsVisible },
                      { hideKey: 'hideScheduleChildren' as const, label: 'Sub-items', icon: 'return-down-forward-outline' as const, isOn: childrenVisible },
                    ]).map(btn => (
                      <TouchableOpacity
                        key={btn.hideKey}
                        style={[
                          styles.filterRow,
                          { flex: 1, justifyContent: 'center', borderColor: theme.border },
                          btn.isOn && { backgroundColor: scheduleColor + '15', borderColor: scheduleColor + '40' },
                        ]}
                        onPress={() => { haptic.select(); setActiveFilters({ ...activeFilters, [btn.hideKey]: btn.isOn ? true : undefined }); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={btn.icon} size={16} color={btn.isOn ? scheduleColor : theme.textSecondary} />
                        <Text style={[styles.filterRowText, { color: btn.isOn ? theme.textPrimary : theme.textSecondary }]}>
                          {btn.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
            </View>
          </View>
        )}

        <View style={{ marginTop: 12, gap: 4 }}>
          {EVENT_TYPE_OPTIONS.filter(opt => opt.value !== 'google_cal' || googleConnected).map(opt => {
            const isSelected = activeFilters.eventTypes?.includes(opt.value) ?? false;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.filterRow,
                  { borderColor: theme.border },
                  isSelected && { backgroundColor: EVENT_COLORS[opt.value] + '15', borderColor: EVENT_COLORS[opt.value] + '40' },
                ]}
                onPress={() => {
                  haptic.select();
                  const current = activeFilters.eventTypes || [];
                  const updated = isSelected
                    ? current.filter(t => t !== opt.value)
                    : [...current, opt.value];
                  setActiveFilters({ ...activeFilters, eventTypes: updated.length > 0 ? updated : undefined });
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.filterColorDot, { backgroundColor: EVENT_COLORS[opt.value] }]} />
                <Ionicons name={opt.icon} size={18} color={isSelected ? EVENT_COLORS[opt.value] : theme.textSecondary} />
                <Text style={[styles.filterRowText, { color: isSelected ? theme.textPrimary : theme.textSecondary }]}>
                  {opt.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={18} color={EVENT_COLORS[opt.value]} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {(!activeFilters.eventTypes || activeFilters.eventTypes.includes('task')) && taskStatusOptions.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.filterSectionLabel, { color: theme.textSecondary }]}>Task Status</Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              {taskStatusOptions.map(opt => {
                const isOff = activeFilters.excludedTaskStatuses?.includes(opt.value) ?? false;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.filterRow,
                      { borderColor: theme.border },
                      !isOff && { backgroundColor: opt.color + '15', borderColor: opt.color + '40' },
                      isOff && { opacity: 0.45 },
                    ]}
                    onPress={() => {
                      haptic.select();
                      const current = activeFilters.excludedTaskStatuses || [];
                      const updated = isOff
                        ? current.filter(s => s !== opt.value)
                        : [...current, opt.value];
                      setActiveFilters({ ...activeFilters, excludedTaskStatuses: updated.length > 0 ? updated : undefined });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.filterColorDot, { backgroundColor: isOff ? theme.textMuted : opt.color }]} />
                    <Text style={[styles.filterRowText, { color: isOff ? theme.textSecondary : theme.textPrimary }]}>
                      {opt.label}
                    </Text>
                    {!isOff && (
                      <Ionicons name="checkmark-circle" size={18} color={opt.color} style={{ marginLeft: 'auto' }} />
                    )}
                    {isOff && (
                      <Ionicons name="close-circle-outline" size={18} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          <Text style={[styles.filterSectionLabel, { color: theme.textSecondary }]}>Display</Text>
          <TouchableOpacity
            style={[
              styles.filterRow,
              { borderColor: theme.border, marginTop: 6 },
              showStatusChips && { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' },
            ]}
            onPress={() => { haptic.select(); onToggleStatusChips(); }}
            activeOpacity={0.7}
          >
            <View style={[styles.filterColorDot, { backgroundColor: showStatusChips ? theme.primary : theme.textMuted }]} />
            <Ionicons name="pricetag-outline" size={18} color={showStatusChips ? theme.primary : theme.textSecondary} />
            <Text style={[styles.filterRowText, { color: showStatusChips ? theme.textPrimary : theme.textSecondary }]}>
              Show status chips
            </Text>
            {showStatusChips && (
              <Ionicons name="checkmark-circle" size={18} color={theme.primary} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.sheetActions}>
          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => { haptic.select(); setActiveFilters({}); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>Clear all</Text>
            </TouchableOpacity>
          )}
          {canSaveFilters && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={onSaveFiltersToView}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Save to view</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => sheetRef.current?.dismiss()}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  sheetSubtitle: {
    fontSize: fontSize.bodySm,
    lineHeight: 18,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  filterColorDot: { width: 8, height: 8, borderRadius: radius.sm },
  filterRowText: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium },
  filterSectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
