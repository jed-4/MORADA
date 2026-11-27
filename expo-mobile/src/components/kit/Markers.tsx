import { Text, View } from 'react-native';
import { metrics, size, tabular, type, useColors } from '../../theme';

/** Chat day divider: line · label · line. */
export function DayDivider({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.divider.gap }}>
      <View style={{ flex: 1, height: size.border, backgroundColor: c.border }} />
      <Text style={[type.caption, { color: c.muted }]}>{label}</Text>
      <View style={{ flex: 1, height: size.border, backgroundColor: c.border }} />
    </View>
  );
}

/** Schedule list: "Today · Sat 21" then a faint accent line to the edge. */
export function TodayMarker({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.gap }}>
      <Text style={[type.micro, tabular, { color: c.accent }]}>{label}</Text>
      <View style={{ flex: 1, height: size.border, backgroundColor: c.accentLine }} />
    </View>
  );
}

/**
 * Calendar now-line. Position it absolutely at the current time's y. The dot
 * + 2dp line run across today's column; `faint` draws the 1dp line used across
 * the other days in week view.
 */
export function NowLine({ label, faint, gutter = 0 }: { label?: string; faint?: boolean; gutter?: number }) {
  const c = useColors();
  const d = metrics.divider;
  if (faint) return <View style={{ height: size.border, backgroundColor: c.accentLine }} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {gutter ? (
        <View style={{ width: gutter }}>
          {label ? <Text style={[type.tiny, tabular, { color: c.accent }]}>{label}</Text> : null}
        </View>
      ) : null}
      <View style={{ width: d.nowDot, height: d.nowDot, borderRadius: d.nowDot / 2, backgroundColor: c.accent, marginRight: -d.nowDot / 2, zIndex: 1 }} />
      <View style={{ flex: 1, height: d.nowLine, backgroundColor: c.accent }} />
    </View>
  );
}
