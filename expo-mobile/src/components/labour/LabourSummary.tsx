import { StyleSheet, Text, View } from 'react-native';
import { metrics, tabular, type, useColors } from '../../theme';
import { Card, ProgressLine } from '../kit';
import { fmtHours, isOverBudget } from '../../lib/labour';

/** "Used 47h of 214h · 167h left" + progress. Over budget: numbers and bar turn `danger`. */
export function LabourSummary({ used, budgeted }: { used: number; budgeted: number }) {
  const c = useColors();
  const over = isOverBudget(budgeted, used);
  const soft = over ? c.danger : c.muted;
  return (
    <Card>
      <View style={sx.summary}>
        <View style={sx.row}>
          <Text style={[type.meta, { color: c.muted }]}>Used</Text>
          <Text style={[type.heading, tabular, { color: over ? c.danger : c.text }]}>{fmtHours(used)}h</Text>
          <Text style={[type.body, tabular, { color: soft }]}>of {fmtHours(budgeted)}h</Text>
          <Text style={[type.body, tabular, sx.left, { color: soft }]}>
            {over ? `${fmtHours(used - budgeted)}h over` : `${fmtHours(budgeted - used)}h left`}
          </Text>
        </View>
        <ProgressLine value={budgeted > 0 ? used / budgeted : 0} over={over} />
      </View>
    </Card>
  );
}

const sx = StyleSheet.create({
  summary: { gap: metrics.labour.summaryGap },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: metrics.labour.summaryRowGap },
  left: { marginLeft: 'auto' },
});
