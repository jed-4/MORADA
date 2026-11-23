import type { RefObject } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Layers } from 'lucide-react-native';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { haptic } from '../../lib/haptics';
import { metrics, size, type, useColors } from '../../theme';
import {
  Card, Checkbox, FieldHint, FieldLabel, ListRow, PrimaryButton, SecondaryButton, SheetBody, TextButton, ToggleRow,
} from '../kit';

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
  activeFilters: CalendarFilters;
  setActiveFilters: (filters: CalendarFilters) => void;
  activeFilterCount: number;
  taskStatusOptions: TaskStatusOption[];
  googleConnected: boolean;
  showStatusChips: boolean;
  onToggleStatusChips: () => void;
  canSaveFilters: boolean;
  onSaveFiltersToView: () => void;
  /** Saved views moved here from the old header button. */
  viewName?: string | null;
  onOpenViews?: () => void;
}

export function FilterSheet({
  sheetRef,
  activeFilters,
  setActiveFilters,
  activeFilterCount,
  taskStatusOptions,
  googleConnected,
  showStatusChips,
  onToggleStatusChips,
  canSaveFilters,
  onSaveFiltersToView,
  viewName,
  onOpenViews,
}: FilterSheetProps) {
  const c = useColors();
  const set = (next: CalendarFilters) => {
    haptic.select();
    setActiveFilters(next);
  };
  /** A tickable row: box on the left, label, optional colour dot on the right. */
  const tick = (key: string, label: string, on: boolean, onPress: () => void, dot?: string) => (
    <ListRow
      key={key}
      lead={<Checkbox checked={on} onPress={onPress} accessibilityLabel={label} />}
      title={label}
      titleLines={1}
      trailing={dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : undefined}
      onPress={onPress}
    />
  );
  const showSchedule = !activeFilters.eventTypes || activeFilters.eventTypes.includes('schedule');
  const showTasks = !activeFilters.eventTypes || activeFilters.eventTypes.includes('task');

  return (
    <Sheet
      ref={sheetRef}
      title="Filters"
      scrollable
      snapPoints={['85%']}
      footer={
        <>
          {activeFilterCount > 0 ? <TextButton label="Clear all" tone="muted" onPress={() => set({})} /> : null}
          {canSaveFilters ? <SecondaryButton label="Save to view" onPress={onSaveFiltersToView} /> : null}
          <PrimaryButton label="Done" onPress={() => sheetRef.current?.dismiss()} />
        </>
      }
    >
      <SheetBody>
        {onOpenViews ? (
          <Card variant="list">
            <ListRow
              key="views"
              lead={<Layers size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
              title="Saved view"
              titleLines={1}
              trailing={<Text style={[type.body, { color: c.muted }]} numberOfLines={1}>{viewName || 'None'}</Text>}
              chevron
              onPress={() => { haptic.select(); onOpenViews(); }}
            />
          </Card>
        ) : null}

        <View style={styles.group}>
          <FieldLabel>Show</FieldLabel>
          <Card variant="list">
            {EVENT_TYPE_OPTIONS.filter(opt => opt.value !== 'google_cal' || googleConnected).map(opt => {
              const on = activeFilters.eventTypes?.includes(opt.value) ?? false;
              return tick(opt.value, opt.label, on, () => {
                const current = activeFilters.eventTypes || [];
                const updated = on ? current.filter(t => t !== opt.value) : [...current, opt.value];
                set({ ...activeFilters, eventTypes: updated.length > 0 ? updated : undefined });
              });
            })}
          </Card>
          <FieldHint>Leave all off to show everything.</FieldHint>
        </View>

        <Card variant="list">
          {tick('mine', 'Assigned to me', !!activeFilters.assignedToMe, () =>
            set({ ...activeFilters, assignedToMe: activeFilters.assignedToMe ? undefined : true }))}
        </Card>

        {showSchedule ? (
          <View style={styles.group}>
            <FieldLabel>Schedule items</FieldLabel>
            <Card variant="list">
              {tick('sMe', 'Assigned to me', !!activeFilters.scheduleAssignedToMe, () =>
                set({ ...activeFilters, scheduleAssignedToMe: activeFilters.scheduleAssignedToMe ? undefined : true }))}
              {tick('sCo', 'Assigned to company', !!activeFilters.scheduleAssignedToCompany, () =>
                set({ ...activeFilters, scheduleAssignedToCompany: activeFilters.scheduleAssignedToCompany ? undefined : true }))}
              {tick('sParents', 'Show parent items', !activeFilters.hideScheduleParents, () =>
                set({ ...activeFilters, hideScheduleParents: activeFilters.hideScheduleParents ? undefined : true }))}
              {tick('sChildren', 'Show sub-items', !activeFilters.hideScheduleChildren, () =>
                set({ ...activeFilters, hideScheduleChildren: activeFilters.hideScheduleChildren ? undefined : true }))}
            </Card>
          </View>
        ) : null}

        {showTasks && taskStatusOptions.length > 0 ? (
          <View style={styles.group}>
            <FieldLabel>Task status</FieldLabel>
            <Card variant="list">
              {taskStatusOptions.map(opt => {
                const off = activeFilters.excludedTaskStatuses?.includes(opt.value) ?? false;
                return tick(opt.value, opt.label, !off, () => {
                  const current = activeFilters.excludedTaskStatuses || [];
                  const updated = off ? current.filter(x => x !== opt.value) : [...current, opt.value];
                  set({ ...activeFilters, excludedTaskStatuses: updated.length > 0 ? updated : undefined });
                }, opt.color);
              })}
            </Card>
          </View>
        ) : null}

        <Card variant="list">
          <ToggleRow
            key="chips"
            label="Show status chips"
            helper="On month view events"
            value={showStatusChips}
            onValueChange={() => { haptic.select(); onToggleStatusChips(); }}
          />
        </Card>
      </SheetBody>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: metrics.form.labelGap },
  dot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
});
