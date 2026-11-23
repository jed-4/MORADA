import { useState, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Check, Plus, X } from 'lucide-react-native';
import { metrics, size, space, tabular, type, useColors } from '../../theme';
import { fromLocalDateStr, toLocalDateStr } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { Card, Checkbox, FieldLabel, ListRow, PropertyRow, TextButton, TextField } from '../kit';
import { PRIORITY_LABELS } from './TaskDetail';

// One task form for New task and Edit task, in My tasks and a project's Tasks.
// Presentation only: every value and setter belongs to the screen.

export const TASK_PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

export interface TaskStatusChoice {
  key: string;
  name: string;
  color?: string | null;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

interface TaskFormProps {
  /** Inside a gorhom bottom sheet: fields use the sheet's own input. */
  inSheet?: boolean;
  isDark?: boolean;
  title: string;
  onTitle: (v: string) => void;
  titleAutoFocus?: boolean;
  status: string;
  statusOptions: TaskStatusChoice[];
  onStatus: (key: string) => void;
  priority: string;
  onPriority: (key: string) => void;
  /** YYYY-MM-DD, or '' for none. */
  dueDate: string;
  onDueDate: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  descriptionLabel?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descRef?: Ref<any>;
  /** Omit to hide the checklist editor. */
  checklist?: TaskChecklistItem[];
  onChecklist?: (items: TaskChecklistItem[]) => void;
  /** Keyboard-aware scroll: scroll the focused field into view. */
  onInputFocus?: () => void;
}

type Open = 'status' | 'priority' | 'date' | null;

export function TaskForm({
  inSheet,
  isDark,
  title,
  onTitle,
  titleAutoFocus,
  status,
  statusOptions,
  onStatus,
  priority,
  onPriority,
  dueDate,
  onDueDate,
  description,
  onDescription,
  descriptionLabel = 'Description',
  descRef,
  checklist,
  onChecklist,
  onInputFocus,
}: TaskFormProps) {
  const c = useColors();
  const [open, setOpen] = useState<Open>(null);
  const [newItem, setNewItem] = useState('');
  const toggle = (which: Open) => {
    haptic.select();
    setOpen(open === which ? null : which);
  };
  const statusOpt = statusOptions.find(o => o.key === status);
  const dot = (color?: string | null) => <View style={[fx.dot, { backgroundColor: color || c.status.upcoming }]} />;
  const tick = <Check size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStrokeActive} />;

  const addItem = () => {
    const text = newItem.trim();
    if (!text || !checklist || !onChecklist) return;
    onChecklist([...checklist, { id: Date.now().toString(), text, completed: false }]);
    setNewItem('');
  };

  return (
    <View style={fx.form}>
      <TextField
        inSheet={inSheet}
        value={title}
        onChangeText={onTitle}
        placeholder="Task title"
        autoFocus={titleAutoFocus}
        autoCapitalize="sentences"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => (descRef as { current?: { focus?: () => void } } | null)?.current?.focus?.()}
        onFocus={onInputFocus}
        accessibilityLabel="Task title"
      />

