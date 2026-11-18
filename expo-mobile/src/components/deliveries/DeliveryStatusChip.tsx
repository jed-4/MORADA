import { StyleSheet, Text, View } from 'react-native';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { STATUS_LABEL, STATUS_TONE, type DeliveryStatus } from '../../lib/deliveries';

/** "Not delivered" / "Part delivered" / "Delivered" / "Issues" pill. */
export function DeliveryStatusChip({ status }: { status: DeliveryStatus }) {
  const theme = useTheme();
  const [fg, bg] = STATUS_TONE[status] ?? STATUS_TONE.none;
  return (
    <View style={[styles.chip, { backgroundColor: theme[bg] }]}>
      <Text style={[styles.text, { color: theme[fg] }]}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  text: { fontSize: fontSize.table, fontWeight: fontWeight.semibold },
});
