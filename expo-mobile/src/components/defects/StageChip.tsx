import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { STAGE_LABEL, STAGE_TONE, type DefectStage } from '../../lib/defects';

/** Coloured pill for a defect's stage. */
export function StageChip({ stage, style, small }: { stage: DefectStage; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const theme = useTheme() as Record<string, any>;
  const [fg, bg] = STAGE_TONE[stage] ?? STAGE_TONE.open;
  return (
    <View style={[styles.chip, small && styles.small, { backgroundColor: theme[bg] }, style]}>
      <Text style={[styles.text, small && styles.smallText, { color: theme[fg] }]} numberOfLines={1}>
        {STAGE_LABEL[stage] ?? stage}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  small: { paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  smallText: { fontSize: fontSize.table },
});
