import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
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
  const theme = useTheme();
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
      <View style={[styles.screen, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
          <Pressable onPress={close} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={[styles.closeText, { color: theme.primary }]}>Done</Text>
          </Pressable>
        </View>

        {showSearch && (
          <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <TextInput
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                setAddError(null);
              }}
              placeholder={onAdd ? 'Search or add' : 'Search'}
              placeholderTextColor={theme.textMuted}
              style={[styles.searchInput, { color: theme.textPrimary }]}
              autoCorrect={false}
              returnKeyType={canAdd ? 'done' : 'search'}
              onSubmitEditing={() => {
                if (canAdd) add();
              }}
              clearButtonMode="while-editing"
            />
          </View>
        )}
        {onAdd && addHint && !query ? (
          <Text style={[styles.hint, { color: theme.textMuted }]}>{addHint}</Text>
        ) : null}

        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {canAdd && (
                <Pressable
                  onPress={add}
                  disabled={adding}
                  style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
                  accessibilityRole="button"
                >
                  {adding ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
                  )}
                  <Text style={[styles.rowLabel, { color: theme.primary }]} numberOfLines={2}>
                    Add “{query.trim()}”
                  </Text>
                </Pressable>
              )}
              {addError ? <Text style={[styles.error, { color: theme.statusDanger }]}>{addError}</Text> : null}
              {allowNone && !query && (
                <Pressable
                  onPress={() => pick(null)}
                  style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{noneLabel}</Text>
                  {!selected && <Ionicons name="checkmark" size={20} color={theme.primary} />}
                </Pressable>
              )}
            </>
          }
          renderItem={({ item }) => {
            const active = item.value === selected;
            return (
              <Pressable
                onPress={() => pick(item)}
                style={[
                  styles.row,
                  { backgroundColor: theme.card, borderColor: active ? theme.primary : theme.border },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.textPrimary }]} numberOfLines={2}>
                    {item.label}
                  </Text>
                  {item.hint ? (
                    <Text style={[styles.rowHint, { color: theme.textMuted }]} numberOfLines={1}>
                      {item.hint}
                    </Text>
                  ) : null}
                </View>
                {active && <Ionicons name="checkmark" size={20} color={theme.primary} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            !canAdd ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>
                {query ? 'Nothing matches.' : 'Nothing to choose from yet.'}
              </Text>
            ) : undefined
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  closeBtn: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  closeText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    marginBottom: 6,
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, paddingVertical: 8 },
  hint: { fontSize: fontSize.xs, marginHorizontal: 16, marginBottom: 4 },
  list: { padding: 14, gap: 8, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.medium },
  rowHint: { fontSize: fontSize.xs, marginTop: 2 },
  error: { fontSize: fontSize.sm, marginBottom: 4 },
  empty: { textAlign: 'center', marginTop: 30, fontSize: fontSize.sm },
});
