import { StyleSheet, Text, View } from 'react-native';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { STATE_LABEL, type SelectionState } from '../../lib/selections';

/**
 * Compact state pill for a selection row. Deliberately quiet — on the spec
 * sheet most rows are approved, so the pill only has to earn attention when
 * something ISN'T settled.
 */
export default function StatusPill({ state }: { state: SelectionState }) {
  const theme = useTheme();

  const palette: Record<SelectionState, { bg: string; fg: string }> = {
    approved: { bg: theme.statusSuccessBg, fg: theme.statusSuccess },
    received: { bg: theme.statusSuccessBg, fg: theme.statusSuccess },
    ordered: { bg: theme.statusInfoBg, fg: theme.statusInfo },
    awaiting: { bg: theme.statusWarningBg, fg: theme.statusWarning },
    open: { bg: theme.subtle, fg: theme.textSecondary },
  };
  const { bg, fg } = palette[state];

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{STATE_LABEL[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-end',
  },
  text: {
    fontSize: fontSize.label,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