      <Card variant="list">
        <PropertyRow key="status" form label="Status" onPress={() => toggle('status')}>
          <View style={fx.value}>
            {dot(statusOpt?.color)}
            <Text style={[type.rowTitle, { color: c.text }]} numberOfLines={1}>{statusOpt?.name ?? status}</Text>
          </View>
        </PropertyRow>
        {open === 'status'
          ? statusOptions.map(o => (
              <ListRow
                key={`s:${o.key}`}
                lead={dot(o.color)}
                title={o.name}
                titleLines={1}
                selected={o.key === status}
                trailing={o.key === status ? tick : undefined}
                onPress={() => { haptic.select(); onStatus(o.key); setOpen(null); }}
              />
            ))
          : null}
        <PropertyRow key="priority" form label="Priority" value={PRIORITY_LABELS[priority] || priority} onPress={() => toggle('priority')} />
        {open === 'priority'
          ? TASK_PRIORITY_ORDER.map(p => (
              <ListRow
                key={`p:${p}`}
                title={PRIORITY_LABELS[p]}
                titleLines={1}
                selected={p === priority}
                trailing={p === priority ? tick : undefined}
                onPress={() => { haptic.select(); onPriority(p); setOpen(null); }}
              />
            ))
          : null}
        <PropertyRow
          key="due"
          form
          label="Due date"
          value={dueDate ? fromLocalDateStr(dueDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : undefined}
          placeholder="No due date"
          onPress={() => toggle('date')}
        />
        {open === 'date' ? (
          <View key="datePicker">
            <DateTimePicker
              value={dueDate ? fromLocalDateStr(dueDate) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              themeVariant={isDark ? 'dark' : 'light'}
              accentColor={c.accent}
              onChange={(_event, date) => {
                if (Platform.OS === 'android') setOpen(null);
                if (date) onDueDate(toLocalDateStr(date));
              }}
            />
            {dueDate ? <TextButton label="Clear due date" tone="muted" center onPress={() => { onDueDate(''); setOpen(null); }} /> : null}
          </View>
        ) : null}
      </Card>

      <View style={fx.group}>
        <FieldLabel>{descriptionLabel}</FieldLabel>
        <TextField
          inSheet={inSheet}
          multilineBox
          ref={descRef}
          value={description}
          onChangeText={onDescription}
          placeholder="Add a description"
          autoCapitalize="sentences"
          onFocus={onInputFocus}
          accessibilityLabel={descriptionLabel}
        />
      </View>

      {checklist && onChecklist ? (
        <View style={fx.group}>
          <View style={fx.labelRow}>
            <FieldLabel>Checklist</FieldLabel>
            {checklist.length > 0 ? (
              <Text style={[type.meta, tabular, { color: c.muted }]}>
                {`${checklist.filter(i => i.completed).length}/${checklist.length}`}
              </Text>
            ) : null}
          </View>
          {checklist.length > 0 ? (
            <Card variant="list">
              {checklist.map((item, idx) => (
                <View key={item.id} style={fx.itemRow}>
                  <Checkbox
                    checked={item.completed}
                    onPress={() => onChecklist(checklist.map((it, i) => (i === idx ? { ...it, completed: !it.completed } : it)))}
                    accessibilityLabel={item.text}
                  />
                  <Text
                    style={[type.rowTitle, fx.itemText, { color: item.completed ? c.muted : c.text }, item.completed && fx.strike]}
                    numberOfLines={3}
                  >
                    {item.text}
                  </Text>
                  <Pressable
                    onPress={() => onChecklist(checklist.filter((_, i) => i !== idx))}
                    hitSlop={metrics.hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.text}`}
                  >
                    <X size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} />
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
          <View style={fx.addRow}>
            <View style={fx.flex}>
              <TextField
                inSheet={inSheet}
                value={newItem}
                onChangeText={setNewItem}
                placeholder="Add an item"
                autoCapitalize="sentences"
                // Keep the keyboard up to add the next item.
                submitBehavior="submit"
                returnKeyType="done"
                onSubmitEditing={addItem}
                onFocus={onInputFocus}
                accessibilityLabel="New checklist item"
              />
            </View>
            <Pressable
              onPress={addItem}
              disabled={!newItem.trim()}
              hitSlop={metrics.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Add item"
              style={({ pressed }) => [fx.addBtn, { opacity: !newItem.trim() ? metrics.disabledOpacity : pressed ? metrics.pressedOpacity : 1 }]}
            >
              <Plus size={size.icon.header} color={c.accent} strokeWidth={metrics.iconStroke} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const fx = StyleSheet.create({
  form: { gap: metrics.sheet.gap },
  group: { gap: metrics.form.labelGap },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { flexDirection: 'row', alignItems: 'center', gap: metrics.statusDot.gap, flexShrink: 1 },
  dot: { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, paddingVertical: metrics.listRow.padY },
  itemText: { flex: 1 },
  strike: { textDecorationLine: 'line-through' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  flex: { flex: 1 },
  addBtn: { minWidth: metrics.minHit, minHeight: metrics.minHit, alignItems: 'center', justifyContent: 'center' },
});
