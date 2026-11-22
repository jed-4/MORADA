import { Text, View } from 'react-native';
import { metrics, radii, size, tabular, type, useColors } from '../../theme';

interface ProgressLineProps {
  /** 0 → 1. Clamped. */
  value: number;
  /** Over budget: whole bar turns `danger`. */
  over?: boolean;
  /** Label row above ("4 of 18 done"). */
  label?: string;
  /** Right side of the label row ("22%"). */
  rightLabel?: string;
  /** Inline caption to the left of the line ("28 of 58"). */
  inlineLabel?: string;
}

export function ProgressLine({ value, over, label, rightLabel, inlineLabel }: ProgressLineProps) {
  const c = useColors();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const line = (
    <View style={{ flex: inlineLabel ? 1 : undefined, height: size.progress, borderRadius: radii.xs, backgroundColor: over ? c.danger : c.track, overflow: 'hidden' }}>
      {over ? null : <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: c.accent, borderRadius: radii.xs }} />}
    </View>
  );

  if (inlineLabel) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.progress.inlineGap }}>
        <Text style={[type.caption, tabular, { color: c.muted, width: metrics.progress.inlineLabelWidth }]}>{inlineLabel}</Text>
        {line}
      </View>
    );
  }
  if (!label && !rightLabel) return line;
  return (
    <View style={{ gap: metrics.progress.labelGap }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[type.meta, tabular, { color: c.muted }]}>{label}</Text>
        {rightLabel ? <Text style={[type.meta, tabular, { color: c.muted }]}>{rightLabel}</Text> : null}
      </View>
      {line}
    </View>
  );
}
