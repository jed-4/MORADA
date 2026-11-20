import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { haptic } from '../../lib/haptics';
import { fromLocalDateStr, toLocalDateStr } from '../../lib/dates';
import {
  JOB_STAGES,
  JOB_STAGE_LABEL,
  addLocationPath,
  defaultDueDate,
  sortLocations,
  userName,
  type DefectRefs,
  type JobStage,
} from '../../lib/defects';
import { PickerSheet, type PickerOption } from './PickerSheet';

/** The defect fields the capture and Edit forms share. */
export interface DefectFieldValues {
  locationId: string | null;
  /** Display text: the location's path, or free text when offline. */
  location: string;
  trade: string | null;
  jobStage: JobStage;
  ownerUserId: string | null;
  ownerName: string | null;
  /** YYYY-MM-DD */
  dueDate: string;
  /** True once the person picked a date themselves (then a job stage change leaves it alone). */
  dueDateSet: boolean;
}

/** Option value prefix for a location typed with no signal: kept as text only. */
const TEXT_ONLY = 'text:';

type PickerKey ='location' | 'trade' | 'jobStage' | 'owner' | null;

interface Props {
  projectId: string;
  value: DefectFieldValues;
  onChange: (patch: Partial<DefectFieldValues>) => void;
  refs: DefectRefs;
  onRefsChange: (refs: DefectRefs) => void;
  /** Show the sticky pin hint (capture). */
  sticky?: boolean;
}

const formatDue = (s: string) =>
  s
    ? fromLocalDateStr(s).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : 'No due date';

/**
 * Location / trade / job stage / owner / due date rows, each opening a picker.
 * Changing the job stage moves the due date to that stage's default unless a
 * date was picked by hand.
 */
export function DefectFieldRows({ projectId, value, onChange, refs, onRefsChange, sticky }: Props) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const [picker, setPicker] = useState<PickerKey>(null);
  const [showDate, setShowDate] = useState(false);

  const locationOptions: PickerOption[] = useMemo(
    () => refs.locations.map((l) => ({ value: l.id, label: l.path || l.name })),
    [refs.locations],
  );
  const tradeOptions: PickerOption[] = useMemo(
    () => refs.trades.map((t) => ({ value: t.key, label: t.name })),
    [refs.trades],
  );
  const jobStageOptions: PickerOption[] = JOB_STAGES.map((s) => ({ value: s, label: JOB_STAGE_LABEL[s] }));
  const ownerOptions: PickerOption[] = useMemo(
    () => refs.users.map((u) => ({ value: u.id, label: userName(u) })),
    [refs.users],
  );

  const tradeName = refs.trades.find((t) => t.key === value.trade)?.name ?? value.trade ?? '';

  const rows: { key: Exclude<PickerKey, null>; icon: keyof typeof Ionicons.glyphMap; label: string; text: string }[] = [
    { key: 'location', icon: 'location-outline', label: 'Location', text: value.location },
    { key: 'trade', icon: 'construct-outline', label: 'Trade', text: tradeName },
    { key: 'jobStage', icon: 'flag-outline', label: 'Job stage', text: JOB_STAGE_LABEL[value.jobStage] },
    { key: 'owner', icon: 'person-outline', label: 'Owner', text: value.ownerName || '' },
  ];

  const addLocation = async (text: string): Promise<PickerOption> => {
    try {
      const { created, leaf } = await addLocationPath(projectId, text, refs.locations);
      if (created.length) onRefsChange({ ...refs, locations: sortLocations([...refs.locations, ...created]) });
      return { value: leaf.id, label: leaf.path || leaf.name };
    } catch (err: any) {
      // No signal: keep the words as the location text; it can be linked to
      // a saved location later from the web.
      if (!err?.status) return { value: `${TEXT_ONLY}${text}`, label: text };
      throw err;
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {rows.map((row, i) => (
        <Pressable
          key={row.key}
          onPress={() => {
            haptic.light();
            setPicker(row.key);
          }}
          style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}: ${row.text || 'not set'}`}
        >
          <Ionicons name={row.icon} size={18} color={theme.textMuted} />
          <Text style={[styles.label, { color: theme.textSecondary }]}>{row.label}</Text>
          <Text
            style={[styles.value, { color: row.text ? theme.textPrimary : theme.textMuted }]}
            numberOfLines={1}
          >
            {row.text || 'Choose'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      ))}
      <Pressable
        onPress={() => {
          haptic.light();
          setShowDate((v) => !v);
        }}
        style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
        accessibilityRole="button"
        accessibilityLabel={`Due date: ${formatDue(value.dueDate)}`}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
        <Text style={[styles.label, { color: theme.textSecondary }]}>Due</Text>
        <Text style={[styles.value, { color: theme.textPrimary }]} numberOfLines={1}>
          {formatDue(value.dueDate)}
          {!value.dueDateSet ? '  (default)' : ''}
        </Text>
        <Ionicons name={showDate ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
      </Pressable>
      {showDate && (
        <View style={styles.datePicker}>
          <DateTimePicker
            value={value.dueDate ? fromLocalDateStr(value.dueDate) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            themeVariant={isDark ? 'dark' : 'light'}
            onChange={(_e, date) => {
              if (Platform.OS === 'android') setShowDate(false);
              if (date) onChange({ dueDate: toLocalDateStr(date), dueDateSet: true });
            }}
          />
          {value.dueDateSet && (
            <Pressable
              onPress={() => onChange({ dueDate: defaultDueDate(value.jobStage), dueDateSet: false })}
              style={styles.resetDate}
              accessibilityRole="button"
            >
              <Text style={[styles.resetText, { color: theme.primary }]}>Use the {JOB_STAGE_LABEL[value.jobStage].toLowerCase()} default</Text>
            </Pressable>
          )}
        </View>
      )}
      {sticky ? (
        <Text style={[styles.stickyHint, { color: theme.textMuted, borderTopColor: theme.border }]}>
          These stay set for the next defect.
        </Text>
      ) : null}

      <PickerSheet
        visible={picker === 'location'}
        title="Location"
        options={locationOptions}
        selected={value.locationId}
        allowNone
        onAdd={addLocation}
        addHint="Add a new one by typing it. Use › or > for levels, e.g. Level 1 > Kitchen."
        onSelect={(o) => {
          const textOnly = !!o?.value.startsWith(TEXT_ONLY);
          onChange({ locationId: o && !textOnly ? o.value : null, location: o?.label ?? '' });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'trade'}
        title="Trade"
        options={tradeOptions}
        selected={value.trade}
        allowNone
        onSelect={(o) => {
          onChange({ trade: o?.value ?? null });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'jobStage'}
        title="Job stage"
        options={jobStageOptions}
        selected={value.jobStage}
        searchable={false}
        onSelect={(o) => {
          if (o) {
            const jobStage = o.value as JobStage;
            onChange(value.dueDateSet ? { jobStage } : { jobStage, dueDate: defaultDueDate(jobStage) });
          }
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'owner'}
        title="Owner"
        options={ownerOptions}
        selected={value.ownerUserId}
        allowNone
        noneLabel="No owner"
        onSelect={(o) => {
          onChange({ ownerUserId: o?.value ?? null, ownerName: o?.label ?? null });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xxl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14 },
  label: { width: 78, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  value: { flex: 1, fontSize: fontSize.base, textAlign: 'right' },
  datePicker: { paddingHorizontal: 8, paddingBottom: 8 },
  resetDate: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  stickyHint: {
    fontSize: fontSize.xs,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
