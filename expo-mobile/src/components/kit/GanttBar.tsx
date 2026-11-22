import { Text, View } from 'react-native';
import { useColorScheme } from 'react-native';
import { metrics, projectTint, radii, tabular, type, useColors } from '../../theme';

export type Trade = 'slate' | 'blue' | 'teal' | 'leave';

/** Schedule Gantt bar: trade tint + 3dp strip; date label inside when it fits, else after. */
export function GanttBar({ trade = 'slate', color, width, label }: { trade?: Trade; /** Item colour: tint fill + full-colour strip. Overrides `trade`. */ color?: string | null; width: number; label?: string | null }) {
  const c = useColors();
  const dark = useColorScheme() === 'dark';
  const t = color
    ? { fill: projectTint(color, dark ? metrics.calendarBlock.tintDark : metrics.calendarBlock.tint, c.bg), strip: color }
    : c.trade[trade];
  const m = metrics.ganttBar;
  const inside = !!label && width >= m.minLabelWidth;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width, height: m.height, borderRadius: radii.squareMd, backgroundColor: t.fill, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: m.strip, alignSelf: 'stretch', backgroundColor: t.strip }} />
        {inside ? (
          <Text numberOfLines={1} style={[type.tiny, tabular, { color: c.muted, paddingHorizontal: m.labelPadX }]}>
            {label}
          </Text>
        ) : null}
      </View>
      {label && !inside ? <Text style={[type.tiny, tabular, { color: c.muted, paddingLeft: m.labelPadX }]}>{label}</Text> : null}
    </View>
  );
}

/** "25 ›" / "3 Dec ›" at the right edge for items outside the visible range. */
export function GanttOverflow({ label }: { label: string }) {
  const c = useColors();
  return <Text style={[type.tiny, tabular, { color: c.muted }]}>{`${label} ›`}</Text>;
}
