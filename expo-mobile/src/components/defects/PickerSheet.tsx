import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Plus, Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics, radii, size, space, type, useColors } from '../../theme';
import { Card, FieldHint, ListRow, SheetHeader } from '../kit';
import { haptic } from '../../lib/haptics';

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
}

interface PickerSheetProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected?: string | null;
  onSelect: (option: PickerOption | null) => void;
  onClose: () => void;
  /** Offer a "None" row that clears the value. */
  allowNone?: boolean;
  noneLabel?: string;
  /** Show a search box (on by default for more than 8 options). */
  searchable?: boolean;
  /**
   * Inline add: shows "Add “typed text”" when the search has no exact match.
   * Resolve with the new option (it is then selected) or throw to show why.
   */
  onAdd?: (text: string) => Promise<PickerOption>;
  addHint?: string;
}

/**
 * A pick-one list in a native page sheet. A plain RN Modal rather than the
 * app's gorhom <Sheet> on purpose: it also opens from inside another modal
 * (the defect Edit form), where a gorhom sheet would render underneath.
 */
export function PickerSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  allowNone,
  noneLabel = 'None',
  searchable,
  onAdd,
  addHint,
}: PickerSheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const showSearch = searchable ?? (options.length > 8 || !!onAdd);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, query]);

  const exact = options.some((o) => o.label.trim().toLowerCase() === query.trim().toLowerCase());
  const canAdd = !!onAdd && query.trim().length > 0 && !exact;

  const close = () => {
    setQuery('');
    setAddError(null);
    onClose();
  };

  const pick = (o: PickerOption | null) => {
    haptic.select();
    setQuery('');
    setAddError(null);
    onSelect(o);
  };

  const add = async () => {
    if (!onAdd) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await onAdd(query.trim());
      haptic.success();
      pick(created);
    } catch (err: any) {
      haptic.error();
      setAddError(err?.message || "Couldn't add it.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={[styles.screen, { backgroundColor: c.bg, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <SheetHeader title={title} onDone={close} />
        </View>

        {showSearch && (
          <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Search size={metrics.projects.searchIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
            <TextInput
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                setAddError(null);
              }}
              placeholder={onAdd ? 'Search or add' : 'Search'}
              placeholderTextColor={c.faint}
              style={[type.body, styles.searchInput, { color: c.text }]}
              autoCorrect={false}
              returnKeyType={canAdd ? 'done' : 'search'}
              onSubmitEditing={() => {
                if (canAdd) add();
              }}
              clearButtonMode="while-editing"
            />
          </View>
        )}
        {onAdd && addHint && !query ? <View style={styles.hint}><FieldHint>{addHint}</FieldHint></View> : null}

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          {addError ? <FieldHint tone="danger">{addError}</FieldHint> : null}
          {canAdd || (allowNone && !query) || filtered.length > 0 ? (
            <Card variant="list">
              {canAdd ? (
                <ListRow
                  key="__add"
                  lead={adding ? <ActivityIndicator size="small" color={c.accent} /> : <Plus size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStroke} />}
                  title={`Add “${query.trim()}”`}
                  onPress={adding ? undefined : add}
                />
              ) : null}
              {allowNone && !query ? (
                <ListRow
                  key="__none"
                  title={noneLabel}
                  trailing={!selected ? <Check size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                  onPress={() => pick(null)}
                />
              ) : null}
              {filtered.map((item) => {
                const active = item.value === selected;
                return (
                  <ListRow
                    key={item.value}
                    title={item.label}
                    subtitle={item.hint}
                    selected={active}
                    trailing={active ? <Check size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                    onPress={() => pick(item)}
                  />
                );
              })}
            </Card>
          ) : (
            <Text style={[type.body, styles.empty, { color: c.muted }]}>
              {query ? 'Nothing matches.' : 'Nothing to choose from yet.'}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: space.screenX, paddingTop: metrics.sheet.grabberTop },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    marginHorizontal: space.screenX,
    marginBottom: space.inline,
    paddingHorizontal: metrics.projects.cardPad,
    minHeight: metrics.projects.searchHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  hint: { marginHorizontal: space.screenX, marginBottom: space.inline },
  list: { paddingHorizontal: space.screenX, paddingTop: space.inline, paddingBottom: space.screenBottom, gap: space.inline },
  empty: { textAlign: 'center', paddingTop: space.screenBottom },
});
